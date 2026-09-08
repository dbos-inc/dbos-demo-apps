// Shared identity for the DBOS app running on Supabase Edge Functions.

// Both functions must agree on APP_NAME: queues are scoped by application name in the
// system database, so an enqueue written under a different name lands in a queue no worker
// is listening to. This name must also be registered in DBOS Conductor and must match the
// name in sql/02_cron.sql.
export const APP_NAME = "supabase-edge-functions";

// Pinned deliberately, for two independent reasons:
//   1. Conductor recovery is scoped by (executor_id, application_version). Left to default
//      to a hash of the code, a deploy would strand every workflow still in flight under
//      the old hash.
//   2. Version names are unique across every application sharing a system database, and on
//      Supabase there is only one Postgres to share.
// Bump this on deploys that change workflow semantics, not on every push.
export const APP_VERSION = "v1";

// Queue names are unique across every application sharing a system database too.
export const QUEUE = "supabase-queue";
export const WORKFLOW_PROCESS_TASK = "processTask";

// Not SUPABASE_DB_URL: that is the platform-injected direct connection. DBOS needs the
// session-mode pooler (port 5432), because the system database uses LISTEN/NOTIFY, which
// the transaction-mode pooler (port 6543) silently breaks.
export function systemDatabaseUrl(): string {
  const url = Deno.env.get("DBOS_SYSTEM_DATABASE_URL");
  if (!url) throw new Error("DBOS_SYSTEM_DATABASE_URL is not set");
  return url;
}
