import express, { Express, Request, Response } from 'express';
import { FunctionContext, WorkflowContext, Operon, registerFunction, registerWorkflow } from 'operon';
import * as readline from 'node:readline/promises';

// Register an Operon function
const helloFunction = registerFunction(async (functionCtxt: FunctionContext, name: string) => {
    console.log("hello from function: " + name);
    return "function succeeded!";
});

// Register an Operon workflow
const helloWorkflow = registerWorkflow(async (workflowCtxt: WorkflowContext, name: string) => {
    console.log("hello from workflow: " + name);
    const funcResult: string = await helloFunction(workflowCtxt, name);
    console.log("workflow got function output: " + funcResult);
    return "workflow succeeded!";
});


async function startServer() {
    // Initialize Postgres and Operon.
    const rl = readline.createInterface(process.stdin, process.stdout);
    const username = await rl.question('Enter postgres username: ');
    const password = await rl.question('Enter postgres password: ');
    rl.close();
    const operon: Operon = new Operon({
        user: username,
        password: password,
    });

    // Invoke the workflow from an Express HTTP handler
    const app: Express = express();
    const port = 3000;
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.get('/:name', async (req: Request, res: Response) => {
        const { name } = req.params;
        const workflowResult: string = await helloWorkflow(operon, name);
        console.log("handler got workflow output: " + workflowResult);
        res.send('Operon says hello to: ' + name);
    });
    app.listen(port, () => {
        console.log(`[server]: Server is running at http://localhost:${port}`);
    });

}

startServer();