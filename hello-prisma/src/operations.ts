import { TransactionContext, HandlerContext, OperonTransaction, GetApi } from '@dbos-inc/dbos-sdk';
import { PrismaClient } from "@prisma/client";

export class Hello {

  @OperonTransaction()
  static async helloTransaction(txnCtxt: TransactionContext<PrismaClient>, name: string)  {
    const greeting = `Hello, ${name}!`;
    console.log(greeting);
    const p: PrismaClient = txnCtxt.client as PrismaClient;
    const res = await p.operonHello.create({
        data: {
        greeting: greeting,
        },
    });
    return `Greeting ${res.greeting_id}: ${greeting}`;
  };


  @GetApi('/greeting/:name')
  static async helloHandler(handlerCtxt: HandlerContext, name: string) {
    return handlerCtxt.invoke(Hello).helloTransaction(name);
  }

}