import { DBOS, Debouncer, type WorkflowStatus } from '@dbos-inc/dbos-sdk';
import express, { type Request, type Response } from 'express';
import path from 'path';

const app = express();

// Queue names, shared by the workflows and the observability endpoints.
const CONCURRENCY_QUEUE = 'concurrency-queue';
const PARTITIONED_QUEUE = 'partitioned-queue';
const RATE_LIMITED_QUEUE = 'rate-limited-queue';
const DEBOUNCER_QUEUE = 'debouncer-queue';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//######################
//# Fair Queueing
//######################

// The set of tenants the UI offers and the randomized batch draws from.
const FAIR_QUEUE_TENANTS = ['alice', 'bob', 'clark', 'dave', 'ed'];

// The workflow for fair queueing simply sleeps for 5 seconds.
async function fairQueueWorkflowFn() {
  await DBOS.sleep(5000);
}

const fairQueueWorkflow = DBOS.registerWorkflow(fairQueueWorkflowFn, {
  name: 'fair_queue_workflow',
});

// The fair queue example uses two queues: 
// PARTITIONED_QUEUE is split by tenant ID and limits the total number of concurrent tasks per tenant
// CONCURRENCY_QUEUE limits the number of concurrent tasks per worker
// These are registered below.
// Workflows are first enqueued on the former and then to the latter, thus applying the limits of both queues.

async function fairQueueConcurrencyManagerFn() {
  // This "concurrency manager" workflow holds a slot on PARTITIONED_QUEUE and executes fairQueueWorkflow on the CONCURRENCY_QUEUE. 
  const handle = await DBOS.startWorkflow(fairQueueWorkflow, { queueName: CONCURRENCY_QUEUE })();
  return await handle.getResult();
}

const fairQueueConcurrencyManager = DBOS.registerWorkflow(fairQueueConcurrencyManagerFn, {
  name: 'fair_queue_concurrency_manager',
});

// Enqueue a single "concurrency manager" workflow to PARTITIONED_QUEUE
async function enqueueForTenant(tenantId: string) {
  await DBOS.startWorkflow(fairQueueConcurrencyManager, {
    queueName: PARTITIONED_QUEUE,
    enqueueOptions: { queuePartitionKey: tenantId },
  })();
}

// Handler for single-workflow enqueue
app.post('/api/workflows/fair_queue', async (req: Request, res: Response) => {
  const tenantId = String(req.query.tenant_id ?? '');
  await enqueueForTenant(tenantId);
  res.json(null);
});

// Enqueue a randomized mix of workflows
app.post('/api/workflows/fair_queue/random_mix', async (_req: Request, res: Response) => {
  const total = 50;
  const tenants = FAIR_QUEUE_TENANTS.slice(0, 4);
  const favored = tenants[Math.floor(Math.random() * tenants.length)];
  // The favored tenant is twice as likely to be picked, so the batch is skewed
  // toward it. Picks are made one at a time, so they arrive in randomized order.
  const weighted = tenants.flatMap((t) => (t === favored ? [t, t] : [t]));
  for (let i = 0; i < total; i++) {
    const tenant = weighted[Math.floor(Math.random() * weighted.length)];
    await enqueueForTenant(tenant);
    await sleep(10);
  }
  res.json({ total, favored });
});

//######################
//# Rate Limiting
//######################

// This workflow is rate-limited: No more than two workflows can start per 10 seconds
// See RATE_LIMITED_QUEUE below
async function rateLimitedQueueWorkflowFn() {
  await DBOS.sleep(5000);
}

const rateLimitedQueueWorkflow = DBOS.registerWorkflow(rateLimitedQueueWorkflowFn, {
  name: 'rate_limited_queue_workflow',
});

app.post('/api/workflows/rate_limited_queue', async (_req: Request, res: Response) => {
  await DBOS.startWorkflow(rateLimitedQueueWorkflow, { queueName: RATE_LIMITED_QUEUE })();
  res.json(null);
});

//######################
//# Debouncing
//######################

async function debouncerWorkflowFn(tenantId: string, input: string) {
  console.log(`Executing debounced workflow for tenant ${tenantId} with input ${input}`);
  await DBOS.sleep(5000);
}

const debouncerWorkflow = DBOS.registerWorkflow(debouncerWorkflowFn, {
  name: 'debouncer_workflow',
});

// Each time a new input is submitted for a tenant, debounce debouncerWorkflow.
// The debouncer will wait until 10 seconds after input stops being submitted for the tenant,
// then enqueue the workflow with the last input submitted.
const debouncer = new Debouncer({
  workflow: debouncerWorkflow,
  startWorkflowParams: { queueName: DEBOUNCER_QUEUE },
});

app.post('/api/workflows/debouncer', async (req: Request, res: Response) => {
  const tenantId = String(req.query.tenant_id ?? '');
  const input = String(req.query.input ?? '');
  const debounceKey = tenantId;
  const debouncePeriodMs = 10000;
  await debouncer.debounce(debounceKey, debouncePeriodMs, tenantId, input);
  res.json(null);
});

//######################
//# Observability
//######################

// RFC 3339 timestamp for 30 minutes ago.
function thirtyMinutesAgo(): string {
  return new Date(Date.now() - 30 * 60 * 1000).toISOString();
}

