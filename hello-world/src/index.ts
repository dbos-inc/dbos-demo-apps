import express, { Express, Request, Response } from 'express';
import { TransactionContext, WorkflowContext, Operon, } from 'operon';
import * as readline from 'node:readline/promises';

// Declare an Operon function
const helloFunction = async (txnCtxt: TransactionContext, name: string) => {
  const greeting = `Hello, ${name}!`
  const { rows } = await txnCtxt.client.query("INSERT INTO OperonHello(greeting) VALUES ($1) RETURNING greeting_id", [greeting])
  return `Greeting ${rows[0].greeting_id}: ${greeting}`;
};

// Declare an Operon workflow
const helloWorkflow = async (workflowCtxt: WorkflowContext, name: string) => {
  return await workflowCtxt.transaction(helloFunction, name);
};

async function startServer() {
  // Initialize Postgres and Operon.
  const operon: Operon = new Operon();
  await operon.init();
  await operon.pool.query("CREATE TABLE IF NOT EXISTS OperonHello (greeting_id SERIAL PRIMARY KEY, greeting TEXT);");
  operon.registerTransaction(helloFunction);
  operon.registerWorkflow(helloWorkflow);

  // Invoke the workflow from an Express HTTP handler
  const app: Express = express();
  const port = 3000;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get('/greeting/:name', async (req: Request, res: Response) => {
    const { name } = req.params;
    const greeting: string = await operon.workflow(helloWorkflow, {}, name);
    res.send(greeting);
  });
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}

startServer();