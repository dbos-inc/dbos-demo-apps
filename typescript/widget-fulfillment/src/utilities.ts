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

export interface Employee {
  employee_name: string;
  order_id: number | null;
  expiration: Date | null;
  timeLeft?: number;
}

export interface OrderEmployee {
  order_id: number;
  order_status: OrderStatus;
  product: string;
  employee_name: string | null;
}

export interface OrderWithProduct {
  order_id: number;
  order_status: OrderStatus;
  last_update_time: Date;
  product: string;
}

export class FulfillUtilities {
  @Transaction({readOnly: true})
  static async popDashboard(ctx: KnexTransactionContext) {
    const orders = await ctx.client<OrderEmployee>('order_employee').select().orderBy(['order_id']);
    const employees = await ctx.client<Employee>('employee').select().orderBy(['employee_name']);
    for (const o of orders) {
      if (o.order_status === OrderStatus.PAID && o.employee_name) {
        o.order_status = OrderStatus.ASSIGNED;
      }
    }
    for (const p of employees) {
      if (p.expiration) {
        p.timeLeft = Math.round((p.expiration.getTime() - new Date().getTime())/1000);
      }
    }
    return {orders, employees};
  }  

  @Transaction()
  static async cleanStaff(ctx: KnexTransactionContext) {
    await ctx.client<Employee>('employee').whereNull('order_id').delete();
  }

  @Transaction()
  static async cleanOrders(ctx: KnexTransactionContext) {
    await ctx.client<OrderEmployee>('order_employee').where({order_status: OrderStatus.FULFILLED}).delete();
  }

  @Transaction()
  static async getMaxId(ctx: KnexTransactionContext) {
    const result = await ctx.client<OrderEmployee>('order_employee').max('order_id', { as: 'mid' }).first();
    if (result ) {
      return result.mid;
    }
    return -1;
  }

  @Transaction()
  static async addOrder(ctx: KnexTransactionContext, product: OrderWithProduct) {
    await ctx.client<OrderEmployee>('order_employee').insert({
      order_id: product.order_id,
      order_status: product.order_status,
      product: product.product,
      employee_name: null,
    }).onConflict(['order_id']).ignore();
  }

  @Transaction()
  static async getUserAssignment(ctx: KnexTransactionContext, employee_name: string, expiration: Date, @ArgOptional more_time: boolean | undefined) {
    let employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    let newAssignment = false;
    if (!employees.length) {
      await ctx.client<Employee>('employee').insert({employee_name, order_id: null, expiration: null});
      employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    }
    let order : OrderEmployee[] = [];
    if (employees[0].order_id && more_time) {
      // Extend time
      ctx.logger.info(`Extending time for ${employee_name} on ${employees[0].order_id}`);
      if (employees[0].expiration?.getTime() ?? 0 < expiration.getTime()) {
        employees[0].expiration = expiration;
        await ctx.client<Employee>('employee').where({employee_name}).update({expiration});
      }
    } 
    else if (employees[0].order_id) {
      order = await ctx.client<OrderEmployee>('order_employee').where({order_id: employees[0].order_id}).select();
      return {employee: employees[0], newAssignment, order};
    }
    else {
      // Try to find assignment
      const op = await ctx.client<OrderEmployee>('order_employee').whereNull('employee_name').orderBy(['order_id']).first();
      if (op) {
        op.employee_name = employee_name;
        const order_id = op.order_id;
        employees[0].order_id = op.order_id;
        employees[0].expiration = expiration;
        await ctx.client<Employee>('employee').where({employee_name}).update({order_id, expiration});
        await ctx.client<OrderEmployee>('order_employee').where({order_id}).update({employee_name});
        newAssignment = true;
        ctx.logger.info(`New Assignment for ${employee_name}: ${order_id}`);
      }
    }
    if (employees[0].order_id) {
      order = await ctx.client<OrderEmployee>('order_employee').where({order_id: employees[0].order_id}).select();
    }
    return {employee: employees[0], newAssignment, order};
  }

  @Transaction()
  static async employeeCompleteAssignment(ctx: KnexTransactionContext, employee_name: string) {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].order_id) {
      throw new Error(`Employee ${employee_name} completed an assignment that did not exist`);
    }
    await ctx.client<OrderEmployee>('order_employee').where({order_id: employees[0].order_id}).update({order_status: OrderStatus.FULFILLED});
    await ctx.client<Employee>('employee').where({employee_name}).update({order_id: null, expiration: null});
  }

  @Transaction()
  static async employeeAbandonAssignment(ctx: KnexTransactionContext, employee_name: string) {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].order_id) {
      return; // Nothing to abandon
    }
    await ctx.client<OrderEmployee>('order_employee').where({order_id: employees[0].order_id}).update({employee_name: null});
    await ctx.client<Employee>('employee').where({employee_name}).update({order_id: null, expiration: null});
  }

  // This will return null if the assignment expired, or the expiration if an unexpired assignment exists
  @Transaction()
  static async checkForExpiredAssignment(ctx: KnexTransactionContext, employee_name: string, currentDate: Date) : Promise<Date | null> {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].order_id) {
      return null;
    }
    if ((employees[0].expiration?.getTime() ?? 0) > currentDate.getTime()) {
      ctx.logger.info(`Not yet expired: ${employees[0].expiration?.getTime()} > ${currentDate.getTime()}`);
      return employees[0].expiration;
    }
    await ctx.client<OrderEmployee>('order_employee').where({order_id: employees[0].order_id}).update({employee_name: null});
    await ctx.client<Employee>('employee').where({employee_name}).update({order_id: null, expiration: null});
    return null;
  }
}
