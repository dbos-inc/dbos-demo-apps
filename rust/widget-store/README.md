# Widget Store (Rust / durare)

An online storefront whose checkout is a durable workflow, ported from the Go
`widget-store` demo to the [`durare`](https://crates.io/crates/durare) SDK.
Buy a widget and the app creates an order, reserves inventory, waits for a
payment webhook, then dispatches the order over ten progress ticks. **Crash
the app at any point** — mid-checkout, mid-dispatch — and the restart resumes
every workflow from its last completed step: no double-charge, no lost widget,
no rewound progress.

## Run it

```bash
createdb widget_store   # once
DBOS_SYSTEM_DATABASE_URL=postgres://localhost:5432/widget_store cargo run
```

Then open <http://localhost:8080>. The app schema (`products`, `orders`) is
bootstrapped idempotently at startup; the DBOS system schema lives in the same
database, managed by durare. `DATABASE_URL` works as a fallback, and `PORT` /
`ADMIN_PORT` override the HTTP (8080) and DBOS admin (3001) ports.

## Endpoints

| Endpoint | What it does |
|---|---|
| `GET /` | the storefront frontend |
| `GET /product` | the widget and its remaining inventory |
| `GET /orders`, `GET /order/:id` | order status and dispatch progress |
| `POST /restock` | reset inventory to 100 |
| `POST /checkout/:idempotency_key` | start (or re-attach to) a checkout; returns the payment id |
| `POST /payment_webhook/:payment_id/:payment_status` | deliver `paid` / `denied` to the waiting checkout |
| `POST /crash_application` | kill the process — the demo |

## How the durability works

- **Checkout** (`checkoutWorkflow`) runs under the caller's idempotency key,
  so a retried `POST /checkout` attaches to the in-flight run instead of
  double-charging. Each database write is a checkpointed step; the workflow
  publishes its payment id as an event, `recv`s the webhook's verdict (60s
  timeout), and either marks the order paid and starts the dispatch child
  workflow, or compensates — inventory back, order cancelled.
- **Dispatch** (`dispatchOrderWorkflow`) is ten durable `sleep` + progress
  ticks. A crash between ticks resumes at the recorded tick: progress never
  rewinds and never double-decrements (the demo's exactly-once assertion is
  that `progress_remaining` lands on exactly 0).
- **Recovery is opt-in on launch**: the engine is built with
  `EngineConfig::default().recover_on_launch(true)` (durare ≥ 0.3.2), so a
  restart's `launch()` re-dispatches whatever the crash interrupted, in the
  background — the storefront is serving again immediately.

## Notes for durare (vs. the Go app)

The port is faithful — same workflows, steps, events, and endpoints. Two
durare-specific notes:

- The app pool (`sqlx::PgPool`) is a process global read inside steps — the
  dependency-injection pattern from durare's `determinism` guide.
- The database steps here are at-least-once (like the Go app's): the write
  lands, then the checkpoint commits, and a crash between the two re-runs the
  step on recovery. All of this demo's writes tolerate that. For writes that
  must be *exactly-once*, durare offers what Go doesn't:
  `#[durare::transaction]` commits the SQL and the checkpoint in one database
  transaction.
- A `recv` timeout is `Ok(None)` in durare (Go raises `TimeoutError`); the
  checkout folds timeout, denial, and error into the same compensation path,
  matching the Go app's behavior.
