import {
    TransactionContext, Transaction, CommunicatorContext, Communicator,
    WorkflowContext, Workflow, GetApi, HandlerContext
} from "@dbos-inc/dbos-sdk";
import { Knex } from "knex";
import axios from 'axios';

interface GreetingRecord {
  name: string;
  note: string;
}

export class Greetings {
  @GetApi('/') // Serve a quick readme for the app
  static async readme(_ctxt: HandlerContext) {
    const readme = '<html><body><p>' +
      'Welcome! Visit the route /greeting/:name to be greeted!<br>' +
      'For example, visit <a href="/greeting/dbos">/greeting/dbos</a>.<br>' +
      '</p></body></html>';
    return Promise.resolve(readme);
  }

  @Transaction({readOnly: true})
  @GetApi('/greetings')
  static async allGreetings(ctxt: TransactionContext<Knex>) {
    return await ctxt.client('greetings').select('*') as GreetingRecord[];
  }

  @Communicator()
  static async SignGuestbook(ctxt: CommunicatorContext, name: string) {
    const key = process.env.GUESTBOOK_KEY
    if (key.length != 36) {
      throw new DBOSResponseError("Please set the guestbook key in dbos-config.yaml", 401);
    }
    const url = 'https://demo-guestbook.cloud.dbos.dev/record_greeting';
    const payload = {
      'key':  process.env.GUESTBOOK_KEY, //set in dbos-config.yaml
      'name': name
    };
    const headers = { 'Content-Type': 'application/json' };
    const response = await axios.post(url, payload, { headers: headers });
    ctxt.logger.info(`Signed the Guestbook: ${JSON.stringify(response.data)}`);
  }

  @Transaction()
  static async InsertGreeting(ctxt: TransactionContext<Knex>, gr: GreetingRecord) {
    await ctxt.client('greetings').insert(gr);
    ctxt.logger.info(`Greeting to ${gr.name} recorded in the database!`);
  }

  @Workflow()
  static async GreetingWorkflow(ctxt: WorkflowContext, friend: string, noteContent: string) {
      await ctxt.invoke(Greetings).SignGuestbook(friend);
      for (let i = 0; i < 5; i++) {
          ctxt.logger.info("Press Control + C to stop the app...");
          await ctxt.sleepms(1000);
      }
      await ctxt.invoke(Greetings).InsertGreeting(
        { name: friend, note: noteContent }
      );
  }

  @GetApi('/greeting/:friend')
  static async Greeting(ctxt: HandlerContext, friend: string) {
    const noteContent = `Thank you for being awesome, ${friend}!`;
    await ctxt.startWorkflow(Greetings).GreetingWorkflow(friend, noteContent);
    return Promise.resolve(noteContent);
  }
}

