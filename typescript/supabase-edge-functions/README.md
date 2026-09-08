# DBOS on Supabase Edge Functions

Durable workflows on Supabase Edge Functions. `enqueue` writes a workflow row to the DBOS
system database; `worker` launches a DBOS executor, drains the queue, and exits. A pg_cron
tick wakes the worker whenever work is pending, and DBOS Conductor reassigns any workflow
orphaned when an edge function is killed mid-run.

## Prerequisites

- A [Supabase](https://supabase.com/dashboard) project.
- The Supabase CLI, logged in: `npx supabase login`.
- A [DBOS Conductor](https://console.dbos.dev) account with an application registered under
  the name `supabase-edge-functions` — it must match `APP_NAME` in
  `supabase/functions/_shared/config.ts` — and an API key from the
  [key settings page](https://console.dbos.dev/settings/apikey). Register the application in
  the console, or with `dbosctl app register supabase-edge-functions`.

## Deploy

1. Link the CLI to your project:

```shell
npx supabase link --project-ref <project-ref>
```

2. Set the function secrets. `DBOS_SYSTEM_DATABASE_URL` must be the **session-mode** pooler
URL (port 5432), found under *Connect* in the Supabase dashboard — DBOS uses LISTEN/NOTIFY,
which the transaction-mode pooler (port 6543) silently breaks:

```shell
npx supabase secrets set DBOS_SYSTEM_DATABASE_URL='postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres'
npx supabase secrets set DBOS_CONDUCTOR_KEY='<conductor-api-key>'
```

3. Apply `supabase/sql/01_schema.sql` (extensions and results table) in the SQL editor.

4. Deploy both functions:

```shell
npx supabase functions deploy enqueue worker
```

5. Invoke the worker once to create the DBOS system database schema. It finds no work and
exits after a few seconds:

```shell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/worker" \
  -H "Authorization: Bearer <service-role-key>"
```

6. Store the cron job's credentials in Vault, then apply `supabase/sql/02_cron.sql` in the
SQL editor. It queries `dbos.workflow_status`, which step 5 created:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

## Run it

```shell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/enqueue" \
  -H "Authorization: Bearer <service-role-key>" \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"demo","payload":{"hello":"world"}}'
```

`enqueue` returns a workflow ID and kicks the worker directly, so it does not wait for the
cron tick. The workflow's output lands in `public.task_results`:

```sql
select * from public.task_results order by completed_at desc;
```
