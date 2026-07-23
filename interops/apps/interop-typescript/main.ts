/**
 * DBOS TypeScript interop app.
 *
 * Registers echoWorkflow as a ConfiguredInstance method (class=interop, instance="default")
 * on interop-queue-typescript.
 * POST /enqueue/:target  — enqueues echoWorkflow to interop-queue-{target}
 *                          and returns the result.
 * GET  /healthz          — liveness probe.
 */

import express from 'express';
import { DBOS, ConfiguredInstance, DBOSClient, WorkflowQueue } from '@dbos-inc/dbos-sdk';

const SYS_DB_URL = process.env.DBOS_SYSTEM_DATABASE_URL!;
const PORT       = parseInt(process.env.PORT ?? '8002', 10);

const QUEUE_NAMES: Record<string, string> = {
  python:     'interop-queue-python',
  typescript: 'interop-queue-typescript',
  go:         'interop-queue-go',
  java:       'interop-queue-java',
};

// ---------------------------------------------------------------------------
// Workflow registration — class instance method style
// ---------------------------------------------------------------------------

const _queue = new WorkflowQueue('interop-queue-typescript');

@DBOS.className('interop')
class InteropService extends ConfiguredInstance {
  @DBOS.workflow({ serialization: 'portable', name: 'echoWorkflow' })
  async echoWorkflow(
    text: string,
    num: number,
    floatVal: number,
    items: string[],
    dateStr: string,
  ): Promise<{ echo_text: string; echo_num: number; echo_float: number; items_count: number; echo_date: string; msg_date: string }> {
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

  // Always fails with the canonical interop error envelope. The portable
  // serializer records name/message/code/data off the thrown error, so callers
  // in any language can deserialize the same fields.
  @DBOS.workflow({ serialization: 'portable', name: 'failWorkflow' })
  async failWorkflow(_msg: string): Promise<never> {
    const err = new Error('interop boom');
    err.name = 'InteropError';
    (err as { code?: unknown }).code = 418;
    (err as { data?: unknown }).data = { detail: 'teapot' };
    throw err;
  }
}

// Create instance with name "default"
const _service = new InteropService('default');

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const expressApp = express();
expressApp.use(express.json());

expressApp.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

expressApp.post('/enqueue/:target', async (req, res) => {
  const { target } = req.params;
  const queueName  = QUEUE_NAMES[target];
  if (!queueName) {
    res.status(400).json({ error: `unknown target: ${target}` });
    return;
  }

  const { positionalArgs, namedArgs } = req.body as { positionalArgs: unknown[]; namedArgs?: Record<string, unknown> };

  try {
    const client = await DBOSClient.create({ systemDatabaseUrl: SYS_DB_URL });
    try {
      const handle = await client.enqueuePortable<{
        echo_text: string; echo_num: number; echo_float: number; items_count: number; echo_date: string; msg_date: string;
      }>(
        {
          queueName,
          workflowName:       'echoWorkflow',
          workflowClassName:  'interop',
          workflowConfigName: 'default',
        },
        positionalArgs,
        namedArgs,
      );

      // Send a date message to the enqueued workflow using portable serialisation.
      await client.send(handle.workflowID, new Date('2025-03-15T00:00:00.000Z'), 'date-msg', undefined, { serializationType: 'portable' });

      const result = await handle.getResult();
      res.json(result);
    } finally {
      await client.destroy();
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

expressApp.post('/error/:target', async (req, res) => {
  const { target } = req.params;
  const queueName  = QUEUE_NAMES[target];
  if (!queueName) {
    res.status(400).json({ error: `unknown target: ${target}` });
    return;
  }

  try {
    const client = await DBOSClient.create({ systemDatabaseUrl: SYS_DB_URL });
    try {
      const handle = await client.enqueuePortable<never>(
        {
          queueName,
          workflowName:       'failWorkflow',
          workflowClassName:  'interop',
          workflowConfigName: 'default',
        },
        ['trigger'],
      );

      try {
        await handle.getResult();
        res.status(500).json({ error: 'expected failWorkflow to fail' });
      } catch (err) {
        // The SDK re-raises a PortableWorkflowError carrying the deserialized
        // envelope fields; read them without importing the (unexported) class.
        const e = err as { name?: string; message?: string; code?: unknown; data?: unknown };
        res.json({ name: e.name, message: e.message, code: e.code, data: e.data });
      }
    } finally {
      await client.destroy();
    }
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

  // listenQueues: only serve our own queue — database-backed queues (e.g. the
  // Go app's) are visible to every worker on the shared system database.
  DBOS.setConfig({ name: 'interop-typescript', systemDatabaseUrl: SYS_DB_URL, applicationVersion: 'interop-v1', listenQueues: ['interop-queue-typescript'] });
  await DBOS.launch();

  expressApp.listen(PORT, () => {
    console.log(`interop-typescript listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
