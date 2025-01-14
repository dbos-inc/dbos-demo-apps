"use server";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { dbosWorkflowClass } from "@/dbos/operations";

export async function startBackgroundTask(taskID: string, steps: number) {
  await DBOS.startWorkflow(dbosWorkflowClass, {workflowID: taskID}).backgroundTask(steps);
  return "Background task started!";
}