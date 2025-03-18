import { DBOS } from "@dbos-inc/dbos-sdk";
import express from "express";
import morgan from 'morgan';
import path from "path";

// Welcome to DBOS!
// This is a template application built with DBOS and Express.
// It shows you how to use DBOS to build durable workflows that are resilient to any failure.

export const app = express();
app.use(express.json());
app.use(morgan('dev')); // Add request logging

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
app.get("/workflow/:taskid", async (req, res) => {
    const { taskid } = req.params;
    await DBOS.startWorkflow(Example, { workflowID: taskid }).workflow();
    res.status(200);
  }
);

// This endpoint retrieves the status of a specific background task.
app.get("/last_step/:taskid", async (req, res) => {
    const { taskid } = req.params;
    const step = await DBOS.getEvent(taskid, stepsEvent, 0);
    res.send(String(step !== null ? step : 0));
  }
);

// This endpoint crashes the application. For demonstration purposes only :)
app.post("/crash", (_, _res): void => {
  process.exit(1);
});

// This code serves the HTML readme from the root path.
app.get("/", (_, res) => {
  const filePath = path.resolve(__dirname, "..", "html", "app.html");
  res.sendFile(filePath, (err) => {
    if (err) {
      console.log(err);
      res.status(500).send("Internal Server Error");
    }
  });
});

// Launch DBOS and start the Express.js server
async function main() {
  await DBOS.launch({ expressApp: app });
  const PORT = DBOS.runtimeConfig?.port || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
