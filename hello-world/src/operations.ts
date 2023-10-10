import {
  TransactionContext,
  WorkflowContext,
  OperonTransaction,
  OperonWorkflow,
  GetApi,
  HandlerContext,
} from "@dbos-inc/operon";

import { Knex } from 'knex';

interface operon_hello {
  name: string;
  greet_count: number;
}

export class Hello {
  @OperonTransaction()
  static async helloFunction(txnCtxt: TransactionContext<Knex>, name: string) {
    const greeting = `Hello, ${name}!`;
    let greet_count = await txnCtxt.client<operon_hello>("operon_hello")
      .select("greet_count")
      .where({ name: name })
      .first()
      .then(row => row?.greet_count);
    if (greet_count) {
      // If greet_count is set, increment it.
      greet_count++;
      await txnCtxt.client<operon_hello>("operon_hello")
        .where({ name: name })
        .increment('greet_count', 1);
    } else {
      // If greet_count is not set, set it to 1.
      greet_count = 1;
      await txnCtxt.client<operon_hello>("operon_hello")
        .insert({ name: name, greet_count: 1 })
    }
    
    txnCtxt.logger.info(`Inserted greeting ${greet_count}: ${greeting}`);
    return `Greeting ${greet_count}: ${greeting}`;
  }

  @OperonWorkflow()
  static async helloWorkflow(wfCtxt: WorkflowContext, name: string) {
    wfCtxt.logger.info("Hello, workflow!");
    return await wfCtxt.invoke(Hello).helloFunction(name);
  }

  @GetApi("/greeting/:name")
  static async helloEndpoint(ctx: HandlerContext, name: string) {
    ctx.logger.info("helloEndpoint");
    return await ctx
      .invoke(Hello)
      .helloWorkflow(name)
      .then((x) => x.getResult());
  }
}
