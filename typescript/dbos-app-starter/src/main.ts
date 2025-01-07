import { DBOS } from '@dbos-inc/dbos-sdk';
import express, { Request, Response } from 'express';
import path from 'path';

// Welcome to DBOS!
// This is a template application built with DBOS and Express.
// It shows you how to use DBOS to build background tasks that are resilient to any failure.

export const app = express();
app.use(express.json());

const stepsEvent = "steps_event";

export class MyApp {

  // This workflow simulates a background task with N steps.

  // DBOS workflows are resilient to any failure--if your program is crashed,
  // interrupted, or restarted while running this workflow, the workflow automatically
  // resumes from the last completed step.
  @DBOS.workflow()
  static async launchTaskWithSteps(n: number): Promise<void> {
    for (let i = 1; i <= n; i++) {
      await MyApp.backgroundTaskStep(i);
      await DBOS.setEvent(stepsEvent, i);
    }
  }

  @DBOS.step()
  static async backgroundTaskStep(step: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    DBOS.logger.info(`Completed step ${step}!`);
  }

}

// This endpoint uses DBOS to idempotently launch a crashproof background task with N steps.
app.get('/background/:taskid/:steps', async (req: Request, res: Response): Promise<void> => {
  const { taskid, steps } = req.params;
  DBOS.startWorkflow(MyApp, {workflowID: taskid}).launchTaskWithSteps(Number(steps));
  res.send('Task launched!');
});

// This endpoint retrieves the status of a specific background task.
app.get('/last_step/:taskid', async (req: Request, res: Response): Promise<void> => {
  const { taskid } = req.params;
  const step = await DBOS.getEvent(taskid, stepsEvent);
  res.send(String(step !== null ? step : 0));
});

// This endpoint crashes the application. For demonstration purposes only :)
app.post('/crash', (_, _res): void => {
  process.exit(1);
});

// This code serves the HTML readme from the root path.
app.get('/', (_, res) => {
  const filePath = path.resolve(__dirname, '..', 'html', 'app.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.log(err);
      res.status(500).send('Internal Server Error');
    }
  });
})

// Launch DBOS and start the Express.js server
async function main() {
  await DBOS.launch({expressApp: app});
  const PORT = DBOS.runtimeConfig?.port || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);