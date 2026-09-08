-- Run once, after 01_schema.sql and after the functions are deployed.

-- Create the Vault secrets 'project_url' and 'service_role_key' first (see the README).

select cron.schedule(
  'dbos-worker-tick',
  '* * * * *', -- pg_cron's floor; the enqueue function kicks the worker for lower latency
  $$
  -- Start a worker by POSTing to it with your service role key...
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron', 'tick', now()),
    timeout_milliseconds := 5000
  )
  -- ...but only when there are workflows waiting to be executed.
  where exists (
    select 1
      from dbos.workflow_status
     where application_name = 'supabase-edge-functions' -- must match APP_NAME in config.ts
       and (
         status in ('ENQUEUED', 'PENDING') -- PENDING: orphaned, needs a worker to recover onto
         or (status = 'DELAYED' and delay_until_epoch_ms <= extract(epoch from now()) * 1000)
       )
  );
  $$
);

-- Inspect with `select * from cron.job_run_details`; remove with `select cron.unschedule('dbos-worker-tick')`.
