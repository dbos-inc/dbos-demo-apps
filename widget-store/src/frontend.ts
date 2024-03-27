import { GetApi, HandlerContext } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ShopUtilities } from "./utilities";
import { Liquid } from "liquidjs";

const engine = new Liquid({
  root: path.resolve(__dirname, '..', 'public'),
  extname: ".liquid"
});

function render(file: string, ctx?: object): Promise<string> {
  return engine.renderFile(file, ctx);
}

export class Frontend {

  @GetApi('/')
  static async frontend(ctxt: HandlerContext) {
    const inventory = await ctxt.invoke(ShopUtilities).retrieveInventory();
    return await render("purchase", {
      uuid: uuidv4(),
      inventory: inventory,
    });
  }

  @GetApi('/payment/:key')
  static payment(_ctxt: HandlerContext, key: string) {
    return render("payment", {
      uuid: key,
    });
  }

  @GetApi('/error')
  static error(_ctxt: HandlerContext) {
    return render("error", {});
  }

  @GetApi('/success')
  static success(_ctxt: HandlerContext) {
    return render("success", {});
  }

  @GetApi('/crash')
  static crash(_ctxt: HandlerContext) {
    return render("crash", {});
  }
}