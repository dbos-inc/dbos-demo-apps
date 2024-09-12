import { ArgOptional, GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { Liquid } from "liquidjs";
import { RespondUtilities, AlertStatus } from "./utilities";
import { Respondment, AlertEmployeeInfo } from "./operations";

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'public'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

export class Frontend {

  @GetApi('/')
  static frontend(_ctxt: HandlerContext) {
    return render("app.html", {});
  }

  @GetApi('/assignment')
  static async getAssignment(ctxt: HandlerContext, name: string, @ArgOptional more_time: boolean | undefined) {
    const userRecWF = await ctxt.startWorkflow(Respondment).userAssignmentWorkflow(name, more_time);
    const userRec = await ctxt.getEvent<AlertEmployeeInfo>(userRecWF.getWorkflowUUID(), 'rec');
    return userRec;
  }

  @GetApi('/alert_history')
  static async alerts(ctxt: HandlerContext) {
    const {alerts, employees} = await ctxt.invoke(RespondUtilities).popDashboard();
    return alerts;
  }
  
  @PostApi('/respond/cancel')
  static async cancelAssignment(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(RespondUtilities).employeeAbandonAssignment(name);
    return Promise.resolve();
  }
  
  @PostApi('/respond/fixed') 
  static async fixAlert(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(RespondUtilities).employeeCompleteAssignment(name);
  }
  
  @PostApi('/respond/more_time')
  static async extendAssignment(ctxt: HandlerContext, name: string) {
    ctxt.koaContext.redirect(`/assignment?name=${encodeURIComponent(name)}&more_time=true`);
    return Promise.resolve();
  }

  @PostApi('/dashboard/cleanalerts')
  static async cleanAlerts(ctxt: HandlerContext) {
    await ctxt.invoke(RespondUtilities).cleanAlerts();
    return Promise.resolve();
  }

  @PostApi('/dashboard/cleanstaff')
  static async cleanStaff(ctxt: HandlerContext) {
    await ctxt.invoke(RespondUtilities).cleanStaff();
    return Promise.resolve();
  }

  @GetApi('/crash')
  static crash(_ctxt: HandlerContext) {
    return render("crash", {});
  } 
}