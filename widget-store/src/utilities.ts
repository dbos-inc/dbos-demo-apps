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
  inventory: number,
  price: number,
}

export interface Order {
  order_id: number,
  order_status: number,
  last_update_time: bigint,
  product_id: number,
}

export const payment_complete_topic = "payment_complete";

export const product_id = 1

export class ShopUtilities {
  @Transaction()
  static async subtractInventory(ctxt: KnexTransactionContext): Promise<void> {
      const numAffected = await ctxt.client<Product>('products').where('product_id', product_id).andWhere('inventory', '>=', 1)
      .update({
        inventory: ctxt.client.raw('inventory - ?', 1)
      });
      //const item = await ctxt.client<Product>('products').select("inventory").where({ product_id: product.product_id });
      //ctxt.logger.info(">>> Remaining inventory: " + item[0].inventory); 
      if (numAffected <= 0) {
        throw new Error("Insufficient Inventory");
      }
  }

  @Transaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext): Promise<void> {
    await ctxt.client<Product>('products').where({ product_id: product_id }).update({ inventory: ctxt.client.raw('inventory + ?', 1) });
  }

  @Transaction()
  static async retrieveInventory(ctxt: KnexTransactionContext): Promise<number> {
    const item = await ctxt.client<Product>('products').select("inventory").where({ product_id: product_id });
    if (!item.length) {
      ctxt.logger.warn(`Product ${product_id} not found`)
      return 0;
    }
    return item[0].inventory;
  }

  @Transaction()
  static async retrieveProduct(ctxt: KnexTransactionContext): Promise<Product> {
    const item = await ctxt.client<Product>('products').select("*").where({ product_id: product_id });
    if (!item.length) {
      throw new Error(`Product ${product_id} not found`);
    }
    return item[0];
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
    const orders = await ctxt.client<Order>('orders').insert({ order_status: OrderStatus.PENDING, last_update_time: 0n, product_id: product_id }).returning('order_id');
    const orderID = orders[0].order_id;
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
