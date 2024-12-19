import { DBOS } from '@dbos-inc/dbos-sdk';
import express, { Request, Response } from 'express';

export class Guestbook {

  // Sign the guestbook using an HTTP POST request
  @DBOS.step()
  static async signGuestbook(name: string): Promise<void> {
    await fetch("https://demo-guestbook.cloud.dbos.dev/record_greeting", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    console.log(`>>> STEP 1: Signed the guestbook for ${name}`);
  }

  // Record the greeting in the database using Knex.js
  @DBOS.transaction()
  static async insertGreeting(name: string): Promise<void> {
    await DBOS.knexClient('dbos_greetings').insert({ greeting_name: name });
    console.log(`>>> STEP 2: Greeting to ${name} recorded in the database!`);
  }

  @DBOS.workflow()
  static async greetingEndpoint(name: string): Promise<string> {
    await Guestbook.signGuestbook(name);
    for (let i = 0; i < 5; i++) {
      console.log("Press Control + C to stop the app...");
      await DBOS.sleep(1000);
    }
    await Guestbook.insertGreeting(name);
    return `Thank you for being awesome, ${name}!`;
  }
}

// Create an HTTP endpoint using Express.js
export const app = express();
app.use(express.json());

app.get('/greeting/:name', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.params;
  res.send(await Guestbook.greetingEndpoint(name));
});
