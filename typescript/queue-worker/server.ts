import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import type { Request, Response } from 'express';
import { DBOSClient } from '@dbos-inc/dbos-sdk';

// Create an Express app
const app = express();
app.use(express.json());

// Define constants
const WF_PROGRESS_KEY = 'workflow_progress';

// Define types
interface WorkflowStatus {
  workflow_id: string;
  workflow_status: string;
  steps_completed: number | null;
  num_steps: number | null;
}

interface ProgressEvent {
  steps_completed: number;
  num_steps: number;
}

// Create a DBOS client
const systemDatabaseUrl =
  process.env.DBOS_SYSTEM_DATABASE_URL || 'postgresql://postgres:dbos@localhost:5432/dbos_queue_worker';
const client = await DBOSClient.create({ systemDatabaseUrl });

// Use the DBOS client to enqueue a workflow for execution on the worker.
app.post('/api/workflows', async (_req: Request, res: Response) => {
  const numSteps = 10;
  await client.enqueue(
    {
      queueName: 'workflow-queue',
      workflowName: 'workflow',
    },
    numSteps,
  );
  res.json({ status: 'enqueued' });
});

// List all workflows and their progress to display on the frontend
app.get('/api/workflows', async (_req: Request, res: Response) => {
  // Use the DBOS client to list all workflows
  const workflows = await client.listWorkflows({
    workflowName: 'workflow',
    sortDesc: true,
  });
  const statuses: WorkflowStatus[] = [];
  for (const workflow of workflows) {
    // Query each workflow's progress event. This may not be available
    // if the workflow has not yet started executing.
    const progress = await client.getEvent<ProgressEvent>(workflow.workflowID, WF_PROGRESS_KEY, 0);
    const status: WorkflowStatus = {
      workflow_id: workflow.workflowID,
      workflow_status: workflow.status,
      steps_completed: progress ? progress.steps_completed : null,
      num_steps: progress ? progress.num_steps : null,
    };
    statuses.push(status);
  }
  res.json(statuses);
});

// Serve index.html for root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, 'frontend', 'dist');
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Mount static frontend files
app.use(express.static(frontendDist));

async function main(): Promise<void> {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
