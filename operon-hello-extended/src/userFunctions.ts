import { TransactionContext, OperonTransaction, GetApi, HandlerContext, PostApi, CommunicatorContext, OperonCommunicator } from '@dbos-inc/operon'
import { Knex } from 'knex';
import axios from 'axios';

type KnexTransactionContext = TransactionContext<Knex>;

interface operon_hello {
  name: string;
  greet_count: number;
}
export class Hello {

  @OperonTransaction()
  static async helloTransaction(txnCtxt: KnexTransactionContext, name: string) {
    // Increment greet_count.
    await txnCtxt.client<operon_hello>("operon_hello")
      .insert({ name: name, greet_count: 1 })
      .onConflict('name')
      .merge({ greet_count: txnCtxt.client.raw('operon_hello.greet_count + 1') });
    // Retrieve greet_count.
    const greet_count = await txnCtxt.client<operon_hello>("operon_hello")
      .select("greet_count")
      .where({ name: name })
      .first()
      .then(row => row?.greet_count);
    return `Hello, ${name}! You have been greeted ${greet_count} times.\n`;
  }

  @GetApi('/greeting/:name')
  static async helloHandler(handlerCtxt: HandlerContext, name: string) {
    const greeting = await handlerCtxt.invoke(Hello).helloTransaction(name);
    handlerCtxt.invoke(Hello).postmanFunction(greeting);
    return greeting;
  }

  @OperonTransaction()
  static async clearTransaction(txnCtxt: KnexTransactionContext, name: string) {
    // Delete greet_count for a user.
    await txnCtxt.client<operon_hello>("operon_hello")
      .where({ name: name })
      .delete()
    return `Cleared greet_count for ${name}!\n`
  }

  @PostApi('/clear/:name')
  static async clearHandler(handlerCtxt: HandlerContext, name: string) {
    return handlerCtxt.invoke(Hello).clearTransaction(name);
  }

  @OperonCommunicator()
  static async postmanFunction(_commCtxt: CommunicatorContext, greeting: string) {
    try {
      await axios.get("https://postman-echo.com/get", {
        params: {
          greeting: greeting
        }
      });
      console.log(`Greeting sent to postman!`)
      return true;
    } catch (e) {
      console.warn("Error sending request:", e);
      return false;
    }
  }
}
