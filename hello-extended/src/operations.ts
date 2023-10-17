import { TransactionContext, OperonTransaction, GetApi, PostApi, CommunicatorContext, OperonCommunicator, OperonWorkflow, WorkflowContext } from '@dbos-inc/operon'
import { Knex } from 'knex';
import axios from 'axios';

export interface operon_hello {
  name: string;
  greet_count: number;
}

export class Hello {

  @GetApi('/greeting/:user')
  @OperonWorkflow()
  static async helloWorkflow(ctxt: WorkflowContext, user: string) {
    const greeting = await ctxt.invoke(Hello).helloTransaction(user);
    try {
      await ctxt.invoke(Hello).greetPostman(greeting);
      return greeting;
    } catch (e) {
      ctxt.logger.error(e);
      await ctxt.invoke(Hello).rollbackHelloTransaction(user);
      return `Greeting failed for ${user}\n`
    }
  }

  @OperonTransaction()  // Declare this function to be a transaction.
  static async helloTransaction(ctxt: TransactionContext<Knex>, user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const rows = await ctxt.client<operon_hello>("operon_hello")
      .insert({ name: user, greet_count: 1 })
      .onConflict("name") // If user is already present, increment greet_count.
        .merge({ greet_count: ctxt.client.raw('operon_hello.greet_count + 1') })
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
  static async greetPostman(ctxt: CommunicatorContext, greeting: string) {
    await axios.get("https://postman-echo.com/get", {
      params: {
        greeting: greeting
      }
    });
    ctxt.logger.info(`Greeting sent to postman!`);
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
