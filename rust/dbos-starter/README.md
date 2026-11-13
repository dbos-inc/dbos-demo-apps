# DBOS Rust Starter

The Workflows, Schedules, Queues, Events and Messages tabs of the DBOS starter app.

**Workflows** is a three-step workflow that checkpoints each step to Postgres, a progress display,
and a crash button. Launch a workflow, crash the app, restart it — execution resumes at the step
after the last one that finished, with no application code involved.

**Schedules** is a workflow that runs on a cron expression, which can be changed, paused and
resumed while the app runs.

**Queues** is a fan-out under a concurrency limit. Enqueue five workflows against a queue that
allows three at a time, and watch three run while two wait.

**Events** is a key/value a workflow publishes as it goes, readable by name from outside it. The
Workflows tab already uses one event for its progress bar; this tab shows the half that bar cannot —
a read that *waits*.

**Messages** is a workflow that stops and waits to be told something. Approval requests park at
`recv` until a message arrives, from this tab or from anywhere else sharing the database.

## Run it

With a Postgres listening on `localhost:5432`, no configuration is needed:

```bash
cargo run
```

The app connects to a `dbos_rust_starter` database, creating it if it does not exist. The default
URL carries no username or password, so the standard libpq variables apply — set `PGUSER` and
`PGPASSWORD` if your server wants them. Point it elsewhere entirely with:

```bash
export DBOS_SYSTEM_DATABASE_URL=postgres://user:password@host:5432/dbname
```

Open <http://localhost:8080>, launch a workflow, and crash the app mid-run. Restart it with
`cargo run` again — `launch()` recovers the workflow, the steps that already
finished do not run again, and the progress display picks up where it left off.

Then open the **Schedules** tab and press Apply, which creates a schedule that runs a workflow every
five seconds. The schedule is a row in the database rather than something this process holds, so
every copy of the app sees the same one, and it is still running after a restart. Change the cron
expression and press Apply again, or use Pause and Resume. A pause takes effect at the next tick,
because each schedule re-reads its row before firing. Other changes wait for the scheduler to re-read
the table, every 30 seconds, or every second for the first minute after launch. Trigger runs the
workflow once right away, whatever the cron expression says.

Then open the Queues tab and press "Enqueue 5 workflows". Three go `PENDING` and two stay
`ENQUEUED`, because `demo-queue` is registered with `worker_concurrency: 3`. The part worth
pressing is **Apply**: change the number and the running app honours it within a poll — no
restart, no redeploy. A queue's configuration is a row that every worker re-reads on every pass,
so the new limit reaches the whole fleet rather than just the process you clicked in.

Nothing is dequeued by the process that enqueued it just because it asked. Each workflow is
recorded `ENQUEUED` and claimed by whichever executor next polls the queue, which here happens to
be the same one — run a second copy of the app against the same database and they will share the
backlog.

Then open the **Events** tab and start an order. It publishes three named keys — `accepted`,
`charged`, `shipped` — three seconds apart. The button worth pressing is **Read** on `shipped`
immediately after starting: the request blocks for about nine seconds and then returns the value,
because `get_event` with a timeout waits for a key to appear rather than polling for it. Nothing is
held open on the workflow's side, and the elapsed time is shown so you can see the wait was real.
Read a key nothing ever publishes — the picker only offers three, but the API takes any name — and
the same call returns "not published" at its deadline: absence is a value, not an error.

The **Messages** tab is the one that shows a workflow *waiting*. Press "Request an approval" a few
times; each starts a workflow that runs to `recv` and stops there, durably, with nothing of it in
memory. Approve one and the row resolves. Approve them all and the difference is `send_bulk`: one
transaction, so nobody is approved unless everybody is.

The tab lists requests by querying the database for workflows named `ApprovalWorkflow` rather than
remembering what this process started — which is what lets it survive the crash button. Start two
requests, crash the app on the Workflows tab, restart, and both are still listed and still waiting.
Approve them then: the messages arrive, the recovered workflows take them, and the decisions land.
Their `recv` deadline was checkpointed, so a recovered request has whatever is left of its two
minutes rather than a fresh two minutes.

The server listens on loopback only, since the crash button exits the process. Ctrl-C is the
other way out and takes the tidy path: it stops serving and calls `shutdown()`, which leaves any
workflow still running `PENDING` for the next launch to recover — the same end as the crash
button, reached deliberately.

## Tests

`cargo test` runs the app in-process against the same Postgres, driving its HTTP routes without
binding a port. Each test creates a database of its own, named after the app's with
`_test_<name>` appended, and leaves it in place for the next run.

## The application version

The app runs as its crate version, `CARGO_PKG_VERSION`. DBOS requires a version and computes
none: recovery only resumes workflows stamped with the running executor's own version, which is
the right rule in production, where changed code may contain a changed workflow — and it means the
value has to be something outside the compiler's control. The crate version is that: it changes
when a release says the code changed, so every `cargo run` of one build is the same version, and
the crash button's `PENDING` workflows are still this executor's to recover after a rebuild.

Because the app names its version, `DBOS__APPVERSION` does not override it — an application that
wants the environment to decide leaves `Config::app_version` as `None` instead, and launch fails
if nothing then supplies one. On DBOS Cloud the deployment's version wins either way.
