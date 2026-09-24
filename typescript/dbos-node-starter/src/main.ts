import { DBOS, type WorkflowStatus, type WorkflowStatusString } from "@dbos-inc/dbos-sdk";
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

const RATE_LIMITED_QUEUE_NAME = "rate-limited-queue";
const DEFAULT_RATE_LIMIT = { limitPerPeriod: 2, periodSec: 10 };

const FAIR_QUEUE_NAME = "fair-queue";
const DEFAULT_PARTITION_CONCURRENCY = 1;
const DEFAULT_FAIR_WORKER_CONCURRENCY = 4;

const DELAYED_QUEUE_NAME = "delayed-queue";
// The longest delay the demo accepts: one day. DBOS itself has no hard limit.
const MAX_DELAY_SECONDS = 24 * 60 * 60;

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

// Look up a queue registered in main().
async function getQueue(name: string) {
  const queue = await DBOS.retrieveQueue(name);
  if (!queue) throw new Error(`Queue ${name} is not registered`);
  return queue;
}

// Parse a request field as an integer >= 1, or return undefined.
function parsePositiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

// Parse a request field as a trimmed name of 1 to 40 characters, or return undefined.
function parseName(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s && s.length <= 40 ? s : undefined;
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
// Queues tab: every sub-page enqueues this same workflow, each on its own
// queue, so the differences you see come from the queues alone.
// ============================================================

async function queueWorkflowFn() {
  await DBOS.sleep(5000);
}

const queueWorkflow = DBOS.registerWorkflow(queueWorkflowFn, { name: "queueWorkflow" });

// ============================================================
// Queues tab, worker concurrency: a queue with adjustable worker concurrency.
// ============================================================

router.get("/queue/status", async (ctx: Context) => {
  const queue = await DBOS.retrieveQueue(QUEUE_NAME);
  const workerConcurrency = queue
    ? (await queue.getWorkerConcurrency()) ?? DEFAULT_WORKER_CONCURRENCY
    : DEFAULT_WORKER_CONCURRENCY;

  const wfs = await DBOS.listWorkflows({
    queueName: QUEUE_NAME,
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
  await DBOS.startWorkflow(queueWorkflow, { queueName: QUEUE_NAME })();
  ctx.body = { ok: true };
});

router.post("/queue/concurrency", async (ctx: Context) => {
  const body = ctx.request.body as { concurrency?: number | string };
  const concurrency = parseInt(String(body?.concurrency ?? DEFAULT_WORKER_CONCURRENCY), 10);
  await DBOS.registerQueue(QUEUE_NAME, { workerConcurrency: concurrency, onConflict: "always_update" });
  ctx.body = { ok: true };
});

// ============================================================
// Queues tab, rate limiting: a queue that starts at most
// limitPerPeriod workflows every periodSec seconds.
// The rate limit can be changed at runtime.
// ============================================================

router.get("/queue/rate/status", async (ctx: Context) => {
  const queue = await getQueue(RATE_LIMITED_QUEUE_NAME);
  const rateLimit = (await queue.getRateLimit()) ?? DEFAULT_RATE_LIMIT;

  const wfs = await DBOS.listWorkflows({
    queueName: RATE_LIMITED_QUEUE_NAME,
    startTime: tenMinutesAgo(),
    sortDesc: true,
    limit: 500,
    loadInput: false,
    loadOutput: false,
  });

  ctx.body = {
    limit_per_period: rateLimit.limitPerPeriod,
    period_sec: rateLimit.periodSec,
    workflow_counts: countByStatus(wfs),
    // The newest workflows. started_at is when the queue let each one start,
    // so the gaps between start times show the rate limit at work.
    workflows: wfs.slice(0, 50).map((wf) => ({
      workflow_id: wf.workflowID,
      status: wf.status,
      enqueued_at: wf.createdAt,
      started_at: wf.dequeuedAt ?? null,
    })),
  };
});

router.post("/queue/rate/enqueue", async (ctx: Context) => {
  await DBOS.startWorkflow(queueWorkflow, { queueName: RATE_LIMITED_QUEUE_NAME })();
  ctx.body = { ok: true };
});

router.post("/queue/rate/limit", async (ctx: Context) => {
  const body = ctx.request.body as { limit_per_period?: number | string; period_sec?: number | string };
  const limitPerPeriod = parsePositiveInt(body?.limit_per_period);
  const periodSec = parsePositiveInt(body?.period_sec);
  if (limitPerPeriod === undefined || periodSec === undefined) {
    ctx.status = 400;
    ctx.body = { error: "limitPerPeriod and periodSec must be whole numbers of at least 1" };
    return;
  }
  const queue = await getQueue(RATE_LIMITED_QUEUE_NAME);
  await queue.setRateLimit({ limitPerPeriod, periodSec });
  ctx.body = { ok: true };
});

// ============================================================
// Queues tab, fair queues: a queue partitioned by tenant.
// partitionConcurrency limits how many workflows each tenant runs at once,
// and workerConcurrency limits how many run on this process in total,
// so one busy tenant can't starve the others.
// Both limits can be changed at runtime.
// ============================================================

// The tenants the frontend offers. The random mix draws from the first four,
// leaving "ed" free to show a newcomer isn't stuck behind their backlog.
const FAIR_QUEUE_TENANTS = ["alice", "bob", "clark", "dave", "ed"];

// Enqueue one workflow in the tenant's partition of the fair queue.
async function enqueueForTenant(tenantId: string) {
  await DBOS.startWorkflow(queueWorkflow, {
    queueName: FAIR_QUEUE_NAME,
    enqueueOptions: { queuePartitionKey: tenantId },
  })();
}

// Count workflows per tenant. Each workflow's partition key is its tenant.
function countByTenant(wfs: WorkflowStatus[]) {
  const counts = new Map<string, number>();
  for (const wf of wfs) {
    const tenant = wf.queuePartitionKey ?? "unknown";
    counts.set(tenant, (counts.get(tenant) ?? 0) + 1);
  }
  return [...counts].map(([tenant_id, count]) => ({ tenant_id, count }));
}

router.get("/queue/fair/status", async (ctx: Context) => {
  const queue = await getQueue(FAIR_QUEUE_NAME);
  const listFairQueue = (status: WorkflowStatusString, startTime?: string) =>
    DBOS.listWorkflows({
      queueName: FAIR_QUEUE_NAME,
      status,
      startTime,
      loadInput: false,
      loadOutput: false,
    });
  const [partitionConcurrency, workerConcurrency, enqueued, pending, success] = await Promise.all([
    queue.getPartitionConcurrency(),
    queue.getWorkerConcurrency(),
    listFairQueue("ENQUEUED"),
    listFairQueue("PENDING"),
    listFairQueue("SUCCESS", tenMinutesAgo()),
  ]);

  ctx.body = {
    partition_concurrency: partitionConcurrency ?? DEFAULT_PARTITION_CONCURRENCY,
    worker_concurrency: workerConcurrency ?? DEFAULT_FAIR_WORKER_CONCURRENCY,
    enqueued: countByTenant(enqueued),
    pending: pending.map((wf) => ({
      workflow_id: wf.workflowID,
      tenant_id: wf.queuePartitionKey ?? "unknown",
    })),
    success: countByTenant(success),
  };
});

router.post("/queue/fair/enqueue", async (ctx: Context) => {
  const body = ctx.request.body as { tenant_id?: string };
  const tenantId = parseName(body?.tenant_id);
  if (tenantId === undefined) {
    ctx.status = 400;
    ctx.body = { error: "Tenant names must be 1 to 40 characters" };
    return;
  }
  await enqueueForTenant(tenantId);
  ctx.body = { ok: true };
});

// Enqueue a batch of workflows across four tenants, skewed toward one of them.
router.post("/queue/fair/random_mix", async (ctx: Context) => {
  const total = 50;
  const tenants = FAIR_QUEUE_TENANTS.slice(0, 4);
  const favored = tenants[Math.floor(Math.random() * tenants.length)];
  // The favored tenant is twice as likely to be picked. Picks are made one
  // at a time, so the workflows arrive in randomized order.
  const weighted = tenants.flatMap((t) => (t === favored ? [t, t] : [t]));
  for (let i = 0; i < total; i++) {
    await enqueueForTenant(weighted[Math.floor(Math.random() * weighted.length)]);
    await sleep(10);
  }
  ctx.body = { total, favored };
});

router.post("/queue/fair/limits", async (ctx: Context) => {
  const body = ctx.request.body as { partition_concurrency?: number | string; worker_concurrency?: number | string };
  const partitionConcurrency = parsePositiveInt(body?.partition_concurrency);
  const workerConcurrency = parsePositiveInt(body?.worker_concurrency);
  if (partitionConcurrency === undefined || workerConcurrency === undefined) {
    ctx.status = 400;
    ctx.body = { error: "partitionConcurrency and workerConcurrency must be whole numbers of at least 1" };
    return;
  }
  const queue = await getQueue(FAIR_QUEUE_NAME);
  await queue.setPartitionConcurrency(partitionConcurrency);
  await queue.setWorkerConcurrency(workerConcurrency);
  ctx.body = { ok: true };
});

// ============================================================
// Queues tab, delays: enqueue a workflow that waits before running.
// The workflow stays DELAYED until its delay expires, then becomes ENQUEUED
// and runs. While it's DELAYED, its delay can be changed to run it sooner or
// later. The delay is stored in the database, so it survives restarts.
// ============================================================

// Parse a request field as a whole number of seconds from 1 to MAX_DELAY_SECONDS, or return undefined.
function parseDelaySeconds(value: unknown): number | undefined {
  const n = parsePositiveInt(value);
  return n !== undefined && n <= MAX_DELAY_SECONDS ? n : undefined;
}

const DELAY_ERROR = `delaySeconds must be a whole number from 1 to ${MAX_DELAY_SECONDS}`;

router.get("/queue/delay/status", async (ctx: Context) => {
  // List every workflow still in progress, plus any created in the last 10 minutes.
  const listDelayed = (status?: WorkflowStatusString[], startTime?: string) =>
    DBOS.listWorkflows({
      queueName: DELAYED_QUEUE_NAME,
      status,
      startTime,
      sortDesc: true,
      loadInput: false,
      loadOutput: false,
    });
  const [active, recent] = await Promise.all([
    listDelayed(["DELAYED", "ENQUEUED", "PENDING"]),
    listDelayed(undefined, tenMinutesAgo()),
  ]);

  const byId = new Map([...recent, ...active].map((wf) => [wf.workflowID, wf]));
  ctx.body = {
    workflows: [...byId.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((wf) => ({
        workflow_id: wf.workflowID,
        status: wf.status,
        enqueued_at: wf.createdAt,
        // When the delay expires and the workflow becomes eligible to run.
        due_at: wf.delayUntilEpochMS ?? null,
      })),
  };
});

router.post("/queue/delay/enqueue", async (ctx: Context) => {
  const body = ctx.request.body as { delay_seconds?: number | string };
  const delaySeconds = parseDelaySeconds(body?.delay_seconds);
  if (delaySeconds === undefined) {
    ctx.status = 400;
    ctx.body = { error: DELAY_ERROR };
    return;
  }
  await DBOS.startWorkflow(queueWorkflow, {
    queueName: DELAYED_QUEUE_NAME,
    enqueueOptions: { delaySeconds },
  })();
  ctx.body = { ok: true };
});

// Change a workflow's delay, counting from now. DBOS only changes the delay
// of a workflow that is still DELAYED.
router.post("/queue/delay/set/:workflowId", async (ctx: Context) => {
  const { workflowId } = ctx.params;
  const body = ctx.request.body as { delay_seconds?: number | string };
  const delaySeconds = parseDelaySeconds(body?.delay_seconds);
  if (delaySeconds === undefined) {
    ctx.status = 400;
    ctx.body = { error: DELAY_ERROR };
    return;
  }
  const status = await DBOS.getWorkflowStatus(workflowId);
  if (status?.queueName !== DELAYED_QUEUE_NAME) {
    ctx.status = 404;
    ctx.body = { error: "Delayed workflow not found" };
    return;
  }
  if (status.status !== "DELAYED") {
    ctx.status = 409;
    ctx.body = { error: `The workflow is ${status.status}, so its delay can no longer change` };
    return;
  }
  await DBOS.setWorkflowDelay(workflowId, { delaySeconds });
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
  const decision = await DBOS.recv(APPROVAL_TOPIC, { timeoutSeconds: 15 });
  if (decision === "approve") {
    await DBOS.setEvent(COMM_STATUS_EVENT, "step2");
    await DBOS.runStep(commStepTwo);
    await DBOS.setEvent(COMM_STATUS_EVENT, "completed");
  } else if (decision === "deny") {
    await DBOS.setEvent(COMM_STATUS_EVENT, "denied");
    DBOS.logger.info("Communication workflow: denied.");
  } else {
    // recv returns null on timeout. Throwing ends the workflow in the ERROR state.
    throw new Error("Timed out waiting for approval");
  }
}

const communicationWorkflow = DBOS.registerWorkflow(communicationWorkflowFn, { name: "communicationWorkflow" });

router.get("/comm/status/:workflowId", async (ctx: Context) => {
  const { workflowId } = ctx.params;
  // The workflow throws when it times out waiting for approval, so it ends in ERROR.
  const wf = await DBOS.getWorkflowStatus(workflowId);
  if (wf?.status === "ERROR") {
    ctx.body = { state: "timeout", error: wf.error instanceof Error ? wf.error.message : String(wf.error ?? "") };
    return;
  }
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

  // Register the demo queues (after launch). "never_update" keeps any
  // settings changed at runtime across restarts.
  await DBOS.registerQueue(QUEUE_NAME, {
    workerConcurrency: DEFAULT_WORKER_CONCURRENCY,
    onConflict: "never_update",
  });
  await DBOS.registerQueue(RATE_LIMITED_QUEUE_NAME, {
    rateLimit: DEFAULT_RATE_LIMIT,
    onConflict: "never_update",
  });
  await DBOS.registerQueue(FAIR_QUEUE_NAME, {
    partitionConcurrency: DEFAULT_PARTITION_CONCURRENCY,
    workerConcurrency: DEFAULT_FAIR_WORKER_CONCURRENCY,
    onConflict: "never_update",
  });
  await DBOS.registerQueue(DELAYED_QUEUE_NAME, { onConflict: "never_update" });

  const PORT = parseInt(process.env.NODE_PORT || '3000');
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
