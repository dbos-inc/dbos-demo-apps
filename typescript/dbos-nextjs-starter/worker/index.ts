import { DBOS, WorkflowQueue } from "@dbos-inc/dbos-sdk";

export const taskQueue = new WorkflowQueue("task_queue");

async function greetingWorkflowFn(name: string) {
  const greeting = await DBOS.runStep(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return `Hello, ${name}! The time is ${new Date().toLocaleTimeString()}.`;
    },
    { name: "generateGreeting" }
  );

  const uppercased = await DBOS.runStep(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return greeting.toUpperCase();
    },
    { name: "uppercaseGreeting" }
  );

  return uppercased;
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
