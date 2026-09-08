# DBOS on Supabase Edge Functions

## Deploy

1. Register an application named `supabase-edge-functions` on the
[DBOS console](https://console.dbos.dev) (or `dbosctl app register supabase-edge-functions`)
and create an API key on the [key settings page](https://console.dbos.dev/settings/apikey).

2. Link the Supabase CLI to your project:

```shell
npx supabase login
npx supabase link --project-ref <project-ref>
```

3. Set the function secrets. The database URL must be the **session-mode** pooler URL
(port 5432), found under *Connect* in the Supabase dashboard:

```shell
npx supabase secrets set DBOS_SYSTEM_DATABASE_URL='postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres'
npx supabase secrets set DBOS_CONDUCTOR_KEY='<conductor-api-key>'
```

4. Run `supabase/sql/01_schema.sql` in the SQL editor.

5. Deploy the functions:

```shell
npx supabase functions deploy enqueue worker
```

6. Invoke the worker once to create the DBOS system database schema:

```shell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/worker" \
  -H "Authorization: Bearer <service-role-key>"
```

7. Store the cron job's credentials, then run `supabase/sql/02_cron.sql` in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

8. Enqueue a task:

```shell
curl -X POST "https://<project-ref>.supabase.co/functions/v1/enqueue" \
  -H "Authorization: Bearer <service-role-key>" \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"demo","payload":{"hello":"world"}}'
```

Its output appears in `public.task_results`.
