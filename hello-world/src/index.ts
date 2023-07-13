import express, { Express, Request, Response } from 'express';
import { FunctionContext, WorkflowContext, Operon, registerFunction, registerWorkflow } from 'operon';
import * as readline from 'node:readline/promises';

// Register an Operon function
const helloFunction = registerFunction(async (functionCtxt: FunctionContext, name: string) => {
  const greeting = `Hello, ${name}!`
  const { rows } = await functionCtxt.client.query("INSERT INTO OperonHello(greeting) VALUES ($1) RETURNING greeting_id", [greeting])
  return `Greeting ${rows[0].greeting_id}: ${greeting}`;
});

// Register an Operon workflow
const helloWorkflow = registerWorkflow(async (workflowCtxt: WorkflowContext, name: string) => {
  return await helloFunction(workflowCtxt, name);
});

async function startServer() {
  // Initialize Postgres and Operon.
  const rl = readline.createInterface(process.stdin, process.stdout);
  const database = await rl.question('Enter postgres database: ');
  const username = await rl.question('Enter postgres username: ');
  const password = await rl.question('Enter postgres password: ');
  rl.close();
  const operon: Operon = new Operon({
    database: database,
    user: username,
    password: password,
  });
  operon.pool.query("CREATE TABLE IF NOT EXISTS OperonHello (greeting_id SERIAL PRIMARY KEY, greeting TEXT);");

  // Invoke the workflow from an Express HTTP handler
  const app: Express = express();
  const port = 3000;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get('/:name', async (req: Request, res: Response) => {
    const { name } = req.params;
    const greeting: string = await helloWorkflow(operon, name);
    res.send(greeting);
  });
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });

}

startServer();