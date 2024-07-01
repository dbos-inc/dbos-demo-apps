import {
  TransactionContext, Transaction,
  GetApi, CommunicatorContext,
  Communicator, WorkflowContext,
  Workflow,
} from "@dbos-inc/dbos-sdk";
import { Knex } from "knex";

export class Greetings {
  @Communicator()
  static async SendGreetingEmail(ctxt: CommunicatorContext, friend: string, content: string) {
      ctxt.logger.info(`Sending email "${content}" to ${friend}...`);
      // Code omitted for simplicity
      ctxt.logger.info("Email sent!");
      return Promise.resolve();
  }

  @Transaction()
  static async InsertGreeting(ctxt: TransactionContext<Knex>, friend: string, content: string) {
      await ctxt.client.raw(
          "INSERT INTO dbos_greetings (greeting_name, greeting_note_content) VALUES (?, ?)",
          [friend, content]
      );
  }

  @Workflow()
  @GetApi("/greeting/:friend")
  static async GreetingWorkflow(ctxt: WorkflowContext, friend: string) {
      const noteContent = `Thank you for being awesome, ${friend}!`;
      await ctxt.invoke(Greetings).SendGreetingEmail(friend, noteContent);

      for (let i = 0; i < 5; i++) {
          ctxt.logger.info(
              "Press control + C to interrupt the workflow..."
          );
          await ctxt.sleep(1);
      }

      await ctxt.invoke(Greetings).InsertGreeting(friend, noteContent);
      ctxt.logger.info(`Greeting sent to ${friend}!`);
      return noteContent;
  }
}
