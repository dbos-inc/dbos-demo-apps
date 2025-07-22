import { DBOS } from '@dbos-inc/dbos-sdk';
import { KnexDataSource } from '@dbos-inc/knex-datasource';

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

const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL ? process.env.DBOS_DATABASE_URL :
  {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'widget_store_node',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};

const knexds = new KnexDataSource('app-db', config);

// Here, let's write some database operations. Each of these functions performs a simple
// CRUD operation. We apply the @knexds.transaction() decorator to each of them to give them
// access to a Knex database connection.

export class ShopUtilities {
  @knexds.transaction()
  static async subtractInventory(): Promise<void> {
    const numAffected = await KnexDataSource.client<Product>('products')
      .where('product_id', PRODUCT_ID)
      .andWhere('inventory', '>=', 1)
      .update({
        inventory: KnexDataSource.client.raw('inventory - ?', 1),
      });
    if (numAffected <= 0) {
      throw new Error('Insufficient Inventory');
    }
  }

  @knexds.transaction()
  static async undoSubtractInventory(): Promise<void> {
    await KnexDataSource.client<Product>('products')
      .where({ product_id: PRODUCT_ID })
      .update({ inventory: KnexDataSource.client.raw('inventory + ?', 1) });
  }

  @knexds.transaction()
  static async setInventory(inventory: number): Promise<void> {
    await KnexDataSource.client<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory });
  }

  @knexds.transaction()
  static async retrieveProduct(): Promise<Product> {
    const item = await KnexDataSource.client<Product>('products').select('*').where({ product_id: PRODUCT_ID });
    if (!item.length) {
      throw new Error(`Product ${PRODUCT_ID} not found`);
    }
    return item[0];
  }

  @knexds.transaction()
  static async createOrder(): Promise<number> {
    const orders = await KnexDataSource.client<Order>('orders')
      .insert({
        order_status: OrderStatus.PENDING,
        product_id: PRODUCT_ID,
        last_update_time: KnexDataSource.client.fn.now(),
        progress_remaining: 10,
      })
      .returning('order_id');
    const orderID = orders[0].order_id;
    return orderID;
  }

  @knexds.transaction()
  static async markOrderPaid(order_id: number): Promise<void> {
    await KnexDataSource.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.PAID,
      last_update_time: KnexDataSource.client.fn.now(),
    });
  }

  @knexds.transaction()
  static async errorOrder(order_id: number): Promise<void> {
    await KnexDataSource.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.CANCELLED,
      last_update_time: KnexDataSource.client.fn.now(),
    });
  }

  @knexds.transaction()
  static async retrieveOrder(order_id: number): Promise<Order> {
    const item = await KnexDataSource.client<Order>('orders').select('*').where({ order_id: order_id });
    if (!item.length) {
      throw new Error(`Order ${order_id} not found`);
    }
    return item[0];
  }

  @knexds.transaction()
  static async retrieveOrders() {
    return KnexDataSource.client<Order>('orders').select('*');
  }

  @DBOS.workflow()
  static async dispatchOrder(order_id: number) {
    for (let i = 0; i < 10; i++) {
      await DBOS.sleep(1000);
      await ShopUtilities.updateOrderProgress(order_id);
    }
  }

  @knexds.transaction()
  static async updateOrderProgress(order_id: number): Promise<void> {
    const orders = await KnexDataSource.client<Order>('orders').where({
      order_id: order_id,
      order_status: OrderStatus.PAID,
    });
    if (!orders.length) {
      throw new Error(`No PAID order with ID ${order_id} found`);
    }

    const order = orders[0];
    if (order.progress_remaining > 1) {
      await KnexDataSource.client<Order>('orders')
        .where({ order_id: order_id })
        .update({ progress_remaining: order.progress_remaining - 1 });
    } else {
      await KnexDataSource.client<Order>('orders').where({ order_id: order_id }).update({
        order_status: OrderStatus.DISPATCHED,
        progress_remaining: 0,
      });
    }
  }
}
