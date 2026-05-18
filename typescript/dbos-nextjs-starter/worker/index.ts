import { DBOS } from "@dbos-inc/dbos-sdk";

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
  await DBOS.registerQueue("task_queue");
  console.log("Worker listening for workflows on task_queue...");
}

main().catch(console.error);
