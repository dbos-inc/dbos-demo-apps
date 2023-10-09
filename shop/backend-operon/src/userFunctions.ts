import {
  TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, HandlerContext,
  GetApi, PostApi, OperonCommunicator, CommunicatorContext, OperonResponseError, ArgSource, ArgSources
} from '@dbos-inc/operon';
import Stripe from 'stripe';
import bcrypt from 'bcrypt';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

interface Cart {
  username: string,
  product_id: number,
  quantity: number,
}

interface Product {
  product_id: number,
  product: string,
  description: string,
  image_name: string,
  price: number,
  inventory: number,
}

type DisplayProduct = Omit<Product, 'inventory'> & { display_price: string };
type CartProduct = Product & { display_price: string };

interface Order {
  order_id: number,
  username: string,
  order_status: number,
  stripe_session_id: string,
  last_update_time: bigint,
}

interface OrderItem {
  order_id: number,
  product_id: number,
  price: number,
  quantity: number,
}

interface User {
  username: string,
  password: string,
}

const stripe = new Stripe(process.env.STRIPE_API_KEY || 'error_no_stripe_key', { apiVersion: '2023-08-16' });
const endpointSecret: string = process.env.STRIPE_WEBHOOK_SECRET || 'error_no_webhook_secret';

const checkout_url_topic = "stripe_checkout_url";
const checkout_complete_topic = "stripe_checkout_complete";

export class Shop {

  @PostApi('/api/login')
  @OperonTransaction({ readOnly: true })
  static async login(ctxt: KnexTransactionContext, username: string, password: string): Promise<void> {
    const user = await ctxt.client<User>('users').select("password").where({ username }).first();
    if (!(user && await bcrypt.compare(password, user.password))) {
      throw new OperonResponseError("Invalid username or password", 400);
    }
  }

  @PostApi('/api/register')
  @OperonTransaction()
  static async register(ctxt: KnexTransactionContext, username: string, password: string): Promise<void> {
    const user = await ctxt.client<User>('users').select().where({ username }).first();
    if (user) {
      throw new OperonResponseError("Username already exists", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await ctxt.client<User>('users').insert({ username, password: hashedPassword });
  }

  @GetApi('/api/products')
  @OperonTransaction()
  static async getProducts(ctxt: KnexTransactionContext): Promise<DisplayProduct[]> {
    const rows = await ctxt.client<Product>('products').select("product_id", "product", "description", "image_name", "price");
    const formattedRows: DisplayProduct[] = rows.map((row) => ({
      ...row,
      display_price: (row.price / 100).toFixed(2),
    }));
    return formattedRows;
  }

  @GetApi('/api/products/:id')
  @OperonTransaction({ readOnly: true })
  static async getProduct(ctxt: KnexTransactionContext, id: number): Promise<DisplayProduct | null> {

    const rows = await ctxt.client<Product>('products').select("product_id", "product", "description", "image_name", "price").where({ product_id: id });
    if (rows.length === 0) {
      return null;
    }
    const product: DisplayProduct = {
      ...rows[0],
      display_price: (rows[0].price / 100).toFixed(2),
    };
    return product;
  }

  @PostApi('/api/add_to_cart')
  @OperonTransaction()
  static async addToCart(ctxt: KnexTransactionContext, username: string, product_id: number): Promise<void> {
    await ctxt.client<Cart>('cart').insert({ username, product_id, quantity: 1 }).onConflict(['username', 'product_id']).merge({ quantity: ctxt.client.raw('cart.quantity + 1') });
  }

  @PostApi('/api/get_cart')
  @OperonTransaction({ readOnly: true })
  static async getCart(ctxt: KnexTransactionContext, username: string): Promise<CartProduct[]> {
    const rows = await ctxt.client<Cart>('cart').select("product_id", "quantity").where({ username });
    const products = rows.map(async (row) => {
      const product = await Shop.getProduct(ctxt, row.product_id)!;
      return <CartProduct>{ ...product, inventory: row.quantity };
    });
    return await Promise.all(products);
  }

  @PostApi('/api/checkout_session')
  static async webCheckout(ctxt: HandlerContext, @ArgSource(ArgSources.QUERY) username: string): Promise<void> {
    const origin = ctxt.koaContext.request?.headers.origin as string;
    if (typeof username !== 'string' || typeof origin !== 'string') {
      throw new OperonResponseError("Invalid request!", 400);
    }
    const handle = await ctxt.invoke(Shop).paymentWorkflow(username, origin);
    const url = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);

    if (url === null) {
      ctxt.koaContext.redirect(`${origin}/checkout/cancel`);
    } else {
      ctxt.koaContext.redirect(url);
    }
  }

  @OperonWorkflow()
  static async paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string): Promise<void> {
    const productDetails = await ctxt.invoke(Shop).getCart(username);
    if (productDetails.length === 0) {
      await ctxt.setEvent(checkout_url_topic, null);
    }

    const orderID = await ctxt.invoke(Shop).createOrder(username, productDetails);

    const valid: boolean = await ctxt.invoke(Shop).subtractInventory(productDetails);
    if (!valid) {
      await ctxt.setEvent(checkout_url_topic, null);
    }

    const stripeSession = await ctxt.invoke(Shop).createStripeSession(productDetails, origin);
    if (!stripeSession?.url) {
      await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
      await ctxt.setEvent(checkout_url_topic, null);
    }

    await ctxt.setEvent(checkout_url_topic, stripeSession.url);
    const notification = await ctxt.recv<string>(checkout_complete_topic, 60);

    // if the checkout complete notification arrived, the payment is successful so fulfull the order
    if (notification) {
      await ctxt.invoke(Shop).fulfillOrder(orderID);
      await ctxt.invoke(Shop).clearCart(username);
    }

    // if the checkout complete notification didn't arrive in time, retrive the session information 
    // in order to check the payment status explicitly 
    const updatedSession = await ctxt.invoke(Shop).retrieveStripeSession(stripeSession.id);
    if (!updatedSession) {
      // TODO: should we do something more meaningful if we can't retrieve the stripe session?
      console.error(`Recovering order #${orderID} failed: Stripe unreachable`);
    }

    if (updatedSession.payment_status == 'paid') {
      await ctxt.invoke(Shop).fulfillOrder(orderID);
      await ctxt.invoke(Shop).clearCart(username);
    } else {
      await ctxt.invoke(Shop).undoSubtractInventory(productDetails);
      await ctxt.invoke(Shop).errorOrder(orderID);
    }
  }

