import { ArgOptional, GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { Liquid } from "liquidjs";
import { FulfillUtilities, OrderStatus } from "./utilities";
import { Fulfillment, OrderPackerInfo } from "./operations";

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'views'),
  extname: ".liquid"
});

async function render(file: string, ctx?: object): Promise<string> {
  return await engine.renderFile(file, ctx) as string;
}

export class Frontend {

  @GetApi('/')
  static async userPick(_ctxt: HandlerContext) {
    return await render("index", {});
  }

  @PostApi('/')
  static async setUser(ctxt: HandlerContext, name: string) {
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}`);
    return Promise.resolve();
  }

  @GetApi('/fulfill')
  static async fulfillment(ctxt: HandlerContext, name: string, @ArgOptional more_time: boolean | undefined) {
    const userRecWF = await ctxt.startWorkflow(Fulfillment).userAssignmentWorkflow(name, more_time);
    const userRec = await ctxt.getEvent<OrderPackerInfo>(userRecWF.getWorkflowUUID(), 'rec');
    if (!userRec) {
      ctxt.koaContext.redirect('/');
      return;
    }
    if (!userRec.packer.order_id || !userRec.expirationSecs) {
      return render('check_orders', { name });
    }
    return render("fulfill_order", {
      name,
      packer: userRec.packer,
      order: userRec.order,
      expirationSecs: Math.round(userRec.expirationSecs),
    });
  }
  
  @GetApi('/dashboard')
  static async dashboard(ctxt: HandlerContext) {
    const {orders, packers} = await ctxt.invoke(FulfillUtilities).popDashboard();
    return render("dashboard", {
      orders,
      packers,
      fulfilled: OrderStatus.FULFILLED,
    });
  }
  
  @PostApi('/fulfill/cancel')
  static async cancelFulfill(ctxt: HandlerContext, name: string) {
    await ctxt.invoke(FulfillUtilities).packerAbandonAssignment(name);
    ctxt.koaContext.redirect('/');
    return Promise.resolve();
  }
  
  @PostApi('/fulfill/fulfilled') 
  static async completeFulfill(ctxt: HandlerContext, name: string) {
    // Handle fulfillment logic
    await ctxt.invoke(FulfillUtilities).packerCompleteAssignment(name);
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}`);
  }
  
  @PostApi('/fulfill/more_time')
  static async extendFulfill(ctxt: HandlerContext, name: string) {
    // Handle request for more time - this is basically a page reload...
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}&more_time=true`);
    return Promise.resolve();
  }

  @PostApi('/dashboard/cleanorders')
  static async cleanOrders(ctxt: HandlerContext) {
    await ctxt.invoke(FulfillUtilities).cleanOrders();
    ctxt.koaContext.redirect(`/dashboard`);
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