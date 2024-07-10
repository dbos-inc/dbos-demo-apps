import { Transaction, TransactionContext} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export enum OrderStatus {
  PENDING = 0,
  FULFILLED = 1,
  PAID = 2,
  CANCELLED = -1,
}

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
  last_update_time: Date,
  product_id: number,
}

export interface OrderWithProduct {
  order_id: number;
  order_status: number;
  last_update_time: Date;
  product_id: number;
  product: string;
}

export const PRODUCT_ID = 1;

export class ShopUtilities {
  @Transaction()
  static async subtractInventory(ctxt: KnexTransactionContext): Promise<void> {
    const numAffected = await ctxt.client<Product>('products').where('product_id', PRODUCT_ID).andWhere('inventory', '>=', 1)
      .update({
        inventory: ctxt.client.raw('inventory - ?', 1)
      });
    //A good block to uncomment in time-travel debugger to see an example of querying past state
    // const item = await ctxt.client<Product>('products').select('inventory').where({ product_id: PRODUCT_ID });
    // ctxt.logger.info(">>> Remaining inventory: " + item[0].inventory);
    if (numAffected <= 0) {
      throw new Error("Insufficient Inventory");
    }
  }

  @Transaction()
  static async undoSubtractInventory(ctxt: KnexTransactionContext): Promise<void> {
    await ctxt.client<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory: ctxt.client.raw('inventory + ?', 1) });
  }

  @Transaction({ readOnly: true })
  static async retrieveProduct(ctxt: KnexTransactionContext): Promise<Product> {
    const item = await ctxt.client<Product>('products').select("*").where({ product_id: PRODUCT_ID });
    if (!item.length) {
      throw new Error(`Product ${PRODUCT_ID} not found`);
    }
    return item[0];
  }

  @Transaction()
  static async createOrder(ctxt: KnexTransactionContext): Promise<number> {
    const orders = await ctxt.client<Order>('orders').insert({
      order_status: OrderStatus.PENDING,
      product_id: PRODUCT_ID,
      last_update_time: ctxt.client.fn.now()
    }).returning('order_id');
    const orderID = orders[0].order_id;
    return orderID;
  }

  @Transaction()
  static async markOrderPaid(ctxt: KnexTransactionContext, order_id: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.PAID,
      last_update_time: ctxt.client.fn.now()
    });
  }

  @Transaction()
  static async fulfillOrder(ctxt: KnexTransactionContext, order_id: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.FULFILLED,
      last_update_time: ctxt.client.fn.now()
    });
  }


  @Transaction()
  static async errorOrder(ctxt: KnexTransactionContext, order_id: number): Promise<void> {
    await ctxt.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.CANCELLED,
      last_update_time: ctxt.client.fn.now()
    });
  }

  @Transaction({ readOnly: true })
  static async retrieveOrder(ctxt: KnexTransactionContext, order_id: number): Promise<Order> {
    const item = await ctxt.client<Order>('orders').select("*").where({ order_id: order_id });
    if (!item.length) {
      throw new Error(`Order ${order_id} not found`);
    }
    return item[0];
  }

  @Transaction({ readOnly: true })
  static async retrieveOrderDetails(ctxt: KnexTransactionContext, order_id: number): Promise<OrderWithProduct[]> {
    const items = await ctxt.client<Order>('orders')
      .join<Product>('products', 'orders.product_id', 'products.product_id')
      .select('orders.*', 'products.product')
      .where({order_id});
    return items as OrderWithProduct[];
  }
}