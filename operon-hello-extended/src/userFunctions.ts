import { TransactionContext, OperonTransaction, GetApi, HandlerContext, PostApi, CommunicatorContext, OperonCommunicator, OperonWorkflow, WorkflowContext } from '@dbos-inc/operon'
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

  @OperonTransaction()
  static async rollbackHelloTransaction(txnCtxt: KnexTransactionContext, name: string) {
    // Decrement greet_count.
    await txnCtxt.client<operon_hello>("operon_hello")
      .where({ name: name })
      .decrement('greet_count', 1);
  }

  @OperonCommunicator()
  static async postmanFunction(_commCtxt: CommunicatorContext, greeting: string) {
    await axios.get("https://postman-echo.com/get", {
      params: {
        greeting: greeting
      }
    });
    console.log(`Greeting sent to postman!`);
  }

  @GetApi('/greeting/:name')
  @OperonWorkflow()
  static async helloWorkflow(wfCtxt: WorkflowContext, name: string) {
    const greeting = await wfCtxt.invoke(Hello).helloTransaction(name);
    try {
      await wfCtxt.invoke(Hello).postmanFunction(greeting);
      return greeting;
    } catch (e) {
      console.warn("Error sending request:", e);
      await wfCtxt.invoke(Hello).rollbackHelloTransaction(name);
      return `Greeting failed for ${name}\n`
    }
  }

  @PostApi('/clear/:name')
  @OperonTransaction()
  static async clearTransaction(txnCtxt: KnexTransactionContext, name: string) {
    // Delete greet_count for a user.
    await txnCtxt.client<operon_hello>("operon_hello")
      .where({ name: name })
      .delete()
    return `Cleared greet_count for ${name}!\n`
  }
}
