import { TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, GetApi } from '@dbos-inc/operon';
import { PrismaClient } from "@prisma/client";

export class Hello {

  @OperonTransaction()
  static async helloFunction(txnCtxt: TransactionContext, name: string)  {
    const greeting = `Hello, ${name}!`;
    console.log(greeting);
    const p: PrismaClient = txnCtxt.prismaClient as PrismaClient;
    const res = await p.operonHello.create({
        data: {
        greeting: greeting,
        },
    });

    console.log("invoked prisma got "+ res);
    return `Greeting ${res.greeting_id}: ${greeting}`;
  };

  @OperonWorkflow()
  @GetApi('/greeting/:name')
  static async helloWorkflow(workflowCtxt: WorkflowContext, name: string) {
    console.log("Received request with name " + name );
    // return await workflowCtxt.transaction(Hello.helloFunction, name);
    return await workflowCtxt.invoke(Hello).helloFunction(name);
  };

}