app.get('/api/workflows', async (req: Request, res: Response) => {
  const workflowName = String(req.query.workflow_name ?? '');
  const workflows = await DBOS.listWorkflows({ workflowName, sortDesc: true });
  const statuses = workflows.map((w) => {
    let tenantId: string | null = null;
    let input: string | null = null;
    if (workflowName.includes('fair_queue')) {
      tenantId = w.queuePartitionKey ?? null;
    } else if (workflowName.includes('debouncer')) {
      const args = (w.input ?? []) as string[];
      tenantId = args[0] ?? null;
      input = args[1] ?? null;
    }
    return {
      workflow_id: w.workflowID,
      workflow_status: w.status,
      workflow_name: w.workflowName,
      start_time: w.createdAt,
      tenant_id: tenantId,
      input,
    };
  });
  res.json(statuses);
});

function countsByTenant(wfs: WorkflowStatus[]) {
  const counts = new Map<string, number>();
  for (const w of wfs) {
    const tenant = w.queuePartitionKey || 'unknown';
    counts.set(tenant, (counts.get(tenant) ?? 0) + 1);
  }
  return [...counts].map(([tenant_id, count]) => ({ tenant_id, count }));
}

app.get('/api/fair_queue/pipeline', async (_req: Request, res: Response) => {
  // The "concurrency manager" workflows run on the partitioned queue and carry the
  // partition key (tenant_id) natively.
  const enqueuedMgrs = await DBOS.listWorkflows({
    workflowName: 'fair_queue_concurrency_manager',
    status: ['ENQUEUED', 'PENDING'],
    loadInput: false,
    loadOutput: false,
  });
  const successMgrs = await DBOS.listWorkflows({
    workflowName: 'fair_queue_concurrency_manager',
    status: 'SUCCESS',
    startTime: thirtyMinutesAgo(),
    loadInput: false,
    loadOutput: false,
  });

  // The actual work runs on the concurrency queue. Those workflows have no partition
  // key of their own, so we inherit it from the parent manager that enqueued them.
  const pendingWork = await DBOS.listWorkflows({
    workflowName: 'fair_queue_workflow',
    status: 'PENDING',
    loadInput: false,
    loadOutput: false,
  });
  const mgrKey = new Map(enqueuedMgrs.map((m) => [m.workflowID, m.queuePartitionKey]));

  res.json({
    enqueued: countsByTenant(enqueuedMgrs),
    pending_concurrency: pendingWork.map((w) => ({
      workflow_id: w.workflowID,
      tenant_id: (w.parentWorkflowID ? mgrKey.get(w.parentWorkflowID) : undefined) ?? 'unknown',
    })),
    success: countsByTenant(successMgrs),
  });
});

app.get('/api/debouncer/pipeline', async (_req: Request, res: Response) => {
  // A debounced workflow is DELAYED while its debounce window is still open,
  // then ENQUEUED when it fires, PENDING while running, then SUCCESS. We
  // surface the tenant and its (latest) input for each stage. Deduplication on
  // the tenant key means there is at most one DELAYED workflow per tenant —
  // i.e. the last input submitted wins.
  const delayed = await DBOS.listWorkflows({
    workflowName: 'debouncer_workflow',
    status: 'DELAYED',
    sortDesc: true,
  });
  const pending = await DBOS.listWorkflows({
    workflowName: 'debouncer_workflow',
    status: 'PENDING',
    sortDesc: true,
  });
  const completed = await DBOS.listWorkflows({
    workflowName: 'debouncer_workflow',
    status: 'SUCCESS',
    startTime: thirtyMinutesAgo(),
    sortDesc: true,
  });

  const toItems = (wfs: WorkflowStatus[]) =>
    wfs.map((w) => {
      const args = (w.input ?? []) as string[];
      return {
        workflow_id: w.workflowID,
        tenant_id: args[0] ?? 'unknown',
        input: args[1] ?? '',
        start_time: w.createdAt,
        // For DELAYED workflows this is when the debounce window closes
        // and the workflow will run; null once it has left DELAYED.
        delay_until: w.delayUntilEpochMS ?? null,
        // When the workflow actually started running (it left the
        // debounce window), which is what the completed list sorts by.
        ran_at: w.dequeuedAt ?? w.createdAt,
      };
    });

  res.json({
    delayed: toItems(delayed),
    pending: toItems(pending),
    completed: toItems(completed),
  });
});

//######################
//# Configuration
//######################

// Static files directory
const STATIC_DIR = path.join(__dirname, '..', 'frontend', 'dist');

// Serve the built frontend, including index.html at the root path.
app.use(express.static(STATIC_DIR));

async function main() {
  DBOS.setConfig({
    name: 'dbos-queue-patterns',
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
    applicationVersion: '0.1.0',
  });
  await DBOS.launch({ conductorKey: process.env.DBOS_CONDUCTOR_KEY });
  await DBOS.registerQueue(CONCURRENCY_QUEUE, { workerConcurrency: 4 });
  await DBOS.registerQueue(PARTITIONED_QUEUE, { partitionQueue: true, concurrency: 2 });
  await DBOS.registerQueue(RATE_LIMITED_QUEUE, {
    rateLimit: { limitPerPeriod: 2, periodSec: 10 },
  });
  await DBOS.registerQueue(DEBOUNCER_QUEUE);

  const PORT = parseInt(process.env.NODE_PORT || '8000');
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

main().catch(console.log);
