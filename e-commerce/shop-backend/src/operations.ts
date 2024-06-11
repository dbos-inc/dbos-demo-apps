import {
  TransactionContext, WorkflowContext, Transaction, Workflow, HandlerContext,
  GetApi, PostApi, Communicator, CommunicatorContext, DBOSResponseError, ArgSource, ArgSources, DBOSContext
} from '@dbos-inc/dbos-sdk';
import { BcryptCommunicator } from '@dbos-inc/communicator-bcrypt';
export { BcryptCommunicator };
import { Knex } from 'knex';
import { Request } from 'koa';

type KnexTransactionContext = TransactionContext<Knex>;

export const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

export interface Cart {
  username: string,
  product_id: number,
  quantity: number,
}

export interface Product {
  product_id: number,
  product: string,
  description: string,
  image_name: string,
  price: number,
  inventory: number,
}

export type DisplayProduct = Omit<Product, 'inventory'> & { display_price: string };
export type CartProduct = Product & { display_price: string };

export interface Order {
  order_id: number,
  username: string,
  order_status: number,
  stripe_session_id: string,
  last_update_time: bigint,
}

export interface OrderItem {
  order_id: number,
  product_id: number,
  price: number,
  quantity: number,
}

export interface User {
  username: string,
  password: string,
}

export interface PaymentSession {
  session_id: string,
  url?: string,
  payment_status: string,
}

export const checkout_url_topic = "payment_checkout_url";
export const checkout_complete_topic = "payment_checkout_complete";

function getHostConfig(ctxt: DBOSContext) {
  const paymentHost = ctxt.getConfig<string>("payment_host");
  if (!paymentHost) {
    ctxt.logger.warn("Missing payment_host configuration");
  }

  const localHost = ctxt.getConfig<string>("local_host");
  if (!localHost) {
    ctxt.logger.warn("Missing local_host configuration");
  }

  if (!paymentHost || !localHost) {
    throw new Error("Invalid Configuration");
  }

  return { paymentHost, localHost };
}

/**
 * This class sets a workflow event exactly once.
 *   (Provided that it is used in a "finally" clause or similar)
 */
class EventSender<T>
{
  completed: boolean = false;
  constructor(readonly ctxt: WorkflowContext, readonly topic: string) { }

  async setEvent(result: T|null) : Promise<void> {
    if (this.completed) {
      this.ctxt.logger.debug(`Programmer error - setEvent called twice for topic ${this.topic} in workflow ${this.ctxt.workflowUUID}`);
      return;
    }
    this.completed = true;
    return this.ctxt.setEvent(this.topic, result);
  }

  async atCompletion() : Promise<void> {
    if (!this.completed) {
      return this.setEvent(null);
    }
  }
}

/**
 * This class ensures that an undo is executed unless canceled
 */
class UndoList {
  constructor(readonly ctxt: WorkflowContext) {}

  undos: Map<string, () => Promise<void> > = new Map();
  registerUndo(name: string, fn: () => Promise<void>) {
    this.undos.set(name, fn);
  }
  cancelUndo(name: string) {
    if (!this.undos.has(name)) {
      this.ctxt.logger.debug(`Node: undo named ${name} is not registered`);
    }
    this.undos.delete(name);
  }

  async atCompletion() {
    for (const [_name, fn] of this.undos) {
      try {
        await fn();
      }
      catch (e) {
        const err = e as Error;
        this.ctxt.logger.debug(`Unexpected error in undo function ${err.message}`);
      }
    }
  }
}

export class Shop {

  @PostApi('/api/login')
  @Transaction({ readOnly: true })
  static async login(ctxt: KnexTransactionContext, username: string, password: string): Promise<void> {
    const user = await ctxt.client<User>('users').select("password").where({ username }).first();
    if (!(user && await BcryptCommunicator.bcryptCompare(password, user.password))) {
      throw new DBOSResponseError("Invalid username or password", 400);
    }
  }

  @PostApi('/api/register')
  @Workflow()
  static async register(ctxt: WorkflowContext, username: string, password: string): Promise<void> {
    const hashedPassword = await ctxt.invoke(BcryptCommunicator).bcryptHash(password, 10);
    await ctxt.invoke(Shop).saveNewUser(username, hashedPassword);
  }

