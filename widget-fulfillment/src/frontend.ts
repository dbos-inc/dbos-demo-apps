import { GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
//import { ShopUtilities, OrderStatus } from "./utilities";
import { Liquid } from "liquidjs";
import { FulfillUtilities } from "./utilities";
import { CurrentTimeCommunicator } from "@dbos-inc/communicator-datetime";

const timeToPackOrder = 60;

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
  static async payment(ctxt: HandlerContext, name: string) {
    const ctime = await ctxt.invoke(CurrentTimeCommunicator).getCurrentTime();
    const expiration = ctime + timeToPackOrder*1000;
    const userRec = await ctxt.invoke(FulfillUtilities).getUserAssignment(name, new Date(expiration));
    console.log(`${JSON.stringify(userRec)}`);
    if (!userRec.order_id) {
      return render('check_orders', { name });
    }
    return render("fulfill_order", {
      name,
      userRec,
      expirationSecs: (expiration-ctime) / 1000
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
    ctxt.koaContext.redirect(`/fulfill?name=${encodeURIComponent(name)}`);
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