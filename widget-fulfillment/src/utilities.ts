import { ArgOptional, Transaction, TransactionContext} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export enum OrderStatus {
  PENDING = 0,
  FULFILLED = 1,
  PAID = 2,
  ASSIGNED = 3,
  CANCELLED = -1,
}

export interface Packer {
  packer_name: string;
  order_id: number | null;
  expiration: Date | null;
  timeLeft?: number;
}

export interface OrderPacker {
  order_id: number;
  order_status: OrderStatus;
  product_id: number;
  product: string;
  packer_name: string | null;
}

export interface OrderWithProduct {
  order_id: number;
  order_status: OrderStatus;
  last_update_time: Date;
  product_id: number;
  product: string;
}

export const PRODUCT_ID = 1;

export class FulfillUtilities {
  @Transaction({readOnly: true})
  static async popDashboard(ctx: KnexTransactionContext) {
    const orders = await ctx.client<OrderPacker>('order_packer').select().orderBy(['order_id']);
    const packers = await ctx.client<Packer>('packer').select().orderBy(['packer_name']);
    for (const o of orders) {
      if (o.order_status === OrderStatus.PAID && o.packer_name) {
        o.order_status = OrderStatus.ASSIGNED;
      }
    }
    for (const p of packers) {
      if (p.expiration) {
        p.timeLeft = Math.round((p.expiration.getTime() - new Date().getTime())/1000);
      }
    }
    return {orders, packers};
  }  

  @Transaction()
  static async cleanStaff(ctx: KnexTransactionContext) {
    await ctx.client<Packer>('packer').whereNull('order_id').delete();
  }

  @Transaction()
  static async cleanOrders(ctx: KnexTransactionContext) {
    await ctx.client<OrderPacker>('order_packer').where({order_status: OrderStatus.FULFILLED}).delete();
  }

  @Transaction()
  static async addOrder(ctx: KnexTransactionContext, product: OrderWithProduct) {
    await ctx.client<OrderPacker>('order_packer').insert({
      order_id: product.order_id,
      order_status: product.order_status,
      product_id: product.product_id,
      product: product.product,
      packer_name: null,
    }).onConflict(['order_id']).ignore();
  }

  @Transaction()
  static async getUserAssignment(ctx: KnexTransactionContext, packer_name: string, expiration: Date, @ArgOptional more_time: boolean | undefined) {
    let packers = await ctx.client<Packer>('packer').where({packer_name}).select();
    let newAssignment = false;
    if (!packers.length) {
      await ctx.client<Packer>('packer').insert({packer_name, order_id: null, expiration: null});
      packers = await ctx.client<Packer>('packer').where({packer_name}).select();
    }
    if (packers[0].order_id && more_time) {
      // Extend time
      ctx.logger.info(`Extending time for ${packer_name} on ${packers[0].order_id}`);
      if (packers[0].expiration?.getTime() ?? 0 < expiration.getTime()) {
       packers[0].expiration = expiration;
       await ctx.client<Packer>('packer').where({packer_name}).update({expiration});
      }
    }
    else {
      // Try to find assignment
      const op = await ctx.client<OrderPacker>('order_packer').whereNull('packer_name').orderBy(['order_id']).first();
      if (op) {
        op.packer_name = packer_name;
        const order_id = op.order_id;
        packers[0].order_id = op.order_id;
        packers[0].expiration = expiration;
        await ctx.client<Packer>('packer').where({packer_name}).update({order_id, expiration});
        await ctx.client<OrderPacker>('order_packer').where({order_id}).update({packer_name});
        newAssignment = true;
        ctx.logger.info(`New Assignment for ${packer_name}: ${order_id}`);
      }
    }
    let order : OrderPacker[] = [];
    if (packers[0].order_id) {
      order = await ctx.client<OrderPacker>('order_packer').where({order_id: packers[0].order_id}).select();
    }
    return {packer: packers[0], newAssignment, order};
  }

  @Transaction()
  static async packerCompleteAssignment(ctx: KnexTransactionContext, packer_name: string) {
    const packers = await ctx.client<Packer>('packer').where({packer_name}).select();
    if (!packers.length) {
      throw new Error(`No packer ${packer_name}`);
    }
    if (!packers[0].order_id) {
      throw new Error(`Packer ${packer_name} completed an assignment that did not exist`);
    }
    await ctx.client<OrderPacker>('order_packer').where({order_id: packers[0].order_id}).update({order_status: OrderStatus.FULFILLED});
    await ctx.client<Packer>('packer').where({packer_name}).update({order_id: null, expiration: null});
  }

  @Transaction()
  static async packerAbandonAssignment(ctx: KnexTransactionContext, packer_name: string) {
    const packers = await ctx.client<Packer>('packer').where({packer_name}).select();
    if (!packers.length) {
      throw new Error(`No packer ${packer_name}`);
    }
    if (!packers[0].order_id) {
      return; // Nothing to abandon
    }
    await ctx.client<OrderPacker>('order_packer').where({order_id: packers[0].order_id}).update({packer_name: null});
    await ctx.client<Packer>('packer').where({packer_name}).update({order_id: null, expiration: null});
  }

  // This will return null if the assignment expired, or the expiration if an unexpired assignment exists
  @Transaction()
  static async checkForExpiredAssignment(ctx: KnexTransactionContext, packer_name: string, currentDate: Date) : Promise<Date | null> {
    const packers = await ctx.client<Packer>('packer').where({packer_name}).select();
    if (!packers.length) {
      throw new Error(`No packer ${packer_name}`);
    }
    if (!packers[0].order_id) {
      return null;
    }
    if ((packers[0].expiration?.getTime() ?? 0) > currentDate.getTime()) {
      ctx.logger.info(`Not yet expired: ${packers[0].expiration?.getTime()} > ${currentDate.getTime()}`);
      return packers[0].expiration;
    }
    await ctx.client<OrderPacker>('order_packer').where({order_id: packers[0].order_id}).update({packer_name: null});
    await ctx.client<Packer>('packer').where({packer_name}).update({order_id: null, expiration: null});
    return null;
  }
}
