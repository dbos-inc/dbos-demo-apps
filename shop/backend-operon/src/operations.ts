import { TransactionContext, WorkflowContext, Operon, CommunicatorContext, OperonWorkflow, OperonTransaction, OperonCommunicator } from 'operon';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', { apiVersion: '2023-08-16' });
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const checkout_url_topic = "stripe_checkout_url";
const checkout_complete_topic = "stripe_checkout_complete";

export async function initShopOperations(): Promise<ShopOperations> {

  const operon: Operon = new Operon();
  operon.useNodePostgres();
  await operon.init($ShopOperations);

  return {
    destroy() { return operon.destroy(); },

    getCart(username) { return operon.transaction($ShopOperations.getCart, {}, username); },
    addToCart(username, product_id) { return operon.transaction($ShopOperations.addToCart, {}, username, product_id); },
    clearCart(username) { return operon.transaction($ShopOperations.clearCart, {}, username); },
    getProducts() { return operon.transaction($ShopOperations.getProducts, {}); },
    getProduct(id) { return operon.transaction($ShopOperations.getProduct, {}, id); },

    async runPaymentWorkflow(username, origin, workflowUUID?: string) {
      const handle = operon.workflow($ShopOperations.paymentWorkflow, { workflowUUID }, username, origin);
      workflowUUID = handle.getWorkflowUUID();
      return await operon.getEvent<string | null>(workflowUUID, checkout_url_topic);
    },

    async stripeWebhook(sigHeader, payload) {
      const event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
      if (event.type === 'checkout.session.completed') {
        const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
        if (session.client_reference_id !== null) {
          const uuid: string = session.client_reference_id;
          await operon.send({}, uuid, "checkout.session.completed", checkout_complete_topic);
        }
      }
    },
  };
}

export interface ShopOperations {
  clearCart(username: string): Promise<void>;
  getCart(username: string): Promise<DisplayPriceProduct[]>;
  addToCart(username: string, product_id: string): Promise<void>;
  getProduct(id: number): Promise<DisplayPriceProduct | null>;
  getProducts(): Promise<DisplayPriceProduct[]>;
  runPaymentWorkflow(username: string, origin: string, workflowUUID?: string): Promise<string | null>;
  stripeWebhook(sigHeader: string, payload: string): Promise<void>;
  destroy(): Promise<void>;
}

// domain objects

const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

interface Product {
  product_id: number,
  product: string,
  description: string,
  image_name: string,
  price: number,
  inventory: number,
}

interface DisplayPriceProduct extends Product {
  display_price: string;
}

// Transactions

class $ShopOperations {

  @OperonTransaction({ readOnly: true })
  static async getProducts(this: void, ctxt: TransactionContext): Promise<DisplayPriceProduct[]> {
    const { rows } = await ctxt.pgClient.query<Product>('SELECT product_id, product, description, image_name, price FROM products');
    const formattedRows: DisplayPriceProduct[] = rows.map((row) => ({
      ...row,
      display_price: (row.price / 100).toFixed(2),
    }));

    return formattedRows;
  }

  @OperonTransaction({ readOnly: true })
  static async getProduct(this: void, ctxt: TransactionContext, id: number): Promise<DisplayPriceProduct | null> {
    const { rows } = await ctxt.pgClient.query<Product>(`SELECT product_id, product, description, image_name, price FROM products WHERE product_id = $1`, [id]);
    if (rows.length === 0) {
      return null;
    }
    const product: DisplayPriceProduct = {
      ...rows[0],
      display_price: (rows[0].price / 100).toFixed(2),
    };
    return product;
  }

  @OperonTransaction()
  static async addToCart(this: void, ctxt: TransactionContext, username: string, product_id: string) {
    await ctxt.pgClient.query(`INSERT INTO cart VALUES($1, $2, 1) ON CONFLICT (username, product_id) DO UPDATE SET quantity = cart.quantity + 1`, [username, product_id]);
  }

  @OperonTransaction({ readOnly: true })
  static async getCart(this: void, ctxt: TransactionContext, username: string): Promise<DisplayPriceProduct[]> {
    const { rows } = await ctxt.pgClient.query<{ product_id: number, quantity: number }>(`SELECT product_id, quantity FROM cart WHERE username=$1`, [username]);
    const productDetails = await Promise.all(rows.map(async (row) => ({
      ...(await $ShopOperations.getProduct(ctxt, row.product_id))!,
      inventory: row.quantity,
    })));
    return productDetails;
  }

  @OperonTransaction()
  static async clearCart(this: void, ctxt: TransactionContext, username: string) {
    await ctxt.pgClient.query(`DELETE FROM cart WHERE username=$1`, [username]);
  }