  @OperonTransaction()
  static async createOrder(ctxt: KnexTransactionContext, username: string, products: Product[]): Promise<number> {
    const orders = await ctxt.client<Order>('orders').insert({ username, order_status: OrderStatus.PENDING, last_update_time: 0n }).returning('order_id');
    const orderID = orders[0].order_id;

    for (const product of products) {
      await ctxt.client<OrderItem>('order_items').insert({ order_id: orderID, product_id: product.product_id, price: product.price, quantity: product.inventory });
    }

    return orderID;
  }

  @OperonTransaction()
  static async subtractInventory(ctxt: KnexTransactionContext, products: Product[]): Promise<boolean> {
    for (const product of products) {
      const row = await ctxt.client<Product>('products').where({ product_id: product.product_id }).select('inventory').first();
      const inventory = row?.inventory ?? 0;
      if (inventory < product.inventory) {
        return false;
      }
    }

    // If all products have enough inventory, subtract the inventory from the products in the database
    for (const product of products) {
      await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory - ?', [product.inventory]) });
    }

    return true;
  }

  @OperonTransaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext, products: Product[]): Promise<void> {
    for (const product of products) {
      await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory + ?', [product.inventory]) });
    }
  }

  @OperonTransaction()
  static async fulfillOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.FULFILLED });
  }

  @OperonTransaction()
  static async errorOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.CANCELLED });
  }

  @OperonTransaction()
  static async clearCart(ctxt: KnexTransactionContext, username: string): Promise<void> {
    await ctxt.client<Cart>('cart').where({ username }).del();
  }

  @OperonCommunicator()
  static async createStripeSession(ctxt: CommunicatorContext, productDetails: Product[], origin: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
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
      client_reference_id: ctxt.workflowUUID,
      success_url: `${origin}/checkout/success`,
      cancel_url: `${origin}/checkout/cancel`,
    });
  }

  @OperonCommunicator()
  static async retrieveStripeSession(_ctxt: CommunicatorContext, sessionID: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    const session = await stripe.checkout.sessions.retrieve(sessionID);
    try {
      await stripe.checkout.sessions.expire(sessionID); // Ensure nothing changes in the session.
    } catch (err) {
      // Session was already expired.
    }
    return session;
  }

  @PostApi('/stripe_webhook')
  static async stripeWebhook(ctxt: HandlerContext): Promise<void> {
    const req = ctxt.koaContext.request;
    const sigHeader = req.headers['stripe-signature'];
    if (typeof sigHeader !== 'string') {
      throw new OperonResponseError("Invalid Header", 400);
    }
    const payload: string = req.rawBody;
    try {
      const event = stripe.webhooks.constructEvent(payload, sigHeader, endpointSecret);
      if (event.type === 'checkout.session.completed') {
        const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Response<Stripe.Checkout.Session>).id);
        if (session.client_reference_id !== null) {
          const uuid: string = session.client_reference_id;
          await ctxt.send(uuid, "checkout.session.completed", checkout_complete_topic);
        }
      }
    } catch (err) {
      console.log(err);
      throw new OperonResponseError("Webhook Error", 400);
    }
  }
}