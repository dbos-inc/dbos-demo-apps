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
           Welcome to the DBOS Websockets demo app!<br><br>

           This app demonstrates a simple Websocket server that sends random events to the client.<br>

           Run the client wsclient.js or wsclient.py as per instructions in README.md to see websockets in action.<br>
            <br>
           </p></body></html>`;
    return Promise.resolve(readme);
  }


  @GetApi('/ws') 
  static async sendToClient(ctx: HandlerContext) {

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
              await Hello.sleep(1000);  // Pause for a second between polls for demonstration purposes
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
