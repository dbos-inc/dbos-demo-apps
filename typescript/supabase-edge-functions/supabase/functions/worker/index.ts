import { DBOS } from "npm:@dbos-inc/dbos-sdk@4.27.6";
import { APP_NAME, APP_VERSION, QUEUE, systemDatabaseUrl } from "../_shared/config.ts";
import "../_shared/workflows.ts"; // registers processTask; must be imported before launch

// Runs until the queue is empty or Supabase kills it; Conductor recovers what was in flight.
const RECOVERY_GRACE_MS = Number(Deno.env.get("DBOS_RECOVERY_GRACE_MS") ?? 10_000);

const POLL_MS = 1_000;
const EMPTY_POLLS_TO_EXIT = 2;

const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

addEventListener("beforeunload", (ev) => {
  const reason = (ev as unknown as { detail?: { reason?: string } }).detail?.reason;
  log({ event: "isolate_shutdown", reason });
});

// DELAYED is excluded: cron's probe covers the moment a delayed workflow becomes ready.
async function inFlightCount(): Promise<number> {
  const wfs = await DBOS.listWorkflows({
    status: ["ENQUEUED", "PENDING"],
    applicationName: APP_NAME,
    limit: 1,
    loadInput: false,
    loadOutput: false,
  });
  return wfs.length;
}

export async function processWorkflows(): Promise<{ reason: string; wallMs: number }> {
  const t0 = Date.now();
  DBOS.setConfig({
    name: APP_NAME,
    systemDatabaseUrl: systemDatabaseUrl(),
    applicationVersion: APP_VERSION,
  });

  await DBOS.launch({
    conductorKey: Deno.env.get("DBOS_CONDUCTOR_KEY"),
    conductorExecutorMetadata: {
      platform: "supabase-edge",
      region: Deno.env.get("SB_REGION") ?? "unknown",
      startedAt: new Date().toISOString(),
    },
  });

  try {
    await DBOS.registerQueue(QUEUE, { onConflict: "never_update" });
    let empty = 0;
    while (true) {
      empty = (await inFlightCount()) === 0 ? empty + 1 : 0;
      if (empty >= EMPTY_POLLS_TO_EXIT && Date.now() - t0 >= RECOVERY_GRACE_MS) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } finally {
    // The loop only exits once the queue is empty, so there is nothing left to wait on.
    await DBOS.shutdown();
  }

  const out = { reason: "queue-empty", wallMs: Date.now() - t0 };
  log({ event: "worker_exit", ...out });
  return out;
}

// Keeps the isolate alive past the response.
function runInBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else void p;
}

let processing = false;

Deno.serve(() => {
  if (processing) {
    // Only launch DBOS once per isolate
    return Response.json({ accepted: false, reason: "already-processing" });
  }
  processing = true;
  runInBackground(
    processWorkflows()
      .catch((e) => log({ event: "process_workflows_failed", error: String(e) }))
      .finally(() => {
        processing = false;
      }),
  );
  // Answer immediately so the request is not held open while the workflows run.
  return Response.json({ accepted: true });
});
