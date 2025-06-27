import { DBOS } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { Liquid } from "liquidjs";
import { RespondUtilities } from "./utilities";
import { AlertCenter, AlertEmployeeInfo } from "./operations";
import { dkoa } from './utilities';
import { DBOSKoa } from "@dbos-inc/koa-serve";

//In this file we serve up the app.html UI page and define the routes that page uses
export {dkoa};

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'public'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

export class Frontend {

  //Serve public/app.html as the main endpoint
  @dkoa.getApi('/')
  static frontend() {
    return render("app.html", {});
  }


  //For a new employee to get an assignment or for an assigned employee to ask for more time
  @dkoa.getApi('/assignment')
  static async getAssignment(name: string, more_time: boolean | undefined) {
    const userRecWF = await DBOS.startWorkflow(AlertCenter).userAssignmentWorkflow(name, more_time);

    //This Workflow Event lets us know if we have an assignment and, if so, how much time is left
    const userRec = await DBOS.getEvent<AlertEmployeeInfo>(userRecWF.workflowID, 'rec');
    return userRec;
  }


  //Retrieve a history and status of all the alerts
  @dkoa.getApi('/alert_history')
  static async alerts() {
    const alerts = await RespondUtilities.getAlertStatus();
    return alerts;
  }
  

  //An employee request to cancel the current assignment
  @dkoa.postApi('/respond/cancel')
  static async cancelAssignment(name: string) {
    await RespondUtilities.employeeAbandonAssignment(name);
    return Promise.resolve();
  }
  

  //An employee request to mark the current assignment as completed
  @dkoa.postApi('/respond/fixed') 
  static async fixAlert(name: string) {
    await RespondUtilities.employeeCompleteAssignment(name);
  }
  

  //An employee request to ask for more time (simple redirect to above)
  @dkoa.postApi('/respond/more_time')
  static async extendAssignment(name: string) {
    DBOSKoa.koaContext.redirect(`/assignment?name=${encodeURIComponent(name)}&more_time=true`);
    return Promise.resolve();
  }


  //Delete all the alerts from the alert history
  @dkoa.postApi('/dashboard/cleanalerts')
  static async cleanAlerts() {
    await RespondUtilities.cleanAlerts();
    return Promise.resolve();
  }

  //Crash the app
  @dkoa.getApi('/crash')
  static crash() {
    return render("crash", {});
  } 
}