  @Transaction()
  static async saveNewUser(ctxt: KnexTransactionContext, username: string, hashedPassword: string): Promise<void> {
    const user = await ctxt.client<User>('users').select().where({ username }).first();
    if (user) {
      throw new DBOSResponseError("Username already exists", 400);
    }
    await ctxt.client<User>('users').insert({ username, password: hashedPassword });
  }

  @GetApi('/api/products')
  @Transaction({ readOnly: true })
  static async getProducts(ctxt: KnexTransactionContext): Promise<DisplayProduct[]> {
    const rows = await ctxt.client<Product>('products').select("product_id", "product", "description", "image_name", "price");
    const formattedRows: DisplayProduct[] = rows.map((row) => ({
      ...row,
      display_price: (row.price / 100).toFixed(2),
    }));
    return formattedRows;
  }

  @GetApi('/api/products/:id')
  @Transaction({ readOnly: true })
  static async getProduct(ctxt: KnexTransactionContext, @ArgSource(ArgSources.URL) id: number): Promise<DisplayProduct | null> {

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

  @Transaction({ readOnly: true })
  static async getInventory(ctxt: KnexTransactionContext, id: number): Promise<number | null> {

    const rows = await ctxt.client<Product>('products').select("product_id", "inventory").where({ product_id: id });
    if (rows.length === 0) {
      return null;
    }
    return rows[0].inventory;
  }

  @PostApi('/api/add_to_cart')
  @Transaction()
  static async addToCart(ctxt: KnexTransactionContext, username: string, product_id: number): Promise<void> {
    await ctxt.client<Cart>('cart').insert({ username, product_id, quantity: 1 }).onConflict(['username', 'product_id']).merge({ quantity: ctxt.client.raw('cart.quantity + 1') });
  }

  @PostApi('/api/get_cart')
  @Transaction({ readOnly: true })
  static async getCart(ctxt: KnexTransactionContext, username: string): Promise<CartProduct[]> {
    const user = await ctxt.client<User>('users').select("username").where({ username });
    if (!user.length) {
      ctxt.logger.error(`getCart for ${username} failed: no such user`);
      throw new DBOSResponseError("No such user", 400);
    }
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
      throw new DBOSResponseError("Invalid request!", 400);
    }

    const handle = await ctxt.startWorkflow(Shop).paymentWorkflow(username, origin);
    const url = await ctxt.getEvent<string>(handle.getWorkflowUUID(), checkout_url_topic);

    if (url === null) {
      ctxt.logger.warn(`Canceling checkout for ${username}. Checkout Workflow UUID: ${handle.getWorkflowUUID()}`);
      ctxt.koaContext.redirect(`${origin}/checkout/cancel`);
    } else {
      ctxt.koaContext.redirect(url);
    }
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext, username: string, origin: string): Promise<void> {
    // Coupled with the `finally` block, this will ensure that an event is sent out of the workflow.
    const event = new EventSender(ctxt, checkout_url_topic);
    const undos = new UndoList(ctxt);
  
    try {
      const productDetails = await ctxt.invoke(Shop).getCart(username);
      if (productDetails.length === 0) {
        ctxt.logger.error(`Checkout for ${username} failed: empty cart`);
        return;
      }

      const orderID = await ctxt.invoke(Shop).createOrder(username, productDetails);

      try {
        // This is a transaction that either completes or leaves the system as it was.
        //  If it completes, the order must be sent or the subtraction must be undone.
        await ctxt.invoke(Shop).subtractInventory(productDetails);
        undos.registerUndo('inventory', ()=>{return ctxt.invoke(Shop).undoSubtractInventory(productDetails);});
      } catch (error) {
        ctxt.logger.error(`Checkout for ${username} failed: insufficient inventory`);
        return;
      }

      const paymentSession = await ctxt.invoke(Shop).createPaymentSession(productDetails, origin);
      if (!paymentSession?.url) {
        ctxt.logger.error(`Checkout for ${username} failed: couldn't create payment session`);
        return;
      }

      await event.setEvent(paymentSession.url);
      const notification = await ctxt.recv<string>(checkout_complete_topic, 60);
      let orderIsPaid = false;

      if (notification && notification === 'paid') {
        ctxt.logger.debug(`Checkout for ${username}: payment notification received`);
        // if the checkout complete notification arrived, the payment is successful so fulfill the order
        orderIsPaid = true;
      } else {
        // The checkout complete notification didn't arrive in time, or payment declined
        if (!notification) {
          ctxt.logger.warn(`Checkout for ${username}: payment notification timed out`);
        }
        // Retrieve the session information in order to check the payment status explicitly
        const updatedSession = await ctxt.invoke(Shop).retrievePaymentSession(paymentSession.session_id);
        if (!updatedSession) {
          ctxt.logger.error(`Recovering order #${orderID} failed: payment service unreachable`);
        }

        if (updatedSession.payment_status === 'paid') {
          ctxt.logger.debug(`Checkout for ${username}: Fetched status which was paid`);
          orderIsPaid = true;
        }
        else {
          ctxt.logger.error(`Checkout for ${username} failed: payment not received`);
        }
      }

      if (orderIsPaid) {
        await ctxt.invoke(Shop).fulfillOrder(orderID);
        undos.cancelUndo('inventory');
        await ctxt.invoke(Shop).clearCart(username);
      } else {
        await ctxt.invoke(Shop).errorOrder(orderID);
      }
      ctxt.logger.debug(`Checkout for ${username}: workflow complete`);
    }
    finally {
      await undos.atCompletion();
      await event.atCompletion();
    }
  }

