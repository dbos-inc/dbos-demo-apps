import { DBOS, DBOSResponseError } from "@dbos-inc/dbos-sdk";

interface GreetingRecord {
  name: string;
  note: string;
}

export class Greetings {
  @DBOS.getApi('/') // Serve a quick readme for the app
  static async readme() {
    const readme = '<html><body><p>' +
      'Welcome! Visit the route /greeting/:name to be greeted!<br>' +
      'For example, visit <a href="/greeting/dbos">/greeting/dbos</a>.<br>' +
      '</p></body></html>';
    return Promise.resolve(readme);
  }

  @DBOS.transaction({readOnly: true})
  @DBOS.getApi('/greetings')
  static async allGreetings() {
    return await DBOS.knexClient('greetings').select('*') as GreetingRecord[];
  }

  @DBOS.step()
  static async signGuestbook(name: string) {
    const key = process.env.GUESTBOOK_KEY;  //set in dbos-config.yaml
    if (!key || key.length !== 36) {
      throw new DBOSResponseError("Please set the guestbook key in dbos-config.yaml", 401);
    }
    const response = await fetch('https://demo-guestbook.cloud.dbos.dev/record_greeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({ 'key':  key, 'name': name})
    });
    const responseStr = JSON.stringify(await response.json());
    if (!response.ok) {
      throw new DBOSResponseError(responseStr);
    }
    DBOS.logger.info(`>>> STEP 1: Signed the Guestbook: ${responseStr}`);
  }

  @DBOS.transaction()
  static async insertGreeting(gr: GreetingRecord) {
    await DBOS.knexClient('greetings').insert(gr);
    DBOS.logger.info(`>>> STEP 2: Greeting to ${gr.name} recorded in the database!`);
  }

  @DBOS.workflow()
  static async greetingWorkflow(friend: string, noteContent: string) {
      await Greetings.signGuestbook(friend);
      for (let i = 0; i < 5; i++) {
          DBOS.logger.info("Press Control + C to stop the app...");
          await DBOS.sleepms(1000);
      }
      await Greetings.insertGreeting(
        { name: friend, note: noteContent }
      );
  }

  @DBOS.getApi('/greeting/:friend')
  static async greeting(friend: string) {
    const noteContent = `Thank you for being awesome, ${friend}!`;
    await DBOS.startWorkflow(Greetings).greetingWorkflow(friend, noteContent);
    return Promise.resolve(noteContent);
  }
}

