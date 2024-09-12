import { ArgOptional, Transaction, TransactionContext} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export enum AlertStatus {
  ACTIVE   = 0,
  ASSIGNED = 1,
  RESOLVED = 2
}

export interface Employee {
  employee_name: string;
  alert_id: number | null;
  expiration: Date | null;
  timeLeft?: number;
}

export interface AlertEmployee {
  alert_id: number;
  alert_status: AlertStatus;
  message: string;
  employee_name: string | null;
}

export interface AlertWithMessage {
  alert_id: number;
  alert_status: AlertStatus;
  last_update_time: Date;
  message: string;
}

export class RespondUtilities {
  @Transaction({readOnly: true})
  static async popDashboard(ctx: KnexTransactionContext) {
    const alerts = await ctx.client<AlertEmployee>('alert_employee').select().orderBy(['alert_id']);
    const employees = await ctx.client<Employee>('employee').select().orderBy(['employee_name']);
    for (const a of alerts) {
      if (a.alert_status === AlertStatus.ACTIVE && a.employee_name) {
        a.alert_status = AlertStatus.ASSIGNED;
      }
    }
    for (const p of employees) {
      if (p.expiration) {
        p.timeLeft = Math.round((p.expiration.getTime() - new Date().getTime())/1000);
      }
    }
    return {alerts, employees};
  }  

  @Transaction()
  static async cleanStaff(ctx: KnexTransactionContext) {
    await ctx.client<Employee>('employee').whereNull('alert_id').delete();
  }

  @Transaction()
  static async cleanAlerts(ctx: KnexTransactionContext) {
    await ctx.client<AlertEmployee>('alert_employee').where({alert_status: AlertStatus.RESOLVED}).delete();
  }

  @Transaction()
  static async getMaxId(ctx: KnexTransactionContext) {
    const result = await ctx.client<AlertEmployee>('alert_employee').max('alert_id', { as: 'mid' }).first();
    if (result ) {
      return result.mid;
    }
    return -1;
  }

  @Transaction()
  static async addAlert(ctx: KnexTransactionContext, message: AlertWithMessage) {
    await ctx.client<AlertEmployee>('alert_employee').insert({
      alert_id: message.alert_id,
      alert_status: message.alert_status,
      message: message.message,
      employee_name: null,
    }).onConflict(['alert_id']).ignore();
  }

  @Transaction()
  static async getUserAssignment(ctx: KnexTransactionContext, employee_name: string, expiration: Date, @ArgOptional more_time: boolean | undefined) {
    let employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    let newAssignment = false;
    if (!employees.length) {
      await ctx.client<Employee>('employee').insert({employee_name, alert_id: null, expiration: null});
      employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    }
    let alert : AlertEmployee[] = [];
    if (employees[0].alert_id && more_time) {
      // Extend time
      ctx.logger.info(`Extending time for ${employee_name} on ${employees[0].alert_id}`);
      if (employees[0].expiration?.getTime() ?? 0 < expiration.getTime()) {
        employees[0].expiration = expiration;
        await ctx.client<Employee>('employee').where({employee_name}).update({expiration});
      }
    } 
    else if (employees[0].alert_id) {
      alert = await ctx.client<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).select();
      return {employee: employees[0], newAssignment, alert};
    }
    else {
      // Try to find assignment
      const op = await ctx.client<AlertEmployee>('alert_employee').whereNull('employee_name').orderBy(['alert_id']).first();
      if (op) {
        op.employee_name = employee_name;
        const alert_id = op.alert_id;
        employees[0].alert_id = op.alert_id;
        employees[0].expiration = expiration;
        await ctx.client<Employee>('employee').where({employee_name}).update({alert_id, expiration});
        await ctx.client<AlertEmployee>('alert_employee').where({alert_id}).update({employee_name});
        newAssignment = true;
        ctx.logger.info(`New Assignment for ${employee_name}: ${alert_id}`);
      }
    }
    if (employees[0].alert_id) {
      alert = await ctx.client<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).select();
    }
    return {employee: employees[0], newAssignment, alert};
  }

  @Transaction()
  static async employeeCompleteAssignment(ctx: KnexTransactionContext, employee_name: string) {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].alert_id) {
      throw new Error(`Employee ${employee_name} completed an assignment that did not exist`);
    }
    await ctx.client<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({alert_status: AlertStatus.RESOLVED});
    await ctx.client<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
  }

  @Transaction()
  static async employeeAbandonAssignment(ctx: KnexTransactionContext, employee_name: string) {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].alert_id) {
      return; // Nothing to abandon
    }
    await ctx.client<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({employee_name: null});
    await ctx.client<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
  }

  // This will return null if the assignment expired, or the expiration if an unexpired assignment exists
  @Transaction()
  static async checkForExpiredAssignment(ctx: KnexTransactionContext, employee_name: string, currentDate: Date) : Promise<Date | null> {
    const employees = await ctx.client<Employee>('employee').where({employee_name}).select();
    if (!employees.length) {
      throw new Error(`No employee ${employee_name}`);
    }
    if (!employees[0].alert_id) {
      return null;
    }
    if ((employees[0].expiration?.getTime() ?? 0) > currentDate.getTime()) {
      ctx.logger.info(`Not yet expired: ${employees[0].expiration?.getTime()} > ${currentDate.getTime()}`);
      return employees[0].expiration;
    }
    await ctx.client<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({employee_name: null});
    await ctx.client<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
    return null;
  }
}