  @Transaction()
  static async createOrder(ctxt: KnexTransactionContext, username: string, products: Product[]): Promise<number> {
    const orders = await ctxt.client<Order>('orders').insert({ username, order_status: OrderStatus.PENDING, last_update_time: 0n }).returning('order_id');
    const orderID = orders[0].order_id;

    for (const product of products) {
      await ctxt.client<OrderItem>('order_items').insert({ order_id: orderID, product_id: product.product_id, price: product.price, quantity: product.inventory });
    }

    return orderID;
  }

  @Transaction()
  static async subtractInventory(ctxt: KnexTransactionContext, products: Product[]): Promise<void> {
    return await Shop.subtractInventoryInternal(ctxt, products);
  }

  static async subtractInventoryInternal(ctxt: KnexTransactionContext, products: Product[]): Promise<void> {
    for (const product of products) {
      const numAffected = await ctxt.client<Product>('products').where('product_id', product.product_id).andWhere('inventory', '>=', product.inventory)
      .update({
        inventory: ctxt.client.raw('inventory - ?', [product.inventory])
      });
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
    }
  }

  @Transaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext, products: Product[]): Promise<void> {
    for (const product of products) {
      await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory + ?', [product.inventory]) });
    }
  }

  @Transaction()
  static async fulfillOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.FULFILLED });
  }

  @Transaction()
  static async errorOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.CANCELLED });
  }

  @Transaction()
  static async clearCart(ctxt: KnexTransactionContext, username: string): Promise<void> {
    await ctxt.client<Cart>('cart').where({ username }).del();
  }

  @Communicator()
  static async createPaymentSession(ctxt: CommunicatorContext, productDetails: Product[], origin: string): Promise<PaymentSession> {
    return await Shop.placePaymentSessionRequest(ctxt, productDetails, origin);
  }

  static async placePaymentSessionRequest(ctxt: CommunicatorContext, productDetails: Product[], origin: string): Promise<PaymentSession> {
    const { paymentHost, localHost } = getHostConfig(ctxt);

    const response = await fetch(`${paymentHost}/api/create_payment_session`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: `${localHost}/payment_webhook`,
        success_url: `${origin}/checkout/success`,
        cancel_url: `${origin}/checkout/cancel`,
        client_reference_id: ctxt.workflowUUID,
        items: productDetails.map(product => ({
          description: product.product,
          quantity: product.inventory,
          price: (product.price / 100).toFixed(2),
        }))
      })
    });
    const session = await response.json() as PaymentSession;
    return session;
  }

  @Communicator()
  static async retrievePaymentSession(ctxt: CommunicatorContext, sessionID: string): Promise<PaymentSession> {
    const { paymentHost } = getHostConfig(ctxt);

    const response = await fetch(`${paymentHost}/api/session/${sessionID}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const session = await response.json() as PaymentSession;
    return session;
  }

  @PostApi('/payment_webhook')
  static async paymentWebhook(ctxt: HandlerContext): Promise<void> {
    const req: Request = ctxt.koaContext.request;

    type Session = { session_id: string; client_reference_id?: string; payment_status: string };
    const payload = req.body as Session;

    if (!payload.client_reference_id) {
      ctxt.logger.error(`Invalid payment webhook callback ${JSON.stringify(payload)}`);
    } else {
      await ctxt.send(payload.client_reference_id, payload.payment_status, checkout_complete_topic);
    }
  }
}
