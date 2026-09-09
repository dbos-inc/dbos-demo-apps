import { DBOSClient } from "npm:@dbos-inc/dbos-sdk@4.27.6";
import { APP_NAME, QUEUE, systemDatabaseUrl, WORKFLOW_PROCESS_TASK } from "../_shared/config.ts";
import type { Task } from "../_shared/workflows.ts";

// The client writes the enqueue row and nothing else: no launch, no pollers, no Conductor.
let clientPromise: Promise<DBOSClient> | undefined;
function client(): Promise<DBOSClient> {
  // Cached per isolate; Supabase reuses isolates across invocations.
  clientPromise ??= DBOSClient.create({
    systemDatabaseUrl: systemDatabaseUrl(),
    applicationName: APP_NAME, // must match the worker, or the worker never claims the row
    systemDatabasePoolSize: 2,
  });
  return clientPromise;
}

// Cuts the up-to-60s cron latency; cron is still the backstop if this fails.
async function kickWorker(): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL"); // platform-injected https project URL
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return;
  try {
    await fetch(`${base}/functions/v1/worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "enqueue" }),
    });
  } catch (e) {
    console.warn(JSON.stringify({ event: "worker_kick_failed", error: String(e) }));
  }
}

// Keeps the isolate alive past the response.
function runInBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else void p;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const task: Task = {
    taskId: String((body as { taskId?: unknown }).taskId ?? crypto.randomUUID()),
    payload: (body as { payload?: Record<string, unknown> }).payload ?? {},
  };

  // appVersion is unset, so a deploy does not strand an enqueue on a departing version.
  const handle = await (await client()).enqueue<(t: Task) => Promise<Record<string, unknown>>>(
    { queueName: QUEUE, workflowName: WORKFLOW_PROCESS_TASK },
    task,
  );

  runInBackground(kickWorker());
  return Response.json({ workflowID: handle.workflowID, taskId: task.taskId });
});
