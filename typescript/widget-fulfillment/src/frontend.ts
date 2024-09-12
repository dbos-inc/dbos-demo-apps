import { ArgOptional, GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { Liquid } from "liquidjs";
import { FulfillUtilities, AlertStatus } from "./utilities";
import { Fulfillment, AlertEmployeeInfo } from "./operations";

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'views'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

export class Frontend {

  @GetApi('/')
  static frontend(_ctxt: HandlerContext) {
    return render("../public/app.html", {});
  }

  @GetApi('/old')
  static async userPick(_ctxt: HandlerContext) {
    return await render("index", {});
  }

  @PostApi('/')
  static async setUser(ctxt: HandlerContext, name: string) {
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}`);
    return Promise.resolve();
  }

  @GetApi('/newfulfill')
  static async newFulfillment(ctxt: HandlerContext, name: string, @ArgOptional more_time: boolean | undefined) {
    const userRecWF = await ctxt.startWorkflow(Fulfillment).userAssignmentWorkflow(name, more_time);
    const userRec = await ctxt.getEvent<AlertEmployeeInfo>(userRecWF.getWorkflowUUID(), 'rec');
    ctxt.logger.info("rec:" + JSON.stringify(userRec))
    return userRec;
  }

  @GetApi('/fulfill')
  static async fulfillment(ctxt: HandlerContext, name: string, @ArgOptional more_time: boolean | undefined) {
    const userRecWF = await ctxt.startWorkflow(Fulfillment).userAssignmentWorkflow(name, more_time);
    const userRec = await ctxt.getEvent<AlertEmployeeInfo>(userRecWF.getWorkflowUUID(), 'rec');
    if (!userRec) {
      ctxt.koaContext.redirect('/');
      return;
    }
    if (!userRec.employee.alert_id || !userRec.expirationSecs) {
      return render('check_alerts', { name });
    }
    return render("fulfill_alert", {
      name,
      employee: userRec.employee,
      alert: userRec.alert,
      expirationSecs: Math.round(userRec.expirationSecs),
    });
  }

  @GetApi('/alerts')
  static async alerts(ctxt: HandlerContext) {
    const {alerts, employees} = await ctxt.invoke(FulfillUtilities).popDashboard();
    return alerts;
  }
  
  @GetApi('/dashboard')
  static async dashboard(ctxt: HandlerContext) {
    const {alerts, employees} = await ctxt.invoke(FulfillUtilities).popDashboard();
    return render("dashboard", {
      alerts,
      employees,
      fulfilled: AlertStatus.RESOLVED,
    });
  }
  
  @PostApi('/fulfill/cancel')
  static async cancelFulfill(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(FulfillUtilities).employeeAbandonAssignment(name);
    return Promise.resolve();
  }
  
  @PostApi('/fulfill/fulfilled') 
  static async completeFulfill(ctxt: HandlerContext, name: string) {
    // Handle fulfillment logic
    await ctxt.invoke(FulfillUtilities).employeeCompleteAssignment(name);
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}`);
  }
  
  @PostApi('/fulfill/more_time')
  static async extendFulfill(ctxt: HandlerContext, name: string) {
    // Handle request for more time - this is basically a page reload...
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}&more_time=true`);
    return Promise.resolve();
  }

  @PostApi('/dashboard/cleanalerts')
  static async cleanAlerts(ctxt: HandlerContext) {
    await ctxt.invoke(FulfillUtilities).cleanAlerts();
    return Promise.resolve();
  }

  @PostApi('/dashboard/cleanstaff')
  static async cleanStaff(ctxt: HandlerContext) {
    await ctxt.invoke(FulfillUtilities).cleanStaff();
    ctxt.koaContext.redirect(`/dashboard`);
    return Promise.resolve();
  }

  @GetApi('/error')
  static error(_ctxt: HandlerContext) {
    return render("error", {});
  }

  @GetApi('/crash')
  static crash(_ctxt: HandlerContext) {
    return render("crash", {});
  } 
}