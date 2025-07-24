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

export const knexds = new KnexDataSource('app-db', config);

export async function retrieveOrders() {
  return knexds.runTransaction(async () => {
    return KnexDataSource.client<Order>('orders').select('*');
  });
}


// Here, let's write some database operations. Each of these functions performs a simple
// CRUD operation. We use knexds.runTransaction to give them access to a Knex database connection.

export async function subtractInventory(): Promise<void> {
  return knexds.runTransaction(async () => {
    const numAffected = await KnexDataSource.client<Product>('products')
      .where('product_id', PRODUCT_ID)
      .andWhere('inventory', '>=', 1)
      .update({
        inventory: KnexDataSource.client.raw('inventory - ?', 1),
      });
    if (numAffected <= 0) {
      throw new Error('Insufficient Inventory');
    }
  });
}

export async function undoSubtractInventory(): Promise<void> {
  return knexds.runTransaction(async () => {
    await KnexDataSource.client<Product>('products')
      .where({ product_id: PRODUCT_ID })
      .update({ inventory: KnexDataSource.client.raw('inventory + ?', 1) });
  });
}

export async function setInventory(inventory: number): Promise<void> {
  return knexds.runTransaction(async () => {
    await KnexDataSource.client<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory });
  });
}

export async function retrieveProduct(): Promise<Product> {
  return knexds.runTransaction(async () => {
    const item = await KnexDataSource.client<Product>('products').select('*').where({ product_id: PRODUCT_ID });
    if (!item.length) {
      throw new Error(`Product ${PRODUCT_ID} not found`);
    }
    return item[0];
  });
}

export async function createOrder(): Promise<number> {
  return knexds.runTransaction(async () => {
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
  });
}

export async function markOrderPaid(order_id: number): Promise<void> {
  return knexds.runTransaction(async () => {
    await KnexDataSource.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.PAID,
      last_update_time: KnexDataSource.client.fn.now(),
    });
  });
}

export async function errorOrder(order_id: number): Promise<void> {
  return knexds.runTransaction(async () => {
    await KnexDataSource.client<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.CANCELLED,
      last_update_time: KnexDataSource.client.fn.now(),
    });
  });
}

export async function retrieveOrder(order_id: number): Promise<Order> {
  return knexds.runTransaction(async () => {
    const item = await KnexDataSource.client<Order>('orders').select('*').where({ order_id: order_id });
    if (!item.length) {
      throw new Error(`Order ${order_id} not found`);
    }
    return item[0];
  });
}

export const dispatchOrder = DBOS.registerWorkflow(async (order_id: number) => {
  for (let i = 0; i < 10; i++) {
    await DBOS.sleep(1000);
    await updateOrderProgress(order_id);
  }
});

export async function updateOrderProgress(order_id: number): Promise<void> {
  return knexds.runTransaction(async () => {
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
  });
}