  @OperonTransaction()
  static async subtractInventory(this: void, ctxt: TransactionContext, products: Product[]): Promise<boolean> {
    let hasEnoughInventory = true;
    for (const product of products) {
      const { rows } = await ctxt.pgClient.query<Product>(`SELECT inventory FROM products WHERE product_id = $1`, [product.product_id]);
      const currentInventory = rows[0]?.inventory;

      if (currentInventory < product.inventory) {
        hasEnoughInventory = false;
        break;
      }
    }
    if (hasEnoughInventory) {
      // If all products have enough inventory, subtract the inventory from the products in the database
      for (const product of products) {
        await ctxt.pgClient.query(`UPDATE products SET inventory = inventory - $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
      }
    }
    return hasEnoughInventory;
  }

  @OperonTransaction()
  static async undoSubtractInventory(this: void, ctxt: TransactionContext, products: Product[]) {
    for (const product of products) {
      await ctxt.pgClient.query(`UPDATE products SET inventory = inventory + $1 WHERE product_id = $2`, [product.inventory, product.product_id]);
    }
  }

  @OperonTransaction()
  static async createOrder(this: void, ctxt: TransactionContext, username: string, productDetails: Product[]): Promise<number> {
    const { rows } = await ctxt.pgClient.query<{ order_id: number }>(`INSERT INTO orders(username, order_status, last_update_time) VALUES ($1, $2, $3) RETURNING order_id`,
      [username, OrderStatus.PENDING, 0]);
    const orderID = rows[0].order_id;
    for (const product of productDetails) {
      await ctxt.pgClient.query(`INSERT INTO order_items(order_id, product_id, price, quantity) VALUES($1, $2, $3, $4)`,
        [orderID, product.product_id, product.price, product.inventory]);
    }
    return orderID;
  }

  @OperonTransaction()
  static async fulfillOrder(this: void, ctxt: TransactionContext, orderID: number) {
    await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.FULFILLED, orderID]);
  }

  @OperonTransaction()
  static async errorOrder(this: void, ctxt: TransactionContext, orderID: number) {
    await ctxt.pgClient.query(`UPDATE orders SET order_status=$1 WHERE order_id=$2`, [OrderStatus.CANCELLED, orderID]);
  }

  @OperonCommunicator()
  static async createStripeSession(this: void, _ctxt: CommunicatorContext, uuid: string, productDetails: Product[], origin: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    const lineItems = productDetails.map((item) => ({
      quantity: item.inventory,
      price_data: {
        currency: "usd",
        unit_amount: item.price,
        product_data: {
          name: item.product,
        }
      }
    }));
    return await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: 'payment',
      client_reference_id: uuid,
      success_url: `${origin}/checkout/success`,
      cancel_url: `${origin}/checkout/cancel`,
    });
  }

  @OperonCommunicator()
  static async retrieveStripeSession(this: void, _ctxt: CommunicatorContext, sessionID: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    const session = await stripe.checkout.sessions.retrieve(sessionID);
    try {
      await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
    } catch (err) {
      // Session was already expired.
    }
    return session;
  }

  @OperonWorkflow()
  static async paymentWorkflow(this: void, ctxt: WorkflowContext, username: string, origin: string) {

    const productDetails = await ctxt.transaction($ShopOperations.getCart, username);
    if (productDetails.length === 0) {
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    const orderID = await ctxt.transaction($ShopOperations.createOrder, username, productDetails);

    const valid: boolean = await ctxt.transaction($ShopOperations.subtractInventory, productDetails);
    if (!valid) {
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    const stripeSession = await ctxt.external($ShopOperations.createStripeSession, ctxt.workflowUUID, productDetails, origin);
    if (!stripeSession?.url) {
      await ctxt.transaction($ShopOperations.undoSubtractInventory, productDetails);
      await ctxt.setEvent(checkout_url_topic, null);
      return;
    }

    await ctxt.setEvent(checkout_url_topic, stripeSession.url);
    const notification = await ctxt.recv<string>(checkout_complete_topic, 60);

    // if the checkout complete notification arrived, the payment is successful so fulfull the order
    if (notification) {
      await ctxt.transaction($ShopOperations.fulfillOrder, orderID);
      await ctxt.transaction($ShopOperations.clearCart, username);
      return;
    }

    // if the checkout complete notification didn't arrive in time, retrive the session information 
    // in order to check the payment status explicitly 
    const updatedSession = await ctxt.external($ShopOperations.retrieveStripeSession, stripeSession.id);
    if (!updatedSession) {
      // TODO: should we do something more meaningful if we can't retrieve the stripe session?
      console.error(`Recovering order #${orderID} failed: Stripe unreachable`);
      return;
    }

    if (updatedSession.payment_status == 'paid') {
      await ctxt.transaction($ShopOperations.fulfillOrder, orderID);
      await ctxt.transaction($ShopOperations.clearCart, username);
    } else {
      await ctxt.transaction($ShopOperations.undoSubtractInventory, productDetails);
      await ctxt.transaction($ShopOperations.errorOrder, orderID);
    }
  }
}