import { DBOS } from '@dbos-inc/dbos-sdk';

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
  message: string;
}

const timeToRespondToAlert = 30;

export class RespondUtilities {
  @DBOS.transaction({readOnly: true})
  static async getAlertStatus() {
    const alerts = await DBOS.knexClient<AlertEmployee>('alert_employee').select().orderBy(['alert_id']);
    for (const a of alerts) {
      if (a.alert_status === AlertStatus.ACTIVE && a.employee_name) {
        a.alert_status = AlertStatus.ASSIGNED;
      }
    }
    return alerts;
  }  


  @DBOS.transaction()
  static async cleanAlerts() {
    await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_status: AlertStatus.RESOLVED}).delete();
  }


  @DBOS.transaction()
  static async getMaxId() {
    const result = await DBOS.knexClient<AlertEmployee>('alert_employee').max('alert_id', { as: 'mid' }).first();
    if (result ) {
      return result.mid;
    }
    return -1;
  }


  @DBOS.transaction()
  static async addAlert(message: AlertWithMessage) {
    await DBOS.knexClient<AlertEmployee>('alert_employee').insert({
      alert_id: message.alert_id,
      alert_status: message.alert_status,
      message: message.message,
      employee_name: null,
    }).onConflict(['alert_id']).ignore();
  }


  @DBOS.transaction()
  static async getUserAssignment(employee_name: string, currentTime: number, more_time: boolean | undefined) {
    let employees = await DBOS.knexClient<Employee>('employee').where({employee_name}).select();
    let newAssignment = false;

    if (employees.length === 0) {
      //Is this the first getUserAssignment for this employee? Add them to the employee table
      employees = await DBOS.knexClient<Employee>('employee').insert({employee_name, alert_id: null, expiration: null}).returning('*');
    }

    const expirationTime = new Date(currentTime + timeToRespondToAlert * 1000);

    if (!employees[0].alert_id) { 
      //This employee does not have a current assignment. Let's find a new one!
      const op = await DBOS.knexClient<AlertEmployee>('alert_employee').whereNull('employee_name').orderBy(['alert_id']).first();

      if (op) { //found an alert - assign it
        op.employee_name = employee_name;
        const alert_id = op.alert_id;
        employees[0].alert_id = op.alert_id;
        employees[0].expiration = expirationTime;
        await DBOS.knexClient<Employee>('employee').where({employee_name}).update({alert_id, expiration: expirationTime});
        await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_id}).update({employee_name});
        newAssignment = true;
        DBOS.logger.info(`New Assignment for ${employee_name}: ${alert_id}`);
      }
    }
    else if (employees[0].alert_id && more_time) {
      //This employee has an assignment and is asking for more time.
      DBOS.logger.info(`Extending time for ${employee_name} on ${employees[0].alert_id}`);
      employees[0].expiration = expirationTime;
      await DBOS.knexClient<Employee>('employee').where({employee_name}).update({expiration: expirationTime});
    }

    //If we have an assignment (new or existing), retrieve and return it
    let alert : AlertEmployee[] = [];
    if (employees[0].alert_id) {
      alert = await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).select();
    }
    return {employee: employees[0], newAssignment, alert};
  }


  @DBOS.transaction()
  static async employeeCompleteAssignment(employee_name: string) {
    const employees = await DBOS.knexClient<Employee>('employee').where({employee_name}).select();
    
    if (!employees[0].alert_id) {
      throw new Error(`Employee ${employee_name} completed an assignment that did not exist`);
    }

    await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({alert_status: AlertStatus.RESOLVED});
    await DBOS.knexClient<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
  }


  @DBOS.transaction()
  static async employeeAbandonAssignment(employee_name: string) {
    const employees = await DBOS.knexClient<Employee>('employee').where({employee_name}).select();

    if (!employees[0].alert_id) {
      // This employee is not assigned; nothing to abandon
      return; 
    }

    //Free up the alert for other employees to take
    await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({employee_name: null});
    await DBOS.knexClient<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
  }


  // This will return null if the assignment expired, or the expiration if an unexpired assignment exists
  @DBOS.transaction()
  static async checkForExpiredAssignment(employee_name: string, currentDate: Date) : Promise<Date | null> {
    const employees = await DBOS.knexClient<Employee>('employee').where({employee_name}).select();

    if (!employees[0].alert_id) {
      // This employee is not assigned
      return null;
    }

    if ((employees[0].expiration?.getTime() ?? 0) > currentDate.getTime()) {
      //This employee is assigned and their time is not yet expired
      DBOS.logger.info(`Not yet expired: ${employees[0].expiration?.getTime()} > ${currentDate.getTime()}`);
      return employees[0].expiration;
    }

    //This assigment expired - free up the alert for other employees to take
    await DBOS.knexClient<AlertEmployee>('alert_employee').where({alert_id: employees[0].alert_id}).update({employee_name: null});
    await DBOS.knexClient<Employee>('employee').where({employee_name}).update({alert_id: null, expiration: null});
    return null;
  }
}
