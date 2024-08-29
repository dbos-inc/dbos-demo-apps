import { HandlerContext, TransactionContext, Transaction, GetApi, ArgSource, ArgSources } from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';
import { WebSocket } from 'ws';


// The schema of the database table used in this example.
export interface dbos_hello {
  name: string;
  greet_count: number;
}

export class Hello {

  @GetApi('/') // Serve a quick readme for the app
  static async readme(_ctxt: HandlerContext) {
    const readme = `<html><body><p>
           Welcome to the DBOS Hello App!<br><br>
           Visit the route /greeting/:name to be greeted!<br>
           For example, visit <a href="/greeting/dbos">/greeting/dbos</a>.<br>
           The counter increments with each page visit.<br>
           If you visit a new name like <a href="/greeting/alice">/greeting/alice</a>, the counter starts at 1.
           </p></body></html>`;
    return Promise.resolve(readme);
  }

  @GetApi('/greeting/:user') // Serve this function from HTTP GET requests to the /greeting endpoint with 'user' as a path parameter
  @Transaction()  // Run this function as a database transaction
  static async helloTransaction(ctxt: TransactionContext<Knex>, @ArgSource(ArgSources.URL) user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const query = "INSERT INTO dbos_hello (name, greet_count) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET greet_count = dbos_hello.greet_count + 1 RETURNING greet_count;";
    const { rows } = await ctxt.client.raw(query, [user]) as { rows: dbos_hello[] };
    const greet_count = rows[0].greet_count;
    return `Hello, ${user}! You have been greeted ${greet_count} times.\n`;
  }

  @GetApi('/ws') 
  static async sendToClient(ctx: HandlerContext) {
    // const { req, socket, head } = ctx.request;

    // Upgrade the request to a WebSocket
    const wss = new WebSocket.Server({ noServer: true });
    
    wss.handleUpgrade(ctx.koaContext.req, ctx.koaContext.socket, Buffer.alloc(0), (ws) => {
        wss.emit('connection', ws, ctx.koaContext.req);

        (async function poll() {
          try {
            while (ws.readyState === WebSocket.OPEN) {

              // create some data. In a real app, this would be an order id or some data that the client needs to know about
              const event = Math.floor(Math.random() * 1000000) + 1; 
              if (event) {
                ws.send(JSON.stringify(event)); // Send event to the client
              }
              await Hello.sleep(1000);  // Pause for a second between polls
            }
          } catch (err) {
            console.error('Error during polling:', err);
          }
        })();

        // Handle WebSocket events
        ws.on('message', (message) => {
            console.log('Received:', message.toString());
            ws.send('Hello from server!');
        });

        ws.on('close', () => {
            console.log('Connection closed');
        });
    });

    ctx.koaContext.respond = false;

  }

  static sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}
