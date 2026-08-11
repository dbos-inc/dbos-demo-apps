/**
 * DBOS TypeScript interop app.
 *
 * Registers echoWorkflow as a ConfiguredInstance method (class=interop, instance="default")
 * on interop-queue-typescript.
 *
 * POST /enqueue/:target  — enqueues echoWorkflow onto interop-queue-{target} and
 *                          returns its result.
 * POST /interop/:target  — the same call, returning {result, parentId, childId} so the
 *                          caller can inspect the cross-application parent/child link.
 * GET  /workflow/:id     — status of any workflow in the shared system database.
 * GET  /steps/:id        — the recorded steps of a workflow, with child workflow IDs.
 * GET  /healthz          — liveness probe.
 */

import express from 'express';
import { DBOS, ConfiguredInstance, WorkflowQueue } from '@dbos-inc/dbos-sdk';

const SYS_DB_URL = process.env.DBOS_SYSTEM_DATABASE_URL!;
const PORT       = parseInt(process.env.PORT ?? '8002', 10);

// All four runtimes share one system database, so each is a distinct DBOS
// application. An application's name decides what it owns — its workflows,
// queues and versions — and it only runs its own work.
const APP_NAMES: Record<string, string> = {
  python:     'interop-python',
  typescript: 'interop-typescript',
  go:         'interop-go',
  java:       'interop-java',
};

// Application version names are unique across every application sharing a system
// database, so each runtime carries its own rather than a common "interop-v1".
const APP_VERSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(APP_NAMES).map(([lang, name]) => [lang, `${name}-v1`]),
);

const QUEUE_NAMES: Record<string, string> = {
  python:     'interop-queue-python',
  typescript: 'interop-queue-typescript',
  go:         'interop-queue-go',
  java:       'interop-queue-java',
};

interface EchoResult {
  echo_text: string;
  echo_num: number;
  echo_float: number;
  items_count: number;
  echo_date: string;
  msg_date: string;
}

// ---------------------------------------------------------------------------
// Workflow registration — class instance method style
// ---------------------------------------------------------------------------

const _queue = new WorkflowQueue(QUEUE_NAMES.typescript);

@DBOS.className('interop')
class InteropService extends ConfiguredInstance {
  @DBOS.workflow({ serialization: 'portable', name: 'echoWorkflow' })
  async echoWorkflow(
    text: string,
    num: number,
    floatVal: number,
    items: string[],
    dateStr: string,
  ): Promise<EchoResult> {
    const echo_date = new Date(dateStr).toISOString().split('T')[0];

    // Receive a date message sent by the caller.
    const msgDateRaw = await DBOS.recv<string>('date-msg', 30);
    // Normalize to YYYY-MM-DD (sender may produce RFC 3339 or date-only).
    const msg_date = (msgDateRaw ?? '').substring(0, 10);

    return {
      echo_text:   text,
      echo_num:    num,
      echo_float:  floatVal,
      items_count: items.length,
      echo_date,
      msg_date,
    };
  }
}

// Create instance with name "default"
const _service = new InteropService('default');

interface DriverResult {
  result: EchoResult;
  parentId?: string;
  childId: string;
}

/**
 * Enqueue another application's echoWorkflow and wait for its result.
 *
 * This runs inside a workflow and enqueues through the runtime itself — no DBOS
 * client — so the enqueued workflow is recorded as a child of this one even
 * though a different application owns and runs it.
 */
async function interopDriverImpl(
  target: string,
  positionalArgs: unknown[],
  namedArgs: Record<string, unknown>,
): Promise<DriverResult> {
  const handle = await DBOS.enqueueWorkflowWithOptionsPortable<EchoResult>(
    {
      queueName:          QUEUE_NAMES[target],
      workflowName:       'echoWorkflow',
      workflowClassName:  'interop',
      workflowConfigName: 'default',
      // Hand the workflow to the target application, which dequeues and runs it
      // on the version it is deployed at.
      applicationName:    APP_NAMES[target],
      appVersion:         APP_VERSIONS[target],
    },
    positionalArgs,
    namedArgs,
  );

  // Send the date message the child workflow is waiting on. Workflow IDs are
  // unique across the whole system database, so this reaches the child no matter
  // which application runs it.
  await DBOS.send(handle.workflowID, new Date('2025-03-15T00:00:00.000Z'), 'date-msg', undefined, {
    serializationType: 'portable',
  });

  return {
    result:   await handle.getResult(),
    parentId: DBOS.workflowID,
    childId:  handle.workflowID,
  };
}

const interopDriver = DBOS.registerWorkflow(interopDriverImpl, { name: 'interopDriver' });

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const expressApp = express();
expressApp.use(express.json());

expressApp.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

async function drive(target: string, body: unknown): Promise<DriverResult> {
  const { positionalArgs, namedArgs } = body as {
    positionalArgs: unknown[];
    namedArgs?: Record<string, unknown>;
  };
  return await interopDriver(target, positionalArgs ?? [], namedArgs ?? {});
}

expressApp.post('/enqueue/:target', async (req, res) => {
  const { target } = req.params;
  if (!QUEUE_NAMES[target]) {
    res.status(400).json({ error: `unknown target: ${target}` });
    return;
  }
  try {
    res.json((await drive(target, req.body)).result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

expressApp.post('/interop/:target', async (req, res) => {
  const { target } = req.params;
  if (!QUEUE_NAMES[target]) {
    res.status(400).json({ error: `unknown target: ${target}` });
    return;
  }
  try {
    res.json(await drive(target, req.body));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

expressApp.get('/workflow/:id', async (req, res) => {
  try {
    const status = await DBOS.getWorkflowStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: `no such workflow: ${req.params.id}` });
      return;
    }
    // Coalesce to null rather than leaving fields undefined: JSON.stringify drops
    // undefined keys, and this payload is compared field for field against the
    // Python app's answer for the same workflow.
    res.json({
      workflowId:         status.workflowID,
      name:               status.workflowName,
      status:             status.status,
      queueName:          status.queueName ?? null,
      applicationName:    status.applicationName ?? null,
      applicationVersion: status.applicationVersion ?? null,
      parentWorkflowId:   status.parentWorkflowID ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

expressApp.get('/steps/:id', async (req, res) => {
  try {
    const steps = (await DBOS.listWorkflowSteps(req.params.id)) ?? [];
    res.json(
      steps.map((step) => ({
        functionId:      step.functionID,
        functionName:    step.name,
        childWorkflowId: step.childWorkflowID ?? null,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (!SYS_DB_URL) {
    throw new Error('DBOS_SYSTEM_DATABASE_URL is required');
  }

  // listenQueues: only serve our own queue. The Go and Java runtimes register
  // their queues in the database without claiming ownership, and an unowned
  // queue is polled by every application sharing the system database.
  DBOS.setConfig({
    name: APP_NAMES.typescript,
    systemDatabaseUrl: SYS_DB_URL,
    applicationVersion: APP_VERSIONS.typescript,
    listenQueues: [QUEUE_NAMES.typescript],
  });
  await DBOS.launch();

  expressApp.listen(PORT, () => {
    console.log(`interop-typescript listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
