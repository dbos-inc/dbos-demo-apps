import {
  TransactionContext,
  WorkflowContext,
  OperonTransaction,
  OperonWorkflow,
  GetApi,
  HandlerContext,
} from "@dbos-inc/operon";

export class Hello {
  @OperonTransaction()
  static async helloFunction(txnCtxt: TransactionContext, name: string) {
    const greeting = `Hello, ${name}!`;
    const { rows } = await txnCtxt.pgClient.query<{ greeting_id: number }>(
      "INSERT INTO OperonHello(greeting) VALUES ($1) RETURNING greeting_id",
      [greeting]
    );
    txnCtxt.log(`Inserted greeting ${rows[0].greeting_id}: ${greeting}`);
    return `Greeting ${rows[0].greeting_id}: ${greeting}`;
  }

  @OperonWorkflow()
  static async helloWorkflow(wfCtxt: WorkflowContext, name: string) {
    wfCtxt.log("Hello, workflow!");
    return await wfCtxt.invoke(Hello).helloFunction(name);
  }

  @GetApi("/greeting/:name")
  static async helloEndpoint(ctx: HandlerContext, name: string) {
    ctx.log("helloEndpoint");
    return await ctx
      .invoke(Hello)
      .helloWorkflow(name)
      .then((x) => x.getResult());
  }
}
