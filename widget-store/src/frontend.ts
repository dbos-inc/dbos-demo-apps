import { GetApi, HandlerContext } from "@dbos-inc/dbos-sdk";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ShopUtilities, OrderStatus } from "./utilities";
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
    const prod = await ctxt.invoke(ShopUtilities).retrieveProduct();
    return await render("purchase", {
      uuid: uuidv4(),
      inventory: prod.inventory,
      product: prod.product,
      description: prod.description,
      price: prod.price,
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

  @GetApi('/crash')
  static crash(_ctxt: HandlerContext) {
    return render("crash", {});
  }

  @GetApi('/order/:order_id')
  static async order(ctxt: HandlerContext, order_id: number) {
    const order = await ctxt.invoke(ShopUtilities).retrieveOrder(order_id);
    return await render("order_status", {
      order_id: order.order_id,
      status: OrderStatus[order.order_status],
      time: order.last_update_time
    });
  }
  
}