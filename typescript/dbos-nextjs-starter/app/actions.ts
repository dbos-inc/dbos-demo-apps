"use server";

import { DBOSClient } from "@dbos-inc/dbos-sdk";

async function getClient() {
  return DBOSClient.create({
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL!,
  });
}

export async function launchWorkflow(name: string) {
  const client = await getClient();
  try {
    const handle = await client.enqueue(
      {
        workflowName: "greetingWorkflowFn",
        queueName: "task_queue",
      },
      name || "World"
    );
    return { workflowID: handle.workflowID };
  } finally {
    await client.destroy();
  }
}

export async function getWorkflowStatus(workflowID: string) {
  const client = await getClient();
  try {
    const handle = client.retrieveWorkflow<string>(workflowID);
    const status = await handle.getStatus();
    let result: string | null = null;
    if (status?.status === "SUCCESS") {
      result = await handle.getResult();
    }
    return {
      workflowID,
      status: status?.status ?? "UNKNOWN",
      result,
    };
  } finally {
    await client.destroy();
  }
}
