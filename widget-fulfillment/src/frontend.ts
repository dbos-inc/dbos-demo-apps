import { GetApi, HandlerContext, PostApi } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { ShopUtilities, OrderStatus } from "./utilities";
import { Liquid } from "liquidjs";

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
  static async payment(_ctxt: HandlerContext, name: string) {
    return render("fulfill_order", {
      name,
    });
  }
  
  @PostApi('/fulfill/cancel')
  static async cancelFulfill(ctxt: HandlerContext/*, name: string*/) {
    ctxt.koaContext.redirect('/');
    return Promise.resolve();
  }
  
  @PostApi('/fulfill/fulfilled') 
  static async completeFulfill(ctxt: HandlerContext/*, name: string*/) {
    // Handle fulfillment logic
    ctxt.koaContext.redirect('/');
    return Promise.resolve();
  }
  
  @PostApi('/fulfill/more_time')
  static async extendFulfill(ctxt: HandlerContext, name: string) {
    // Handle request for more time
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