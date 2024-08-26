import { GetApi, HandlerContext } from "@dbos-inc/dbos-sdk";
import path from "path";
import { Liquid } from "liquidjs";

const engine = new Liquid({
  root: path.resolve(__dirname, "..", "public"),
});

async function render(file: string, ctx?: object): Promise<string> {
  return (await engine.renderFile(file, ctx)) as string;
}

export class Frontend {
  @GetApi("/")
  static frontend(_ctxt: HandlerContext) {
    return render("app.html", {});
  }
}
