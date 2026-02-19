import { DBOS, WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { KnexDataSource } from "@dbos-inc/knex-datasource";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

export const app = express();
app.use(express.json());

const queue = new WorkflowQueue("example_queue");

// Note, there is no requirement to use DBOS_DATABASE_URL with DBOS Data Sources if you're self hosting.
// We are using DBOS_DATABASE_URL here so this demo application can run in DBOS Cloud.

const config = {
  client: "pg",
  connection:
    process.env.DBOS_DATABASE_URL ||
    `postgresql://postgres:${process.env.PGPASSWORD || "dbos"}@localhost:5432/dbos_node_toolbox`,
};

const knexds = new KnexDataSource("app-db", config);

//////////////////////////////////
//// Workflows and steps
//////////////////////////////////

async function stepOne() {
  DBOS.logger.info("Step one completed!");
}

async function stepTwo() {
  DBOS.logger.info("Step two completed!");
}

async function exampleWorkflowFunc() {
  await DBOS.runStep(() => stepOne(), { name: "stepOne" });
  await DBOS.runStep(() => stepTwo(), { name: "stepTwo" });
}

const exampleWorkflow = DBOS.registerWorkflow(exampleWorkflowFunc);

//////////////////////////////////
//// Queues
//////////////////////////////////

async function taskFunction(n: number) {
  await DBOS.sleep(5000);
  DBOS.logger.info(`Task ${n} completed!`);
}
const taskWorkflow = DBOS.registerWorkflow(taskFunction, {
  name: "taskWorkflow",
});

async function queueFunction() {
  DBOS.logger.info("Enqueueing tasks!");
  const handles = [];
  for (let i = 0; i < 10; i++) {
    handles.push(
      await DBOS.startWorkflow(taskWorkflow, { queueName: queue.name })(i),
    );
  }
  const results = [];
  for (const h of handles) {
    results.push(await h.getResult());
  }
  DBOS.logger.info(`Successfully completed ${results.length} tasks`);
}
const queueWorkflow = DBOS.registerWorkflow(queueFunction, {
  name: "queueWorkflow",
});

//////////////////////////////////
//// Scheduled workflows
//////////////////////////////////

async function runEvery15Min(scheduledTime: Date, _context: unknown) {
  DBOS.logger.info(
    `I am a scheduled workflow. It is currently ${scheduledTime}.`,
  );
}
const scheduledWorkflow = DBOS.registerWorkflow(runEvery15Min);

//////////////////////////////////
//// Transactions
//////////////////////////////////

async function insertRow() {
  await knexds.client.raw("INSERT INTO example_table (name) VALUES (?)", [
    "dbos",
  ]);
}

async function countRows() {
  const result = await knexds.client.raw(
    "SELECT COUNT(*) as count FROM example_table",
  );
  const count = result.rows[0].count;
  DBOS.logger.info(`Row count: ${count}`);
}

async function transactionWorkflowFunc() {
  await knexds.runTransaction(() => insertRow(), { name: "insertRow" });
  await knexds.runTransaction(() => countRows(), {
    name: "countRows",
    readOnly: true,
  });
}
const transactionWorkflow = DBOS.registerWorkflow(transactionWorkflowFunc, {
  name: "transactionWorkflow",
});

/////////////////////////////////////
//// Express.js HTTP endpoints
/////////////////////////////////////

app.get("/workflow", async (_req, res) => {
  await exampleWorkflow();
  res.send();
});

app.get("/queue", async (_req, res) => {
  await queueWorkflow();
  res.send();
});

app.get("/transaction", async (_req, res) => {
  await transactionWorkflow();
  res.send();
});

/////////////////////////////////////
//// Readme
/////////////////////////////////////

app.get("/", (_, res) => {
  const readme = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" href="https://dbos-blog-posts.s3.us-west-1.amazonaws.com/live-demo/favicon.ico" type="image/x-icon">
        <script src="https://cdn.tailwindcss.com"></script>
        <title>DBOS Toolbox</title>
    </head>
    <body class="bg-gray-100 min-h-screen font-sans">
        <div class="max-w-2xl mx-auto py-12 px-4">
            <div class="bg-white rounded-lg shadow-lg p-8 space-y-8">
                <h1 class="text-3xl font-bold text-gray-900">Welcome to the DBOS Toolbox!</h1>
                
                <p class="text-gray-600">
                    This app contains example code for many DBOS features. You can use it as a template when starting a new DBOS app—start by editing <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">src/main.ts</code>.
                </p>

                <p class="text-gray-600">
                    Each endpoint launches a new workflow—<strong>view the app logs to see them run.</strong>
                </p>

                <div class="space-y-4">
                    <div class="text-gray-600">
                        Workflows: <button onclick="fetch('/workflow')" class="text-blue-600 hover:text-blue-800 font-medium">/workflow</button>
                    </div>
                    <div class="text-gray-600">
                        Queues: <button onclick="fetch('/queue')" class="text-blue-600 hover:text-blue-800 font-medium">/queue</button>
                    </div>
                    <div class="text-gray-600">
                        Transactions: <button onclick="fetch('/transaction')" class="text-blue-600 hover:text-blue-800 font-medium">/transaction</button>
                    </div>
                </div>
                
                <div class="space-y-6">
                    <p class="text-gray-800 font-medium">To get started developing locally:</p>
                    <ul class="space-y-4">
                        <li class="flex items-start">
                            <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                                <span class="text-blue-600 text-sm font-medium">1</span>
                            </span>
                            <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">npx @dbos-inc/create@latest --template dbos-node-toolbox</code>
                        </li>
                        <li class="flex items-start">
                            <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                                <span class="text-blue-600 text-sm font-medium">2</span>
                            </span>
                            Edit <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">src/main.ts</code> to start building!
                        </li>
                    </ul>
                </div>

                <p class="text-gray-600">
                    Check out the
                    <a href="https://docs.dbos.dev/typescript/programming-guide" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline">
                        programming guide
                    </a>
                    to learn how to build with DBOS!
                </p>
            </div>
        </div>
    </body>
    </html>`;
  res.send(readme);
});

/////////////////////////////////////
//// Starting Express.js and DBOS
/////////////////////////////////////

async function main() {
  DBOS.setConfig({
    name: "dbos-node-toolbox",
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    applicationVersion: "0.1.0",
  });
  await DBOS.launch();
  // Define a schedule for the scheduled workflow
  await DBOS.applySchedules([
    {
      scheduleName: "runEvery15Min",
      schedule: "*/15 * * * *",
      workflowFn: scheduledWorkflow,
    },
  ]);
  const PORT = parseInt(process.env.NODE_PORT || "3000");
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
