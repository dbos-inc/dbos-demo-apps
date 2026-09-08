import { DBOS } from "npm:@dbos-inc/dbos-sdk@4.27.6";
import pg from "npm:pg@8.16.3";
import { QUEUE, systemDatabaseUrl, WORKFLOW_PROCESS_TASK } from "./config.ts";

export interface Task {
  taskId: string;
  payload: Record<string, unknown>;
}

// One pool per isolate, reused across invocations.
let pool: InstanceType<typeof pg.Pool> | undefined;
function db() {
  pool ??= new pg.Pool({ connectionString: systemDatabaseUrl(), max: 2 });
  return pool;
}

// Steps should be short, I/O-bound and idempotent
async function validate(task: Task): Promise<Task> {
  if (!task?.taskId) throw new Error("task.taskId is required");
  return task;
}

async function transform(task: Task): Promise<Record<string, unknown>> {
  await new Promise((r) => setTimeout(r, 2000));
  return { ...task.payload, taskId: task.taskId, transformedAt: new Date().toISOString() };
}

async function persist(workflowID: string, taskId: string, result: Record<string, unknown>) {
  await db().query(
    `insert into public.task_results (workflow_id, task_id, result)
     values ($1, $2, $3)
     on conflict (workflow_id) do update
       set result = excluded.result, task_id = excluded.task_id, completed_at = now()`,
    [workflowID, taskId, result],
  );
}

async function processTaskFn(task: Task) {
  const workflowID = DBOS.workflowID!;
  const validated = await DBOS.runStep(() => validate(task), { name: "validate" });
  const result = await DBOS.runStep(() => transform(validated), { name: "transform" });
  await DBOS.runStep(() => persist(workflowID, validated.taskId, result), { name: "persist" });
  return result;
}

export const processTask = DBOS.registerWorkflow(processTaskFn, { name: WORKFLOW_PROCESS_TASK });
export { QUEUE };
