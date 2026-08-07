# DBOS Toolbox (Rust)

The template app, ported from the Go `dbos-toolbox` to the
[`durare`](https://crates.io/crates/durare) SDK: example code for durable
workflows and steps, queues with parallel tasks, and scheduled (cron)
workflows, each behind an HTTP endpoint. Use it as a starting point for a new
durare app — start by editing `main.rs`.

## Run it

```bash
createdb dbos_toolbox   # once
DBOS_SYSTEM_DATABASE_URL=postgres://localhost:5432/dbos_toolbox cargo run
```

Then open <http://localhost:8080> and click the endpoints, or:

- `GET /workflow` — runs `ExampleWorkflow` (two durable steps) and returns its
  result.
- `GET /queue` — runs `QueueWorkflow`, which enqueues **ten** 5-second tasks on
  `example-queue` and waits for all of them; they run in parallel, so the
  batch completes in roughly the time of one task.
- `ScheduledWorkflow` fires every 15 seconds (6-field cron,
  `*/15 * * * * *`) — watch the app logs.

`DATABASE_URL` works as a fallback env var; `PORT` / `ADMIN_PORT` override the
HTTP (8080) and DBOS admin (3001) ports. The engine opts into
`recover_on_launch(true)` (durare ≥ 0.3.2), so a killed process resumes its
unfinished workflows on restart.
