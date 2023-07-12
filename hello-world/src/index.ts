import express, { Express, Request, Response } from 'express';
import { FunctionContext, WorkflowContext, operon, registerFunction, registerWorkflow } from 'operon';

// Register an Operon function
const helloFunction = registerFunction((functionCtxt: FunctionContext, name: string) => {
    console.log("hello from function: " + name);
    return "function succeeded!";
});

// Register an Operon workflow
const helloWorkflow = registerWorkflow((workflowCtxt: WorkflowContext, name: string) => {
    console.log("hello from workflow: " + name);
    const funcResult: string = helloFunction(workflowCtxt, name);
    console.log("workflow got function output: " + funcResult);
    return "workflow succeeded!";
});

// Invoke the workflow from an Express HTTP handler
const app: Express = express();
const port = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/:name', (req: Request, res: Response) => {
    operon.helloWorld();
    const { name } = req.params;
    const workflowResult: string = helloWorkflow(operon, name);
    console.log("handler got workflow output: " + workflowResult);
    res.send('Operon says hello to: ' + name);
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
})