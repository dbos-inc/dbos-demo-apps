-- Run once, after 01_schema.sql and after the functions are deployed.

-- Credentials for the cron job. Run these two with real values first:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

-- The tick: decide whether there is work, and if so wake a worker. The WHERE clause is
-- what keeps an idle project free - net.http_post is never called when nothing is pending.
--
-- The probe is deliberately broader than the worker's own drain check. It counts PENDING
-- rows, which includes workflows orphaned by a worker that died mid-step. Those need a live
-- executor to exist before Conductor can push RECOVERY to it, so counting them is precisely
-- what causes a worker to be launched to receive that push.
--
-- 'supabase-edge-functions' must match APP_NAME in functions/_shared/config.ts.
select cron.schedule(
  'dbos-worker-tick',
  '* * * * *', -- one minute is pg_cron's floor; the enqueue function kicks the worker directly for latency
  $$
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
  where exists (
    select 1
      from dbos.workflow_status
     where application_name = 'supabase-edge-functions'
       and (
         status in ('ENQUEUED', 'PENDING')
         or (status = 'DELAYED' and delay_until_epoch_ms <= extract(epoch from now()) * 1000)
       )
  );
  $$
);

-- To inspect or remove:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select cron.unschedule('dbos-worker-tick');
