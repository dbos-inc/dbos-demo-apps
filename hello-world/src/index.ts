import express, { Express, Request, Response } from 'express';
import {FunctionContext, operon, Operon, OperonFunction, OperonWorkflow, registerFunction, registerWorkflow, WorkflowContext} from 'operon';

const app: Express = express();
const port = 3000;

const helloFunction: OperonFunction<[string], string> = (functionCtxt: FunctionContext, name: string) => {
    console.log("hello from function: " + name);
    return "function succeeded!";
};

const registeredHelloFunction = registerFunction(helloFunction);

const helloWorkflow: OperonWorkflow<[string], string> = (workflowCtxt: WorkflowContext, name: string) => {
    console.log("hello from workflow: " + name);
    const funcResult: string = registeredHelloFunction(workflowCtxt, name);
    console.log("workflow got function output: " + funcResult);
    return "workflow succeeded!";
};

const registeredHelloWorkflow = registerWorkflow(helloWorkflow);

// Body parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/:name', (req: Request, res: Response) => {
    operon.helloWorld();
    const { name } = req.params;
    const workflowResult: string = registeredHelloWorkflow(operon, name);
    console.log("handler got workflow output: " + workflowResult);
    res.send('Operon says hello to: ' + name);
});

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
})