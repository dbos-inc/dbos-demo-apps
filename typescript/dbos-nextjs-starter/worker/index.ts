import { DBOS, WorkflowQueue } from "@dbos-inc/dbos-sdk";

export const taskQueue = new WorkflowQueue("task_queue");

async function greetingWorkflowFn(name: string) {
  return await DBOS.runStep(
    async () => `Hello, ${name}!`,
    { name: "generateGreeting" }
  );
}

DBOS.registerWorkflow(greetingWorkflowFn);

async function main() {
  DBOS.setConfig({
    name: "dbos-nextjs-starter",
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    runAdminServer: false,
  });
  await DBOS.launch();
  console.log("Worker listening for workflows on task_queue...");
}

main().catch(console.error);
