import { ArgOptional, GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { Liquid } from "liquidjs";
import { RespondUtilities } from "./utilities";
import { AlertCenter, AlertEmployeeInfo } from "./operations";

//In this file we serve up the app.html UI page and define the routes that page uses

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'public'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

export class Frontend {

  //Serve public/app.html as the main endpoint
  @GetApi('/')
  static frontend(_ctxt: HandlerContext) {
    return render("app.html", {});
  }

  //For a new employee to get an assignment or for an assigned employee to ask for more time
  @GetApi('/assignment')
  static async getAssignment(ctxt: HandlerContext, name: string, @ArgOptional more_time: boolean | undefined) {
    const userRecWF = await ctxt.startWorkflow(AlertCenter).userAssignmentWorkflow(name, more_time);
    const userRec = await ctxt.getEvent<AlertEmployeeInfo>(userRecWF.getWorkflowUUID(), 'rec');
    return userRec;
  }

  //Retrieve a history and status of all the alerts
  @GetApi('/alert_history')
  static async alerts(ctxt: HandlerContext) {
    const alerts = await ctxt.invoke(RespondUtilities).getAlertStatus();
    return alerts;
  }
  
  //An employee request to cancel the current assignment
  @PostApi('/respond/cancel')
  static async cancelAssignment(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(RespondUtilities).employeeAbandonAssignment(name);
    return Promise.resolve();
  }
  
  //An employee request to mark the current assignment as completed
  @PostApi('/respond/fixed') 
  static async fixAlert(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(RespondUtilities).employeeCompleteAssignment(name);
  }
  
  //An employee request to ask for more time (simple redirect to above)
  @PostApi('/respond/more_time')
  static async extendAssignment(ctxt: HandlerContext, name: string) {
    ctxt.koaContext.redirect(`/assignment?name=${encodeURIComponent(name)}&more_time=true`);
    return Promise.resolve();
  }

  //Delete all the alerts from the alert history
  @PostApi('/dashboard/cleanalerts')
  static async cleanAlerts(ctxt: HandlerContext) {
    await ctxt.invoke(RespondUtilities).cleanAlerts();
    return Promise.resolve();
  }

  //Crash the app
  @GetApi('/crash')
  static crash(_ctxt: HandlerContext) {
    return render("crash", {});
  } 
}