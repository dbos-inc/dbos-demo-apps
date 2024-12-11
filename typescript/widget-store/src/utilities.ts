import { SendEmailStep } from '@dbos-inc/communicator-email-ses';
import { SchedulerMode, DBOS} from '@dbos-inc/dbos-sdk';

export enum OrderStatus {
  PENDING = 0,
  DISPATCHED = 1,
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
  progress_remaining: number,
}

export interface OrderWithProduct {
  order_id: number;
  order_status: number;
  last_update_time: Date;
  product_id: number;
  product: string;
}

export const PRODUCT_ID = 1;

const reportSes = (process.env['REPORT_EMAIL_TO_ADDRESS'] && process.env['REPORT_EMAIL_FROM_ADDRESS'])
  ? DBOS.configureInstance(SendEmailStep, 'reportSES', {awscfgname: 'aws_config'})
  : undefined;

export class ShopUtilities {
  @DBOS.transaction()
  static async subtractInventory(): Promise<void> {
    const numAffected = await DBOS.knexClient<Product>('products').where('product_id', PRODUCT_ID).andWhere('inventory', '>=', 1)
      .update({
        inventory: DBOS.knexClient.raw('inventory - ?', 1)
      });
    //A good block to uncomment in time-travel debugger to see an example of querying past state
    // const item = await ctxt.client<Product>('products').select('inventory').where({ product_id: PRODUCT_ID });
    // ctxt.logger.info(">>> Remaining inventory: " + item[0].inventory);
    if (numAffected <= 0) {
      throw new Error("Insufficient Inventory");
    }
  }

  @DBOS.transaction()
  static async undoSubtractInventory(): Promise<void> {
    await DBOS.knexClient<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory: DBOS.knexClient.raw('inventory + ?', 1) });
  }

  @DBOS.transaction()
  static async setInventory(inventory: number): Promise<void> {
    await DBOS.knexClient<Product>('products').where({ product_id: PRODUCT_ID }).update({ inventory });
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveProduct(): Promise<Product> {
    const item = await DBOS.knexClient<Product>('products').select("*").where({ product_id: PRODUCT_ID });
    if (!item.length) {
      throw new Error(`Product ${PRODUCT_ID} not found`);
    }
    return item[0];
  }

  @DBOS.transaction()
  static async createOrder(): Promise<number> {
    const orders = await DBOS.knexClient<Order>('orders').insert({
      order_status: OrderStatus.PENDING,
      product_id: PRODUCT_ID,
      last_update_time: DBOS.knexClient.fn.now(),
      progress_remaining: 10,
    }).returning('order_id');
    const orderID = orders[0].order_id;
    return orderID;
  }

  @DBOS.transaction()
  static async markOrderPaid(order_id: number): Promise<void> {
    await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.PAID,
      last_update_time: DBOS.knexClient.fn.now()
    });
  }

  @DBOS.transaction()
  static async errorOrder(order_id: number): Promise<void> {
    await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
      order_status: OrderStatus.CANCELLED,
      last_update_time: DBOS.knexClient.fn.now()
    });
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveOrder(order_id: number): Promise<Order> {
    const item = await DBOS.knexClient<Order>('orders').select("*").where({ order_id: order_id });
    if (!item.length) {
      throw new Error(`Order ${order_id} not found`);
    }
    return item[0];
  }

  @DBOS.transaction({ readOnly: true })
  static async retrieveOrders() {
    return DBOS.knexClient<Order>('orders').select("*");
  }

  @DBOS.transaction({ readOnly: true })
  static async retrievePaidOrders() {
    return DBOS.knexClient<Order>('orders').select("*").where({ order_status: OrderStatus.PAID });
  }

  @DBOS.transaction()
  static async makeProgressOnPaidOrder(order_id: number): Promise<void> {
    const orders = await DBOS.knexClient<Order>('orders').where({
      order_id: order_id,
      order_status: OrderStatus.PAID,
    });
    if (!orders.length) {
      throw new Error(`No PAID order with ID ${order_id} found`);
    }

    const order = orders[0];
    if (order.progress_remaining > 1) {
      await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({ progress_remaining: order.progress_remaining - 1 });
    } else {
      await DBOS.knexClient<Order>('orders').where({ order_id: order_id }).update({
        order_status: OrderStatus.DISPATCHED,
        progress_remaining: 0
      });
    }
  }

  @DBOS.scheduled({crontab: '0 0 * * *'}) // Every midnight
  @DBOS.workflow()
  static async nightlyReport(schedDate: Date, _curdate: Date) {
    const yesterday = schedDate;
    yesterday.setDate(yesterday.getDate() - 1);

    const sales = await ShopUtilities.getDailySales(yesterday);
    await ShopUtilities.sendStatusEmail(yesterday, sales);
  }

  @DBOS.scheduled({mode: SchedulerMode.ExactlyOncePerIntervalWhenActive, crontab: '*/20 * * * * *'}) // Every second
  @DBOS.workflow()
  static async makeProgressOnAllPaidOrders(_schedDate: Date, _curdate: Date) {
    const orders = await ShopUtilities.retrievePaidOrders();
    for (const order of orders) {
      await ShopUtilities.makeProgressOnPaidOrder(order.order_id);
    }
  }

  @DBOS.transaction({readOnly: true})
  static async getDailySales(day: Date) {
    const startOfDay = new Date(day.setHours(0, 0, 0, 0));
    const endOfDay = new Date(day.setHours(23, 59, 59, 999));

    const result = await DBOS.knexClient('orders')
      .join('products', 'orders.product_id', 'products.product_id')
      .whereBetween('orders.last_update_time', [startOfDay, endOfDay])
      .select(DBOS.knexClient.raw('COUNT(DISTINCT orders.order_id) as order_count'))
      .select(DBOS.knexClient.raw('COUNT(orders.product_id) as product_count'))
      .select(DBOS.knexClient.raw('SUM(products.price) as total_price'));

    return result[0] as SalesSummary;
  }

  static async sendStatusEmail(yd: Date, sales: SalesSummary) {
    if (!reportSes) return;
    await DBOS.invoke(reportSes).sendEmail({
      to: [process.env['REPORT_EMAIL_TO_ADDRESS']!],
      from: process.env['REPORT_EMAIL_FROM_ADDRESS']!,
      subject: `Daily report for ${yd.toDateString()}`,
      bodyText: `Yesterday we had ${sales.order_count} orders, selling ${sales.product_count} units, for a total of ${sales.total_price} dollars`,
    });
  }
}

interface SalesSummary {
  order_count: number;
  product_count: number;
  total_price: number;
}
