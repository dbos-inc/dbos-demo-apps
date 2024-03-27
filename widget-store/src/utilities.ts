import {
    Transaction, Communicator, CommunicatorContext, TransactionContext, HandlerContext, PostApi, GetApi, DBOSResponseError
} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export const OrderStatus = {
  PENDING: 0,
  FULFILLED: 1,
  CANCELLED: -1,
};

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

export const payment_complete_topic = "payment_complete";

// In this guide, we will be checking out this type of product. The database is initialized with 100000 of them.
export const product: CartProduct = {
  product_id: 1,
  product: 'a pen',
  description: 'such a stylish pen',
  image_name: 'red_pen.jpg',
  price: 1000, // an expensive pen
  inventory: 1,
  display_price: '$1000.00',
};

export const defaultUsername = "dbos-testuser";

export class ShopUtilities {
  @Transaction()
  static async subtractInventory(ctxt: KnexTransactionContext): Promise<void> {
      const numAffected = await ctxt.client<Product>('products').where('product_id', product.product_id).andWhere('inventory', '>=', product.inventory)
      .update({
        inventory: ctxt.client.raw('inventory - ?', [product.inventory])
      });
      //const item = await ctxt.client<Product>('products').select("inventory").where({ product_id: product.product_id });
      //ctxt.logger.info(">>> Remaining inventory: " + item[0].inventory); 
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
  }

  @Transaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext): Promise<void> {
    await ctxt.client<Product>('products').where({ product_id: product.product_id }).update({ inventory: ctxt.client.raw('inventory + ?', [product.inventory]) });
  }

  @Transaction()
  static async retrieveInventory(ctxt: KnexTransactionContext): Promise<number> {
    const item = await ctxt.client<Product>('products').select("inventory").where({ product_id: product.product_id });
    if (!item.length) {
      ctxt.logger.warn(`Product ${product.product_id} not found`)
      return 0;
    }
    return item[0].inventory;
  }

  @Communicator()
  static async createPaymentSession(ctxt: CommunicatorContext): Promise<string> {
    return `/payment/${ctxt.workflowUUID}`;
  }

  @PostApi('/payment_webhook/:key/:status')
  static async paymentWebhook(ctxt: HandlerContext, key: string, status: string): Promise<void> {
    await ctxt.send(key, status, payment_complete_topic);
  }

  @Transaction()
  static async createOrder(ctxt: KnexTransactionContext): Promise<number> {
    const orders = await ctxt.client<Order>('orders').insert({ username: defaultUsername, order_status: OrderStatus.PENDING, last_update_time: 0n }).returning('order_id');
    const orderID = orders[0].order_id;
    await ctxt.client<OrderItem>('order_items').insert({ order_id: orderID, product_id: product.product_id, price: product.price, quantity: product.inventory });
    return orderID;
  }

  @Transaction()
  static async fulfillOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.FULFILLED });
  }

  @Transaction()
  static async errorOrder(ctxt: KnexTransactionContext, orderID: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: orderID }).update({ order_status: OrderStatus.CANCELLED });
  }


  @PostApi('/crash_application')
  static async crashApplication(_ctxt: HandlerContext) {
    process.exit(1);
  }

}
