import { DBOS } from "@dbos-inc/dbos-sdk";
import Koa, { type Context } from 'koa';
import logger from 'koa-morgan';
import bodyParser from 'koa-bodyparser';
import path from 'path';
import Router from "@koa/router";
import send from "koa-send";
import { randomUUID } from "crypto";

// Welcome to DBOS!
// This example shows you how to use DBOS to build applications
// that are resilient to any failure.

export const app = new Koa();
app.use(bodyParser());
app.use(logger('tiny')); // Add request logging

const router = new Router();

const stepsEvent = "steps_event";

const SCHEDULE_NAME = "scheduled-workflow";
const DEFAULT_CRON = "*/5 * * * * *";

const QUEUE_NAME = "demo-queue";
const DEFAULT_WORKER_CONCURRENCY = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Count workflows grouped by status (matches the frontend summary panels).
function countByStatus(wfs: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const wf of wfs) {
    counts[wf.status] = (counts[wf.status] || 0) + 1;
  }
  return counts;
}

// RFC 3339 timestamp for 10 minutes ago.
function tenMinutesAgo(): string {
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

// ============================================================
// Workflows tab: a durable workflow with three steps.
// DBOS workflows are resilient to any failure--if your program is crashed,
// interrupted, or restarted while running this workflow, the workflow
// automatically resumes from the last completed step.
// ============================================================

async function stepOne() {
  await sleep(5000);
  console.log("Completed step 1!");
}

async function stepTwo() {
  await sleep(5000);
  console.log("Completed step 2!");
}

async function stepThree() {
  await sleep(5000);
  console.log("Completed step 3!");
}

async function exampleWorkflow() {
  await DBOS.runStep(stepOne);
  // Use DBOS.setEvent to publish progress for the frontend to display.
  await DBOS.setEvent(stepsEvent, 1);
  await DBOS.runStep(stepTwo);
  await DBOS.setEvent(stepsEvent, 2);
  await DBOS.runStep(stepThree);
  await DBOS.setEvent(stepsEvent, 3);
}

const registeredWorkflow = DBOS.registerWorkflow(exampleWorkflow);

// This endpoint uses DBOS to idempotently launch a durable workflow
router.get("/workflow/:taskid", async (ctx: Context) => {
  const { taskid } = ctx.params;
  await DBOS.startWorkflow(registeredWorkflow, { workflowID: taskid })();
  ctx.status = 200;
});

// This endpoint retrieves the status of a specific background task.
router.get("/last_step/:taskid", async (ctx: Context) => {
  const { taskid } = ctx.params;
  const step = await DBOS.getEvent(taskid, stepsEvent, 0);
  ctx.body = (String(step !== null ? step : 0));
});

// This endpoint crashes the application. For demonstration purposes only :)
router.post("/crash", (_ctx: Context): void => {
  process.exit(1);
});

// ============================================================
// Schedules tab: a workflow that runs on a cron schedule.
// The schedule can be created, paused, resumed, and triggered at runtime.
// ============================================================

async function scheduledWorkflowFn(_scheduledTime: Date, _context: unknown) {
  DBOS.logger.info(`${new Date().toISOString()}: Scheduled workflow starting.`);
  await DBOS.sleep(1000);
  DBOS.logger.info(`${new Date().toISOString()}: Scheduled workflow ending.`);
}

const scheduledWorkflow = DBOS.registerWorkflow(scheduledWorkflowFn, { name: "scheduledWorkflow" });

router.get("/schedule/status", async (ctx: Context) => {
  let cron = DEFAULT_CRON;
  let scheduleStatus = "UNKNOWN";
  try {
    const sched = await DBOS.getSchedule(SCHEDULE_NAME);
    if (sched) {
      cron = sched.schedule;
      scheduleStatus = sched.status;
    }
  } catch {
    // fall through to defaults
  }

  const wfs = await DBOS.listWorkflows({
    workflowName: "scheduledWorkflow",
    startTime: tenMinutesAgo(),
    limit: 500,
    loadInput: false,
    loadOutput: false,
  });

  ctx.body = {
    cron,
    schedule_status: scheduleStatus,
    workflow_counts: countByStatus(wfs),
  };
});

router.post("/schedule/apply", async (ctx: Context) => {
  const body = ctx.request.body as { cron?: string };
  const cron = body?.cron || DEFAULT_CRON;
  await DBOS.applySchedules([{
    scheduleName: SCHEDULE_NAME,
    workflowFn: scheduledWorkflow,
    schedule: cron,
  }]);
  // Explicitly resume so Apply always leaves the schedule active.
  try {
    await DBOS.resumeSchedule(SCHEDULE_NAME);
  } catch {
    // ignore
  }
  ctx.body = { ok: true };
});

router.post("/schedule/pause", async (ctx: Context) => {
  await DBOS.pauseSchedule(SCHEDULE_NAME);
  ctx.body = { ok: true };
});

router.post("/schedule/resume", async (ctx: Context) => {
  await DBOS.resumeSchedule(SCHEDULE_NAME);
  ctx.body = { ok: true };
});

router.post("/schedule/trigger", async (ctx: Context) => {
  await DBOS.triggerSchedule(SCHEDULE_NAME);
  ctx.body = { ok: true };
});

// ============================================================
// Queues tab: a queue-based workflow with adjustable worker concurrency.
// ============================================================

async function enqueuedWorkflowFn() {
  DBOS.logger.info(`${new Date().toISOString()}: Enqueued workflow starting.`);
  await DBOS.sleep(5000);
  DBOS.logger.info(`${new Date().toISOString()}: Enqueued workflow ending.`);
}

const enqueuedWorkflow = DBOS.registerWorkflow(enqueuedWorkflowFn, { name: "enqueuedWorkflow" });

router.get("/queue/status", async (ctx: Context) => {
  const queue = await DBOS.retrieveQueue(QUEUE_NAME);
  const workerConcurrency = queue
    ? (await queue.getWorkerConcurrency()) ?? DEFAULT_WORKER_CONCURRENCY
    : DEFAULT_WORKER_CONCURRENCY;

  const wfs = await DBOS.listWorkflows({
    workflowName: "enqueuedWorkflow",
    startTime: tenMinutesAgo(),
    limit: 500,
    loadInput: false,
    loadOutput: false,
  });

  ctx.body = {
    worker_concurrency: workerConcurrency,
    workflow_counts: countByStatus(wfs),
  };
});

router.post("/queue/enqueue", async (ctx: Context) => {
  await DBOS.startWorkflow(enqueuedWorkflow, { queueName: QUEUE_NAME })();
  ctx.body = { ok: true };
});

router.post("/queue/concurrency", async (ctx: Context) => {
  const body = ctx.request.body as { concurrency?: number | string };
  const concurrency = parseInt(String(body?.concurrency ?? DEFAULT_WORKER_CONCURRENCY), 10);
  await DBOS.registerQueue(QUEUE_NAME, { workerConcurrency: concurrency, onConflict: "always_update" });
  ctx.body = { ok: true };
});

// ============================================================
// Communication tab: a human-in-the-loop workflow.
// It runs step one, then durably waits for an approval message.
// ============================================================

const APPROVAL_TOPIC = "approval";
const COMM_STATUS_EVENT = "comm_status";

async function commStepOne() {
  await sleep(2000);
  DBOS.logger.info("Communication workflow: step 1 complete.");
}

async function commStepTwo() {
  await sleep(2000);
  DBOS.logger.info("Communication workflow: step 2 complete.");
}

async function communicationWorkflowFn() {
  await DBOS.runStep(commStepOne);
  await DBOS.setEvent(COMM_STATUS_EVENT, "waiting");
  const decision = await DBOS.recv(APPROVAL_TOPIC, { timeoutSeconds: 120 });
  if (decision === "approve") {
    await DBOS.setEvent(COMM_STATUS_EVENT, "step2");
    await DBOS.runStep(commStepTwo);
    await DBOS.setEvent(COMM_STATUS_EVENT, "completed");
  } else if (decision === "deny") {
    await DBOS.setEvent(COMM_STATUS_EVENT, "denied");
    DBOS.logger.info("Communication workflow: denied.");
  } else {
    await DBOS.setEvent(COMM_STATUS_EVENT, "timeout");
    DBOS.logger.info("Communication workflow: timed out waiting for approval.");
  }
}

const communicationWorkflow = DBOS.registerWorkflow(communicationWorkflowFn, { name: "communicationWorkflow" });

router.get("/comm/status/:workflowId", async (ctx: Context) => {
  const { workflowId } = ctx.params;
  let status: string | null = null;
  try {
    status = await DBOS.getEvent<string>(workflowId, COMM_STATUS_EVENT, 0);
  } catch {
    status = null;
  }
  ctx.body = { state: status || "step1" };
});

router.post("/comm/start", async (ctx: Context) => {
  const wfId = randomUUID().replace(/-/g, "").slice(0, 12);
  await DBOS.startWorkflow(communicationWorkflow, { workflowID: wfId })();
  ctx.body = { workflow_id: wfId };
});

router.post("/comm/approve/:workflowId", async (ctx: Context) => {
  const { workflowId } = ctx.params;
  await DBOS.send(workflowId, "approve", APPROVAL_TOPIC);
  ctx.body = { ok: true };
});

router.post("/comm/deny/:workflowId", async (ctx: Context) => {
  const { workflowId } = ctx.params;
  await DBOS.send(workflowId, "deny", APPROVAL_TOPIC);
  ctx.body = { ok: true };
});

// This code serves the HTML readme from the root path.
router.get("/", async (ctx: Context) => {
  const filePath = path.resolve(__dirname, "..", "html", "app.html");
  try {
    await send(ctx, filePath, { root: '/' }); // Adjust root as needed
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = 'Internal Server Error';
  }
});

// Apply routes to app
app.use(router.routes());
app.use(router.allowedMethods());

// Launch DBOS and start the Koa server
async function main() {
  DBOS.setConfig({
    name: "dbos-node-starter",
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    applicationVersion: "0.1.0",
  });
  await DBOS.launch({ conductorKey: process.env.DBOS_CONDUCTOR_KEY });

  // Register the demo queue and apply the default schedule (after launch).
  await DBOS.registerQueue(QUEUE_NAME, {
    workerConcurrency: DEFAULT_WORKER_CONCURRENCY,
    onConflict: "never_update",
  });

  const PORT = parseInt(process.env.NODE_PORT || '3000');
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
