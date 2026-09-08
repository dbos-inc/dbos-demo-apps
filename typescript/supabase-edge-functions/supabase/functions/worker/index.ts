import { DBOS } from "npm:@dbos-inc/dbos-sdk@4.27.6";
import { APP_NAME, APP_VERSION, QUEUE, systemDatabaseUrl } from "../_shared/config.ts";
import "../_shared/workflows.ts"; // registers processTask; must be imported before launch

// The worker processes every enqueued workflow, then exits; it never idles. An idle
// launched worker still burns CPU against the edge function's 2s CPU cap, so waiting
// around is the one thing that cannot work here.
//
// It also imposes no CPU or wall budget on itself, deliberately: the platform's caps are
// not observable from inside the function anyway (process.cpuUsage() returns zeroes and
// EdgeRuntime exposes only waitUntil). So the worker runs until the queue is empty or
// Supabase kills it. A kill leaves workflows PENDING; Conductor pushes RECOVERY to the
// next worker and the work resumes from its last completed step.

// Conductor hands every launch a fresh executor UUID and pushes RECOVERY for dead
// executors to whichever executor is live. An orphaned workflow is PENDING and so counts
// as in-flight below, which already holds this worker open; this grace is the cheap
// backstop for the race where it does not.
const RECOVERY_GRACE_MS = Number(Deno.env.get("DBOS_RECOVERY_GRACE_MS") ?? 10_000);

const POLL_MS = 1_000;
const EMPTY_POLLS_TO_EXIT = 2;

const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

addEventListener("beforeunload", (ev) => {
  // EventLoopCompleted | WallClockTime | CPUTime | Memory | EarlyDrop | TerminationRequested.
  // Kept purely as observability: CPUTime and WallClockTime are expected outcomes here, and
  // seeing which one dominates is how you learn whether a workload fits this platform.
  const reason = (ev as unknown as { detail?: { reason?: string } }).detail?.reason;
  log({ event: "isolate_shutdown", reason });
});

// DELAYED is deliberately excluded: a delayed workflow whose timer has not fired is not
// work this invocation can do, and cron's probe covers the moment it becomes ready.
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

  // Conductor is intentionally not required to start. If it is unreachable the SDK retries
  // the socket every second, but dequeue is pure Postgres polling and needs no Conductor -
  // only recovery does. So fail open: keep processing workflows, and let recovery wait for
  // a tick that can reach Conductor.
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
    // Concurrent workers are safe under Conductor, but two launches inside one isolate are
    // not: DBOS is a process-global singleton.
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
  // Answer immediately so pg_net's request is not held open while the workflows run.
  return Response.json({ accepted: true });
});
