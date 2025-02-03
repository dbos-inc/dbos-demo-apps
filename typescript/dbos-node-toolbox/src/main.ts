import { DBOS } from "@dbos-inc/dbos-sdk";
import express from "express";

export const app = express();
app.use(express.json());


export class Toolbox {

  @DBOS.step()
  static async stepOne() {
    DBOS.logger.info("Step one completed!");
  }

  @DBOS.step()
  static async stepTwo() {
    DBOS.logger.info("Step one completed!");
  }

  @DBOS.workflow()
  static async dbosWorkflow() {
    await this.stepOne();
    await this.stepTwo();
  }
}

//////////////////////////////////
//// README
//////////////////////////////////

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

async function main() {
  await DBOS.launch({ expressApp: app });
  const PORT = DBOS.runtimeConfig?.port || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
