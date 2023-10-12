import { TransactionContext, OperonTransaction, GetApi, HandlerContext, PostApi, CommunicatorContext, OperonCommunicator, OperonWorkflow, WorkflowContext } from '@dbos-inc/operon'
import { Knex } from 'knex';
import axios from 'axios';

interface operon_hello {
  name: string;
  greet_count: number;
}

export class Hello {

  @GetApi('/greeting/:name')
  @OperonWorkflow()
  static async helloWorkflow(ctxt: WorkflowContext, name: string) {
    const greeting = await ctxt.invoke(Hello).helloTransaction(name);
    try {
      await ctxt.invoke(Hello).greetPostman(greeting);
      return greeting;
    } catch (e) {
      console.warn("Error sending request:", e);
      await ctxt.invoke(Hello).rollbackHelloTransaction(name);
      return `Greeting failed for ${name}\n`
    }
  }

  @OperonTransaction()  // Declare this function to be a transaction.
  static async helloTransaction(ctxt: TransactionContext<Knex>, user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const rows = await ctxt.client<operon_hello>("operon_hello")
      // Insert greet_count for this user.
      .insert({ name: user, greet_count: 1 })
      // If already present, increment it instead.
      .onConflict("name").merge({ greet_count: ctxt.client.raw('operon_hello.greet_count + 1') })
      // Return the inserted or incremented value.
      .returning("greet_count");
    const greet_count = rows[0].greet_count;
    return `Hello, ${user}! You have been greeted ${greet_count} times.\n`;
  }

  @OperonTransaction()
  static async rollbackHelloTransaction(ctxt: TransactionContext<Knex>, user: string) {
    // Decrement greet_count.
    await ctxt.client<operon_hello>("operon_hello")
      .where({ name: user })
      .decrement('greet_count', 1);
  }

  @OperonCommunicator()
  static async greetPostman(_ctxt: CommunicatorContext, greeting: string) {
    await axios.get("https://postman-echo.com/get", {
      params: {
        greeting: greeting
      }
    });
    console.log(`Greeting sent to postman!`);
  }

  @PostApi('/clear/:user')
  @OperonTransaction()
  static async clearTransaction(ctxt: TransactionContext<Knex>, user: string) {
    // Delete greet_count for a user.
    await ctxt.client<operon_hello>("operon_hello")
      .where({ name: user })
      .delete()
    return `Cleared greet_count for ${user}!\n`
  }
}
