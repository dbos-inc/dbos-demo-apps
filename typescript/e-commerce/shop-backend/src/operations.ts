import { DBOS, DBOSResponseError } from '@dbos-inc/dbos-sdk';
import { DBOSKoa, DefaultArgValidate } from '@dbos-inc/koa-serve';
import bcrypt from 'bcrypt';
import { Request } from 'koa';

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

import { KnexDataSource } from '@dbos-inc/knex-datasource';

const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'shop',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};
const knexds = new KnexDataSource('app-db', config);

export const checkout_url_topic = "payment_checkout_url";
export const checkout_complete_topic = "payment_checkout_complete";

function getHostConfig() {
  const paymentHost = process.env.PAYMENT_HOST || 'http://localhost:8086';
  if (!paymentHost) {
    DBOS.logger.warn("Missing PAYMENT_HOST env var");
  }

  const localHost = process.env.SHOP_HOST || 'http://localhost:8082';
  if (!localHost) {
    DBOS.logger.warn("Missing SHOP_HOST env var");
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
  constructor(readonly topic: string) { }

  async setEvent(result: T|null) : Promise<void> {
    if (this.completed) {
      DBOS.logger.debug(`Programmer error - setEvent called twice for topic ${this.topic} in workflow ${DBOS.workflowID}`);
      return;
    }
    this.completed = true;
    return DBOS.setEvent(this.topic, result);
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
  constructor() {}

  undos: Map<string, () => Promise<void> > = new Map();
  registerUndo(name: string, fn: () => Promise<void>) {
    this.undos.set(name, fn);
  }
  cancelUndo(name: string) {
    if (!this.undos.has(name)) {
      DBOS.logger.debug(`Node: undo named ${name} is not registered`);
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
        DBOS.logger.debug(`Unexpected error in undo function ${err.message}`);
      }
    }
  }
}

export const dkoa = new DBOSKoa();

@DefaultArgValidate
export class Shop {
  @dkoa.postApi('/api/login')
  @knexds.transaction({ readOnly: true })
  static async login(username: string, password: string): Promise<void> {
    const user = await knexds.client<User>('users').select("password").where({ username }).first();
    if (!user || !await bcrypt.compare(password, user.password)) {
      throw new DBOSResponseError("Invalid username or password", 400);
    }
  }

  @dkoa.postApi('/api/register')
  @DBOS.workflow()
  static async register(username: string, password: string): Promise<void> {
    const hashedPassword = await DBOS.runStep(()=>bcrypt.hash(password, 10), {name: 'hashPassword'});
    await Shop.saveNewUser(username, hashedPassword);
  }

  @knexds.transaction()
  static async saveNewUser(username: string, hashedPassword: string): Promise<void> {
    const user = await knexds.client<User>('users').select().where({ username }).first();
    if (user) {
      throw new DBOSResponseError("Username already exists", 400);
    }
    await knexds.client<User>('users').insert({ username, password: hashedPassword });
  }

  @dkoa.getApi('/api/products')
  @knexds.transaction({ readOnly: true })
  static async getProducts(): Promise<DisplayProduct[]> {
    const rows = await knexds.client<Product>('products').select("product_id", "product", "description", "image_name", "price");
    const formattedRows: DisplayProduct[] = rows.map((row) => ({
      ...row,
      display_price: (row.price / 100).toFixed(2),
    }));
    return formattedRows;
  }

  @dkoa.getApi('/api/products/:id')
  @knexds.transaction({ readOnly: true })
  static async getProduct(id: number): Promise<DisplayProduct | null> {
    return Shop.getProductInternal(id);
  }

  static async getProductInternal(id: number) {
    const rows = await knexds.client<Product>('products').select("product_id", "product", "description", "image_name", "price").where({ product_id: id });
    if (rows.length === 0) {
      return null;
    }
    const product: DisplayProduct = {
      ...rows[0],
      display_price: (rows[0].price / 100).toFixed(2),
    };
    return product;
  }

  @knexds.transaction({ readOnly: true })
  static async getInventory(id: number): Promise<number | null> {

    const rows = await knexds.client<Product>('products').select("product_id", "inventory").where({ product_id: id });
    if (rows.length === 0) {
      return null;
    }
    return rows[0].inventory;
  }

  @knexds.transaction()
  @dkoa.postApi('/api/add_to_cart')
  static async addToCart(username: string, product_id: number): Promise<void> {
    await knexds.client<Cart>('cart').insert({ username, product_id, quantity: 1 })
      .onConflict(['username', 'product_id'])
      .merge({ quantity: knexds.client.raw('cart.quantity + 1') });
  }

  @knexds.transaction({ readOnly: true })
  @dkoa.postApi('/api/get_cart')
  static async getCart(username: string): Promise<CartProduct[]> {
    const user = await knexds.client<User>('users').select("username").where({ username });
    if (!user.length) {
      DBOS.logger.error(`getCart for ${username} failed: no such user`);
      throw new DBOSResponseError("No such user", 400);
    }
    const rows = await knexds.client<Cart>('cart').select("product_id", "quantity").where({ username });
    const products = rows.map(async (row) => {
      const product = await Shop.getProductInternal(row.product_id)!;
      return <CartProduct>{ ...product, inventory: row.quantity };
    });
    return await Promise.all(products);
  }

  @dkoa.postApi('/api/checkout_session')
  static async webCheckout(username: string): Promise<void> {
    const origin = DBOSKoa.koaContext.request?.headers.origin as string;
    if (typeof username !== 'string' || typeof origin !== 'string') {
      throw new DBOSResponseError("Invalid request!", 400);
    }

    const handle = await DBOS.startWorkflow(Shop).paymentWorkflow(username, origin);
    const url = await DBOS.getEvent<string>(handle.workflowID, checkout_url_topic);

    if (url === null) {
      DBOS.logger.warn(`Canceling checkout for ${username}. Checkout Workflow UUID: ${handle.workflowID}`);
      DBOSKoa.koaContext.redirect(`${origin}/checkout/cancel`);
    } else {
      DBOSKoa.koaContext.redirect(url);
    }
  }

  @DBOS.workflow()
  static async paymentWorkflow(username: string, origin: string): Promise<void> {
    // Coupled with the `finally` block, this will ensure that an event is sent out of the workflow.
    const event = new EventSender(checkout_url_topic);
    const undos = new UndoList();

    try {
      const productDetails = await Shop.getCart(username);
      if (productDetails.length === 0) {
        DBOS.logger.error(`Checkout for ${username} failed: empty cart`);
        return;
      }

      const orderID = await Shop.createOrder(username, productDetails);

      try {
        // This is a transaction that either completes or leaves the system as it was.
        //  If it completes, the order must be sent or the subtraction must be undone.
        await Shop.subtractInventory(productDetails);
        undos.registerUndo('inventory', ()=>{return Shop.undoSubtractInventory(productDetails);});
      } catch (error) {
        DBOS.logger.error(`Checkout for ${username} failed: insufficient inventory`);
        return;
      }

      const paymentSession = await Shop.createPaymentSession(productDetails, origin);
      if (!paymentSession?.url) {
        DBOS.logger.error(`Checkout for ${username} failed: couldn't create payment session`);
        return;
      }

      await event.setEvent(paymentSession.url);
      const notification = await DBOS.recv<string>(checkout_complete_topic, 60);
      let orderIsPaid = false;

      if (notification && notification === 'paid') {
        DBOS.logger.debug(`Checkout for ${username}: payment notification received`);
        // if the checkout complete notification arrived, the payment is successful so fulfill the order
        orderIsPaid = true;
      } else {
        // The checkout complete notification didn't arrive in time, or payment declined
        if (!notification) {
          DBOS.logger.warn(`Checkout for ${username}: payment notification timed out`);
        }
        // Retrieve the session information in order to check the payment status explicitly
        const updatedSession = await Shop.retrievePaymentSession(paymentSession.session_id);
        if (!updatedSession) {
          DBOS.logger.error(`Recovering order #${orderID} failed: payment service unreachable`);
        }

        if (updatedSession.payment_status === 'paid') {
          DBOS.logger.debug(`Checkout for ${username}: Fetched status which was paid`);
          orderIsPaid = true;
        }
        else {
          DBOS.logger.error(`Checkout for ${username} failed: payment not received`);
        }
      }

      if (orderIsPaid) {
        await Shop.fulfillOrder(orderID);
        undos.cancelUndo('inventory');
        await Shop.clearCart(username);
      } else {
        await Shop.errorOrder(orderID);
      }
      DBOS.logger.debug(`Checkout for ${username}: workflow complete`);
    }
    finally {
      await undos.atCompletion();
      await event.atCompletion();
    }
  }

  @knexds.transaction()
  static async createOrder(username: string, products: Product[]): Promise<number> {
    const orders = await knexds.client<Order>('orders')
      .insert({ username, order_status: OrderStatus.PENDING, last_update_time: 0n })
      .returning('order_id');
    const order_id = orders[0].order_id;

    const items = products.map(p => ({ order_id, product_id: p.product_id, price: p.price, quantity: p.inventory}));
    await knexds.client<OrderItem>('order_items').insert(items);

    return order_id;
  }

  @knexds.transaction()
  static async subtractInventory(products: Product[]): Promise<void> {
    return await Shop.subtractInventoryInternal(products);
  }

  static async subtractInventoryInternal(products: Product[]): Promise<void> {
    for (const product of products) {
      const numAffected = await knexds.client<Product>('products').where('product_id', product.product_id).andWhere('inventory', '>=', product.inventory)
      .update({
        inventory: knexds.client.raw('inventory - ?', [product.inventory])
      });
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
    }
  }

  @knexds.transaction()
  static async undoSubtractInventory(products: Product[]): Promise<void> {
    for (const product of products) {
      await knexds.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: knexds.client.raw('inventory + ?', [product.inventory]) });
    }
  }

  @knexds.transaction()
  static async fulfillOrder(orderID: number): Promise<void> {
    await knexds.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.FULFILLED });
  }

  @knexds.transaction()
  static async errorOrder(orderID: number): Promise<void> {
    await knexds.client('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.CANCELLED });
  }

  @knexds.transaction()
  static async clearCart(username: string): Promise<void> {
    await knexds.client<Cart>('cart').where({ username }).del();
  }

  @DBOS.step()
  static async createPaymentSession(productDetails: Product[], origin: string): Promise<PaymentSession> {
    return await Shop.placePaymentSessionRequest(productDetails, origin);
  }

  static async placePaymentSessionRequest(productDetails: Product[], origin: string): Promise<PaymentSession> {
    const { paymentHost, localHost } = getHostConfig();

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
        client_reference_id: DBOS.workflowID,
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

  @DBOS.step()
  static async retrievePaymentSession(sessionID: string): Promise<PaymentSession> {
    const { paymentHost } = getHostConfig();

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

  @dkoa.postApi('/payment_webhook')
  static async paymentWebhook(): Promise<void> {
    const req: Request = DBOSKoa.koaContext.request;

    type Session = { session_id: string; client_reference_id?: string; payment_status: string };
    const payload = req.body as Session;

    if (!payload.client_reference_id) {
      DBOS.logger.error(`Invalid payment webhook callback ${JSON.stringify(payload)}`);
    } else {
      await DBOS.send(payload.client_reference_id, payload.payment_status, checkout_complete_topic);
    }
  }
}
