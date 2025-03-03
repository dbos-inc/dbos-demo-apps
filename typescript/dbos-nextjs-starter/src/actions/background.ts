"use server";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { MyWorkflow } from "@dbos/operations";

// This action uses DBOS to idempotently launch a crashproof background task with N steps.
export async function startBackgroundTask(taskID: string, steps: number) {
  await DBOS.startWorkflow(MyWorkflow, { workflowID: taskID }).backgroundTask(steps);
  return "Background task started!";
}

// This action retrieves the status of a specific background task.
export async function lastStep(taskID: string) {
  const step = await DBOS.getEvent(taskID, "steps_event");
  return String(step !== null ? step : 0);
}

// This action crashes the application. For demonstration purposes only :)
export async function crash() {
  process.exit(1);
}
