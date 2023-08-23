import express, { Express, Request, Response } from "express";
import { TransactionContext, WorkflowContext, Operon, OperonTransaction, OperonWorkflow } from "operon";

interface OperonHello {
  greeting_id: number;
  greeting: string;
}

class Hello {
  // Declare an Operon function
  @OperonTransaction()
  static async helloFunction(txnCtxt: TransactionContext, name: string) {
    const greeting = `Hello, ${name}!`;
    const { rows } = await txnCtxt.pgClient.query<OperonHello>(
      "INSERT INTO OperonHello(greeting) VALUES ($1) RETURNING greeting_id",
      [greeting]
    );
    return `Greeting ${rows[0].greeting_id}: ${greeting}`;
  }

  // Declare an Operon workflow
  @OperonWorkflow()
  static async helloWorkflow(workflowCtxt: WorkflowContext, name: string) {
    return await workflowCtxt.transaction(Hello.helloFunction, name);
  }
}

async function startServer() {
  // Initialize Postgres and Operon.
  const operon: Operon = new Operon();
  operon.useNodePostgres();
  operon.registerDecoratedWT();
  await operon.init();
  await operon.userDatabase.query(
    "CREATE TABLE IF NOT EXISTS OperonHello (greeting_id SERIAL PRIMARY KEY, greeting TEXT);"
  );

  // Invoke the workflow from an Express HTTP handler
  const app: Express = express();
  const port = 3000;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/greeting/:name", async (req: Request, res: Response) => {
    const { name } = req.params;
    const greeting: string = await operon.workflow(Hello.helloWorkflow, {}, name).getResult();
    res.send(greeting);
  });
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}

void startServer();
