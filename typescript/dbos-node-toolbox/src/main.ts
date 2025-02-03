import { DBOS, WorkflowQueue } from "@dbos-inc/dbos-sdk";
import express from "express";

export const app = express();
app.use(express.json());

const queue = new WorkflowQueue("example_queue");

export class Toolbox {

  //////////////////////////////////
  //// Workflows and steps
  //////////////////////////////////

  @DBOS.step()
  static async stepOne() {
    DBOS.logger.info("Step one completed!");
  }

  @DBOS.step()
  static async stepTwo() {
    DBOS.logger.info("Step one completed!");
  }

  @DBOS.workflow()
  static async exampleWorkflow() {
    await Toolbox.stepOne();
    await Toolbox.stepTwo();
  }

  //////////////////////////////////
  //// Queues
  //////////////////////////////////

  @DBOS.workflow()
  static async taskWorkflow(n: number) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Sleep 5 seconds
    DBOS.logger.info(`Task ${n} completed!`)
  }

  @DBOS.workflow()
  static async queueWorkflow() {
    DBOS.logger.info("Enqueueing tasks!")
    const handles = []
    for (let i = 0; i < 10; i++) {
      handles.push(await DBOS.startWorkflow(Toolbox, { queueName: queue.name }).taskWorkflow(i))
    }
    const results = []
    for (const h of handles) {
      results.push(await h.getResult())
    }
    DBOS.logger.info(`Successfully completed ${results.length} tasks`)
  }

  //////////////////////////////////
  //// Scheduled workflows
  //////////////////////////////////

  @DBOS.scheduled({ crontab: "* * * * *" })
  @DBOS.workflow()
  static async runEveryMinute(scheduledTime: Date, startTime: Date) {
    DBOS.logger.info(`I am a scheduled workflow. It is currently ${scheduledTime}.`)
  }

  //////////////////////////////////
  //// Transactions
  //////////////////////////////////

  @DBOS.transaction()
  static async insertRow() {
    await DBOS.knexClient.raw('INSERT INTO example_table (name) VALUES (?)', ['dbos']);
  }

  @DBOS.transaction({ readOnly: true })
  static async countRows() {
    const result = await DBOS.knexClient.raw('SELECT COUNT(*) as count FROM example_table');
    const count = result.rows[0].count;
    DBOS.logger.info(`Row count: ${count}`);
  }

  @DBOS.workflow()
  static async transactionWorkflow() {
    await Toolbox.insertRow()
    await Toolbox.countRows()
  }
}

/////////////////////////////////////
//// Express.js HTTP endpoints
/////////////////////////////////////

app.get("/workflow", async (req, res) => {
  await Toolbox.exampleWorkflow();
  res.send();
});

app.get("/queue", async (req, res) => {
  await Toolbox.queueWorkflow();
  res.send();
});

app.get("/transaction", async (req, res) => {
  await Toolbox.transactionWorkflow();
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
    <body class="bg-gray-100 min-h-screen">
        <div class="max-w-2xl mx-auto py-16 px-4">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <h1 class="text-3xl font-bold text-gray-900 mb-6">Welcome to the DBOS Toolbox!</h1>
                <h2 class="text-xl font-semibold text-gray-700 mb-4">This app contains example code for:</h2>
                <div class="space-y-3 mb-8">
                    <div class="block text-gray-600">
                        Workflows: <button onclick="fetch('/workflow')" class="text-blue-600 hover:text-blue-800 font-medium">/workflow</button>
                    </div>
                    <div class="block text-gray-600">
                        Queues: <button onclick="fetch('/queue')" class="text-blue-600 hover:text-blue-800 font-medium">/queue</button>
                    </div>
                    <div class="block text-gray-600">
                        Transactions: <button onclick="fetch('/transaction')" class="text-blue-600 hover:text-blue-800 font-medium">/transaction</button>
                    </a>
                </div>
                <p class="text-gray-600">
                    To learn more, check out the
                    <a href="https://docs.dbos.dev/typescript/programming-guide"
                       class="text-blue-600 hover:text-blue-800 hover:underline">
                        DBOS programming guide.
                    </a>
                </p>
            </div>
        </div>
    </body>
    </html>`
  res.send(readme)
});

/////////////////////////////////////
//// Starting Express.js and DBOS
/////////////////////////////////////

async function main() {
  await DBOS.launch({ expressApp: app });
  const PORT = DBOS.runtimeConfig?.port || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
