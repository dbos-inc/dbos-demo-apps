-- Run once against the project database, before deploying the functions.

-- Neither extension is present on a stock Supabase project.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- An example table used by the demo code
create table if not exists public.task_results (
  workflow_id  text primary key,
  task_id      text not null,
  result       jsonb not null,
  completed_at timestamptz not null default now()
);
