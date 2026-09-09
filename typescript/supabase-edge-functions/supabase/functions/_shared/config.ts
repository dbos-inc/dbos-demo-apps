// Shared identity for the DBOS app running on Supabase Edge Functions.

// Must match the worker, the probe in sql/02_cron.sql, and the app registered in Conductor.
export const APP_NAME = "supabase-edge-functions";

export const APP_VERSION = "v1";

export const QUEUE = "supabase-queue";
export const WORKFLOW_PROCESS_TASK = "processTask";

// Must be the session-mode pooler (:5432); the transaction pooler breaks LISTEN/NOTIFY.
export function systemDatabaseUrl(): string {
  const url = Deno.env.get("DBOS_SYSTEM_DATABASE_URL");
  if (!url) throw new Error("DBOS_SYSTEM_DATABASE_URL is not set");
  return url;
}
