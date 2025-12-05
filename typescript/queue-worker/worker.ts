import { DBOS, WorkflowQueue } from '@dbos-inc/dbos-sdk';

// Define constants
const WF_PROGRESS_KEY = 'workflow_progress';

// Define a queue on which the web server
// can submit workflows for execution.
new WorkflowQueue('workflow-queue');

// This background workflow is submitted by the
// web server. It runs a number of steps,
// periodically reporting its progress.
async function workflowFunction(numSteps: number): Promise<void> {
  const progress = {
    steps_completed: 0,
    num_steps: numSteps,
  };
  // The server can query this event to obtain
  // the current progress of the workflow
  await DBOS.setEvent(WF_PROGRESS_KEY, progress);
  for (let i = 0; i < numSteps; i++) {
    await DBOS.runStep(() => stepFunction(i), { name: `step-${i}` });
    // Update workflow progress each time a step completes
    progress.steps_completed = i + 1;
    await DBOS.setEvent(WF_PROGRESS_KEY, progress);
  }
}

export const workflow = DBOS.registerWorkflow(workflowFunction, {
  name: 'workflow',
});

async function stepFunction(i: number): Promise<void> {
  console.log(`Step ${i} completed!`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Configure and launch DBOS
async function main(): Promise<void> {
  const systemDatabaseUrl =
    process.env.DBOS_SYSTEM_DATABASE_URL || 'postgresql://postgres:dbos@localhost:5432/dbos_queue_worker';
  DBOS.setConfig({
    name: 'dbos-queue-worker',
    systemDatabaseUrl: systemDatabaseUrl,
  });
  await DBOS.launch();
  // After launching DBOS, the worker waits indefinitely,
  // dequeuing and executing workflows.
  console.log('Worker started, waiting for workflows...');
  await new Promise(() => {});
}

main().catch(console.log);
