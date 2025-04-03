import { DBOS } from '@dbos-inc/dbos-sdk';

export enum OrderStatus {
  PENDING = 0,
  DISPATCHED = 1,
  PAID = 2,
  CANCELLED = -1,
}

export interface Product {
  product_id: number;
  product: string;
  description: string;
  inventory: number;
  price: number;
}

export interface Order {
  order_id: number;
  order_status: number;
  last_update_time: Date;
  product_id: number;
  progress_remaining: number;
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
  @DBOS.transaction()
  static async subtractInventory(): Promise<void> {
    const numAffected = await DBOS.knexClient<Product>('products')
      .where('product_id', PRODUCT_ID)
      .andWhere('inventory', '>=', 1)
      .update({
        inventory: DBOS.knexClient.raw('inventory - ?', 1),
      });
    if (numAffected <= 0) {
      throw new Error('Insufficient Inventory');
    }
  }

  @DBOS.transaction()
  static async undoSubtractInventory(): Promise<void> {
    await DBOS.knexClient<Product>('products')
      .where({ product_id: PRODUCT_ID })
      .update({ inventory: DBOS.knexClient.raw('inventory + ?', 1) });
  }

  @DBOS.transaction()
  static async setInventory(inventory: number): Promise<void> {
    await DBOS.knexClient<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory });
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveProduct(): Promise<Product> {
    const item = await DBOS.knexClient<Product>('products').select('*').where({ product_id: PRODUCT_ID });
    if (!item.length) {
      throw new Error(`Product ${PRODUCT_ID} not found`);
    }
    return item[0];
  }

  @DBOS.transaction()
  static async createOrder(): Promise<number> {
    const orders = await DBOS.knexClient<Order>('orders')
      .insert({
        order_status: OrderStatus.PENDING,
        product_id: PRODUCT_ID,
        last_update_time: DBOS.knexClient.fn.now(),
        progress_remaining: 10,
      })
      .returning('order_id');
    const orderID = orders[0].order_id;
    return orderID;
  }

  @DBOS.transaction()
  static async markOrderPaid(order_id: number): Promise<void> {
    await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.PAID,
      last_update_time: DBOS.knexClient.fn.now(),
    });
  }

  @DBOS.transaction()
  static async errorOrder(order_id: number): Promise<void> {
    await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.CANCELLED,
      last_update_time: DBOS.knexClient.fn.now(),
    });
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveOrder(order_id: number): Promise<Order> {
    const item = await DBOS.knexClient<Order>('orders').select('*').where({ order_id: order_id });
    if (!item.length) {
      throw new Error(`Order ${order_id} not found`);
    }
    return item[0];
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveOrders() {
    return DBOS.knexClient<Order>('orders').select('*');
  }

  @DBOS.transaction({ readOnly: true })
  static async retrievePaidOrders() {
    return DBOS.knexClient<Order>('orders').select('*').where({ order_status: OrderStatus.PAID });
  }

  @DBOS.workflow()
  static async dispatchOrder(order_id: number) {
    for (let i = 0; i < 10; i++) {
      await DBOS.sleep(1000);
      await ShopUtilities.update_order_progress(order_id);
    }
  }

  @DBOS.transaction()
  static async update_order_progress(order_id: number): Promise<void> {
    const orders = await DBOS.knexClient<Order>('orders').where({
      order_id: order_id,
      order_status: OrderStatus.PAID,
    });
    if (!orders.length) {
      throw new Error(`No PAID order with ID ${order_id} found`);
    }

    const order = orders[0];
    if (order.progress_remaining > 1) {
      await DBOS.knexClient<Order>('orders')
        .where({ order_id: order_id })
        .update({ progress_remaining: order.progress_remaining - 1 });
    } else {
      await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
        order_status: OrderStatus.DISPATCHED,
        progress_remaining: 0,
      });
    }
  }
}
