import { DBOS } from "@dbos-inc/dbos-sdk";
import Koa from 'koa';
import logger from 'koa-morgan';
import bodyParser from 'koa-bodyparser';
import path from 'path';
import Router from "@koa/router";
import send from "koa-send";

// Welcome to DBOS!
// This is a template application built with DBOS and Koa.
// It shows you how to use DBOS to build durable workflows that are resilient to any failure.

export const app = new Koa();
app.use(bodyParser());
app.use(logger('tiny')); // Add request logging

const router = new Router();

const stepsEvent = "steps_event";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Example {
  // Here is the code for a durable workflow with three steps.
  // DBOS workflows are resilient to any failure--if your program is crashed,
  // interrupted, or restarted while running this workflow, the workflow
  // automatically resumes from the last completed step.
  
  // One interesting implementation detail: we use setEvent to publish the workflow's
  // status to the frontend after each step completes, so you can observe what your workflow
  // is doing in real time.

  @DBOS.step()
  static async stepOne() {
    await sleep(5000);
    console.log("Completed step 1!")
  }

  @DBOS.step()
  static async stepTwo() {
    await sleep(5000);
    console.log("Completed step 2!")
  }

  @DBOS.step()
  static async stepThree() {
    await sleep(5000);
    console.log("Completed step 3!")
  }
  
  @DBOS.workflow()
  static async workflow(): Promise<void> {
    await Example.stepOne();
    await DBOS.setEvent(stepsEvent, 1);
    await Example.stepTwo();
    await DBOS.setEvent(stepsEvent, 2);
    await Example.stepThree();
    await DBOS.setEvent(stepsEvent, 3);
  }
}

// This endpoint uses DBOS to idempotently launch a durable workflow
router.get("/workflow/:taskid", async (ctx) => {
    const { taskid } = ctx.params;
    await DBOS.startWorkflow(Example, { workflowID: taskid }).workflow();
    ctx.status = 200;
  }
);

// This endpoint retrieves the status of a specific background task.
router.get("/last_step/:taskid", async (ctx) => {
    const { taskid } = ctx.params;
    const step = await DBOS.getEvent(taskid, stepsEvent, 0);
    ctx.body = (String(step !== null ? step : 0));
  }
);

// This endpoint crashes the application. For demonstration purposes only :)
router.post("/crash", (_ctx): void => {
  process.exit(1);
});

// This code serves the HTML readme from the root path.
router.get("/", async (ctx) => {
  const filePath = path.resolve(__dirname, "..", "html", "app.html");
  try {
    await send(ctx, filePath, { root: '/' }); // Adjust root as needed
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = 'Internal Server Error';
  }
});

// Apply routes to app
app.use(router.routes());
app.use(router.allowedMethods());

// Launch DBOS and start the Express.js server
async function main() {
  DBOS.setConfig({
    "name": "dbos-node-starter",
  });
  await DBOS.launch();
  const PORT = parseInt(process.env.NODE_PORT || '3000');
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
