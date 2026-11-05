//! The DBOS Rust starter: the Workflows, Queues, Events and Messages tabs of the starter app.
//!
//! **Workflows** is three steps, five seconds each, a progress event after each — and a crash
//! button. Launch a workflow, crash the process, restart it, and watch execution resume at the
//! step after the last one that finished. Durable execution is the whole demo: the crash-and-resume
//! needs no application code at all, because `launch()` recovers whatever the previous run
//! abandoned.
//!
//! **Events** is a key/value a workflow publishes as it goes, and anyone reads by name. The
//! Workflows tab already leans on one event for its progress bar; what this tab adds is the half
//! that bar cannot show — a read that *waits*. Ask for `shipped` before the order has shipped and
//! the request blocks until the workflow publishes it, which is `get_event` with a timeout rather
//! than the zero-timeout poll the progress bar uses.
//!
//! **Messages** is a workflow that stops and waits to be told something. An approval request runs
//! until it reaches `recv`, and then nothing happens until a message arrives — from this tab, from
//! another process, or from an application in another language. Approve one and it is `send`;
//! approve every waiting one and it is `send_bulk`, which is one transaction and so all-or-nothing.
//!
//! **Queues** is a fan-out under a concurrency limit. Enqueue five workflows that sleep five
//! seconds each against a queue allowing three at a time, and watch three run while two wait. The
//! part worth pressing is the Apply button: `worker_concurrency` changes while the app is running,
//! because a queue's configuration is a row every worker re-reads on every pass rather than a
//! constant captured at startup.

use std::time::Duration;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use dbos::{
    Change, Config, DBOS, QueueChange, QueueOptions, QueueRequest, StartOptions, WorkflowHandle,
    WorkflowRef,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;

/// The key the workflow publishes its progress under, and the UI polls.
const STEPS_EVENT: &str = "steps_event";
const STEP_DURATION: Duration = Duration::from_secs(5);

/// The queue the fan-out demo enqueues onto.
const QUEUE_NAME: &str = "demo-queue";

/// The keys the order workflow publishes, in the order it publishes them.
///
/// Names rather than numbers, which is the difference from the progress bar's single counter: a
/// reader asks for `shipped` without knowing or caring which step number that was.
const ORDER_KEYS: [&str; 3] = ["accepted", "charged", "shipped"];

/// How long the order workflow spends before publishing each of its keys.
///
/// Three keys at three seconds is nine, which has to stay comfortably under
/// [`EVENT_READ_TIMEOUT`]: the gesture the tab is built around is pressing Read on `shipped` before
/// the order has shipped, and that has to *succeed* after a visible wait rather than time out.
const ORDER_STEP: Duration = Duration::from_secs(3);

/// How long a blocking `get_event` waits before reporting that the key is not there.
///
/// Longer than a whole order takes, so pressing Read on `shipped` the moment one starts waits for
/// it and then succeeds. Reading a key nothing will ever publish still times out here, which is the
/// other half worth seeing: absence is a value, and the timeout only decides how long to hope.
const EVENT_READ_TIMEOUT: Duration = Duration::from_secs(12);

/// The topic approvals are sent on.
///
/// A topic rather than the default one because it is the honest shape: a workflow that waits for
/// several kinds of message selects on the topic, and a message sent on another waits in the
/// database rather than being handed to the wrong `recv`.
const APPROVAL_TOPIC: &str = "approval";

/// How long an approval request waits to be told something before giving up.
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

/// The name approval requests are registered under, and the name the tab lists them back by.
const APPROVAL_WORKFLOW: &str = "ApprovalWorkflow";

/// How many approval requests the tab shows, newest first.
///
/// A bound rather than a page: this is a demo, and the interesting requests are the recent ones.
const APPROVAL_LIST_LIMIT: i64 = 20;

/// The key an approval request publishes its outcome under, for the tab to read.
///
/// The workflow's *return value* is the same string, but reading a return value means holding a
/// handle, and a restart forgets those. An event is a row, so the tab can report a decision made
/// before the last restart — and reading one costs nothing when the answer is "still waiting".
const DECISION_EVENT: &str = "decision";

/// How many of the queue's workflows one process may run at once, to begin with.
///
/// Three of five, so two visibly wait. The Apply button changes it without a restart.
const DEFAULT_WORKER_CONCURRENCY: i32 = 3;

/// How many the Enqueue button puts on the queue at once.
const ENQUEUE_BATCH: usize = 5;

/// Used when `DBOS_SYSTEM_DATABASE_URL` is not set. The database is created if it does not exist.
///
/// Deliberately no username or password: the driver fills in whatever the URL leaves out
/// from the standard libpq variables, such as PGUSER and PGPASSWORD.
const DEFAULT_DATABASE_URL: &str = "postgres://localhost:5432/dbos_rust_starter";

/// The version this build of the application runs as.
///
/// Something has to give one — DBOS computes none — and recovery only resumes workflows stamped
/// with the running executor's own version, so the crate's version is the natural answer: it
/// changes when a release says the code changed, not when the compiler happens to emit different
/// bytes. Naming it here is a decision, not a default: it outranks `DBOS__APPVERSION`, which a
/// local run would have to leave `app_version` unset to use. On DBOS Cloud the deployment's
/// version replaces it regardless — the app was built without knowing which deployment runs it.
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// A durable workflow, resilient to any failure: if the program is crashed, interrupted, or
/// restarted while it runs, it automatically resumes from the last completed step.
///
/// Registration is what makes it durable: `register_workflow` returns a typed `WorkflowRef`, and
/// the durable invocations are its methods — `start` for a handle without waiting (what the
/// `/workflow` endpoint uses), `run` to await the result in place.
async fn example_workflow(_: ()) -> dbos::Result<String> {
    dbos::step("step_one", step_one).await?;
    // Publish progress after each step, for the frontend to display.
    dbos::set_event(STEPS_EVENT, &1u32).await?;
    dbos::step("step_two", step_two).await?;
    dbos::set_event(STEPS_EVENT, &2u32).await?;
    dbos::step("step_three", step_three).await?;
    dbos::set_event(STEPS_EVENT, &3u32).await?;
    Ok("Workflow completed".to_owned())
}

async fn step_one() -> dbos::Result<()> {
    tokio::time::sleep(STEP_DURATION).await;
    println!("Completed step 1!");
    Ok(())
}

async fn step_two() -> dbos::Result<()> {
    tokio::time::sleep(STEP_DURATION).await;
    println!("Completed step 2!");
    Ok(())
}

async fn step_three() -> dbos::Result<()> {
    tokio::time::sleep(STEP_DURATION).await;
    println!("Completed step 3!");
    Ok(())
}

/// Publishes a named key at each stage of an order, for anyone to read by name.
///
/// The Workflows tab publishes a step *count*; this publishes what actually happened, under keys a
/// reader asks for by name. Setting a key again would replace it — these are three distinct keys,
/// so all three stay readable once written, including after the workflow has finished.
async fn order_workflow(_: ()) -> dbos::Result<String> {
    for key in ORDER_KEYS {
        dbos::sleep(ORDER_STEP).await?;
        dbos::set_event(key, &format!("{key} at step {}", stage_of(key) + 1)).await?;
        println!("Order published {key}.");
    }
    Ok("Order complete".to_owned())
}

/// Where a key falls in [`ORDER_KEYS`], for the value the workflow publishes under it.
fn stage_of(key: &str) -> usize {
    ORDER_KEYS.iter().position(|k| *k == key).unwrap_or(0)
}

/// Waits to be told something, and does nothing at all until it is.
///
/// **The whole demo is the pause.** A workflow that reaches `recv` stops there, durably: the
/// process can be restarted under it and the wait resumes with whatever is left of its timeout,
/// because the deadline was checkpointed rather than held in memory. Nothing here polls, and
/// nothing holds a connection open on the workflow's behalf.
///
/// The outcome is published as an event as well as returned, so the tab can report a decision it
/// was not holding a handle for — see [`DECISION_EVENT`].
async fn approval_workflow(_: ()) -> dbos::Result<String> {
    let decision: Option<String> = dbos::recv(Some(APPROVAL_TOPIC), APPROVAL_TIMEOUT).await?;
    // Absence is a value: nobody answered before the deadline, which is not a failure.
    let outcome = decision.unwrap_or_else(|| "expired".to_owned());
    println!("Approval request resolved: {outcome}.");
    dbos::set_event(DECISION_EVENT, &outcome).await?;
    Ok(outcome)
}

/// A workflow with nothing to it but a wait, which is all the queue demo needs: what it
/// demonstrates is *when* it runs, not what it does.
async fn enqueued_workflow(_: ()) -> dbos::Result<String> {
    println!("Enqueued workflow starting.");
    dbos::sleep(STEP_DURATION).await?;
    println!("Enqueued workflow ending.");
    Ok("Enqueued workflow completed".to_owned())
}

/// `DBOS` is an `Arc` newtype, so it goes into the router's state by `clone()`.
#[derive(Clone)]
struct App {
    dbos: DBOS,
    example: WorkflowRef<(), String>,
    enqueued: WorkflowRef<(), String>,
    /// Handles for what this process has put on the queue, so the tab can report their statuses.
    ///
    /// Kept rather than queried back, unlike the Messages tab: a restart forgets them, which for
    /// this tab is the right amount of memory — the queue itself does not forget, because the rows
    /// are still there and still get dequeued.
    ///
    /// A `tokio` mutex because the guard is held across `status().await`.
    queued: Arc<Mutex<Vec<WorkflowHandle<String>>>>,
    order: WorkflowRef<(), String>,
    approval: WorkflowRef<(), String>,
    /// The order whose keys the Events tab is reading, if one has been started.
    ///
    /// An id rather than a handle, because every read this tab does is by *id* — that is what an
    /// event is for. Nothing here awaits the workflow.
    order_id: Arc<Mutex<Option<String>>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let mut config = Config::from_env("dbos-rust-starter");
    if config.database_url.is_empty() {
        config.database_url = DEFAULT_DATABASE_URL.to_owned();
    }
    config.app_version = Some(APP_VERSION.to_owned());
    let dbos = DBOS::new(config);
    let example = dbos.register_workflow("ExampleWorkflow", example_workflow)?;
    let enqueued = dbos.register_workflow("EnqueuedWorkflow", enqueued_workflow)?;
    let order = dbos.register_workflow("OrderWorkflow", order_workflow)?;
    let approval = dbos.register_workflow(APPROVAL_WORKFLOW, approval_workflow)?;

    // Migrates, connects — and recovers whatever the previous run abandoned, which is the
    // entire crash-and-resume demonstration.
    dbos.launch().await?;

    // **After launch, unlike a workflow.** A queue is a row, so registering one is a write and
    // needs a launched instance. `NeverUpdate` so a restart does not undo whatever the Apply
    // button last set — the row is the source of truth, and the app is only seeding it.
    dbos.register_queue(
        QUEUE_NAME,
        QueueOptions {
            worker_concurrency: Some(DEFAULT_WORKER_CONCURRENCY),
            ..QueueOptions::default()
        },
        dbos::QueueConflict::NeverUpdate,
    )
    .await?;

    let app = App {
        dbos: dbos.clone(),
        example,
        enqueued,
        queued: Arc::default(),
        order,
        approval,
        order_id: Arc::default(),
    };
    let router = Router::new()
        .route("/", get(index))
        .route("/workflow/{task_id}", post(start_workflow))
        .route("/last_step/{task_id}", get(last_step))
        .route("/crash", post(crash))
        .route("/queue/status", get(queue_status))
        .route("/queue/enqueue", post(queue_enqueue))
        .route("/queue/concurrency", post(queue_concurrency))
        .route("/events/start", post(events_start))
        .route("/events/status", get(events_status))
        .route("/events/read", post(events_read))
        .route("/messages/start", post(messages_start))
        .route("/messages/status", get(messages_status))
        .route("/messages/respond", post(messages_respond))
        .route("/messages/respond-all", post(messages_respond_all))
        .with_state(app);

    // Loopback, not 0.0.0.0: this app ships a button that exits the process, which is a fine
    // thing to hand yourself and a poor thing to hand your network.
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("Server starting on http://localhost:8080");
    // Serving until Ctrl-C rather than forever is what makes the line below reachable — and
    // `shutdown` is worth reaching: it leaves every running workflow PENDING for the next launch
    // to recover, which is the same path the crash button takes the long way round.
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            println!("Shutting down");
        })
        .await?;

    dbos.shutdown().await;
    Ok(())
}

/// Serves the HTML frontend, embedded in the binary.
async fn index() -> Html<&'static str> {
    Html(include_str!("../html/app.html"))
}

/// Starts the workflow under the caller's id and returns at once; the handle is dropped.
///
/// The id is the caller's, so posting the same task twice joins the workflow already running
/// rather than failing — the id is an idempotency key, and a double-click is not an error. A
/// `POST` because it starts something: a `GET` that does is one a prefetch or a back button can
/// fire on the user's behalf.
async fn start_workflow(
    State(app): State<App>,
    Path(task_id): Path<String>,
) -> Result<(), AppError> {
    app.example
        .start_with(
            (),
            StartOptions {
                workflow_id: Some(&task_id),
                ..Default::default()
            },
        )
        .await?;
    Ok(())
}

/// How many steps the workflow has completed — from outside any workflow, with a zero timeout.
///
/// Zero until the workflow publishes its first event, which is what shows "executing step 1".
async fn last_step(
    State(app): State<App>,
    Path(task_id): Path<String>,
) -> Result<String, AppError> {
    let step: Option<u32> = app
        .dbos
        .get_event(&task_id, STEPS_EVENT, Duration::ZERO)
        .await?;
    Ok(step.unwrap_or(0).to_string())
}

/// What the Queues tab polls: the limit currently stored, and what this app's enqueued workflows
/// are doing.
#[derive(Serialize)]
struct QueueStatus {
    worker_concurrency: i32,
    /// Counts keyed by status name — `ENQUEUED`, `PENDING`, `SUCCESS`, and so on.
    workflow_counts: std::collections::BTreeMap<String, usize>,
}

/// Reads the limit back from the **row**, not from what this process registered.
///
/// That is the point of the tab: a peer could have changed it, and what this executor's dequeues
/// honour is whatever the row says right now.
async fn queue_status(State(app): State<App>) -> Result<Json<QueueStatus>, AppError> {
    let worker_concurrency = app
        .dbos
        .queue(QUEUE_NAME)
        .await?
        .and_then(|queue| queue.worker_concurrency())
        .unwrap_or(DEFAULT_WORKER_CONCURRENCY);

    let mut workflow_counts = std::collections::BTreeMap::new();
    for handle in app.queued.lock().await.iter() {
        let status = handle.status().await?;
        *workflow_counts
            .entry(format!("{status:?}").to_uppercase())
            .or_default() += 1;
    }

    Ok(Json(QueueStatus {
        worker_concurrency,
        workflow_counts,
    }))
}

/// Puts a batch of workflows on the queue and returns at once.
///
/// None of them runs here just because this process asked: each is recorded `ENQUEUED`, and
/// whichever executor next polls the queue claims it — under the limit the row currently carries.
async fn queue_enqueue(State(app): State<App>) -> Result<(), AppError> {
    for _ in 0..ENQUEUE_BATCH {
        let handle = app
            .enqueued
            .start_with(
                (),
                StartOptions {
                    queue: Some(QueueRequest::new(QUEUE_NAME)),
                    ..Default::default()
                },
            )
            .await?;
        app.queued.lock().await.push(handle);
    }
    Ok(())
}

#[derive(Deserialize)]
struct ConcurrencyRequest {
    concurrency: Option<i32>,
}

/// **The Apply button: a limit changed while the app runs.**
///
/// No restart and no redeploy. The write lands in the queue's row, the supervisor publishes it on
/// its next sweep, and every worker in the fleet — not just this process — picks it up on its next
/// pass.
async fn queue_concurrency(
    State(app): State<App>,
    Json(request): Json<ConcurrencyRequest>,
) -> Result<(), AppError> {
    let concurrency = request
        .concurrency
        .filter(|value| *value >= 1)
        .unwrap_or(DEFAULT_WORKER_CONCURRENCY);
    app.dbos
        .update_queue(
            QUEUE_NAME,
            QueueChange {
                worker_concurrency: Change::Set(Some(concurrency)),
                ..QueueChange::default()
            },
        )
        .await?;
    Ok(())
}

// ============================================================
// EVENTS TAB
// ============================================================

/// What the Events tab polls: which keys the current order has published so far.
#[derive(Serialize)]
struct EventsStatus {
    workflow_id: Option<String>,
    /// One entry per key in `ORDER_KEYS`, in order, with its value once published.
    keys: Vec<EventKey>,
}

#[derive(Serialize)]
struct EventKey {
    key: String,
    value: Option<String>,
}

/// Starts an order, replacing whatever the tab was watching.
async fn events_start(State(app): State<App>) -> Result<String, AppError> {
    let handle = app.order.start(()).await?;
    let id = handle.workflow_id().to_owned();
    *app.order_id.lock().await = Some(id.clone());
    Ok(id)
}

/// Reads every key with a **zero** timeout: look once, do not wait.
///
/// This is the poll, and it is deliberately the boring half — `events_read` below is the one worth
/// watching. A key that has not been published yet reads as `None`, which is a value and not an
/// error.
async fn events_status(State(app): State<App>) -> Result<Json<EventsStatus>, AppError> {
    let workflow_id = app.order_id.lock().await.clone();
    let mut keys = Vec::with_capacity(ORDER_KEYS.len());
    for key in ORDER_KEYS {
        let value = match &workflow_id {
            Some(id) => app.dbos.get_event(id, key, Duration::ZERO).await?,
            None => None,
        };
        keys.push(EventKey {
            key: key.to_owned(),
            value,
        });
    }
    Ok(Json(EventsStatus { workflow_id, keys }))
}

#[derive(Deserialize)]
struct ReadRequest {
    key: String,
}

/// The result of a blocking read, with how long it actually waited.
#[derive(Serialize)]
struct ReadResult {
    key: String,
    value: Option<String>,
    waited_ms: u128,
}

/// **The read that waits.** Asks for one key with a real timeout and blocks until it appears.
///
/// Press this on `shipped` while the order is still being accepted and the request sits here until
/// the workflow publishes it — no polling, and no connection held open on the workflow's side. The
/// elapsed time comes back so the tab can show that the wait was real.
///
/// A key that never arrives is `None` at the deadline rather than an error, which is the same
/// answer `events_status` gives immediately: absence is a value either way, and the timeout only
/// decides how long to keep hoping.
async fn events_read(
    State(app): State<App>,
    Json(request): Json<ReadRequest>,
) -> Result<Json<ReadResult>, AppError> {
    let Some(id) = app.order_id.lock().await.clone() else {
        return Ok(Json(ReadResult {
            key: request.key,
            value: None,
            waited_ms: 0,
        }));
    };
    let started = std::time::Instant::now();
    let value: Option<String> = app
        .dbos
        .get_event(&id, &request.key, EVENT_READ_TIMEOUT)
        .await?;
    Ok(Json(ReadResult {
        key: request.key,
        value,
        waited_ms: started.elapsed().as_millis(),
    }))
}

// ============================================================
// MESSAGES TAB
// ============================================================

/// One approval request, as the tab displays it.
#[derive(Serialize)]
struct Approval {
    workflow_id: String,
    /// The decision, once one has been made or the request expired. `None` while it is waiting.
    decision: Option<String>,
}

/// Starts a request and leaves it waiting at its `recv`.
///
/// The handle is dropped: nothing here awaits the workflow, and [`messages_status`] finds it again
/// by name rather than by having kept anything.
async fn messages_start(State(app): State<App>) -> Result<String, AppError> {
    let handle = app.approval.start(()).await?;
    Ok(handle.workflow_id().to_owned())
}

/// Every approval request in the database, newest first.
///
/// **Queried rather than remembered, and that is the tab's point.** A list held in this process
/// would be emptied by the crash button, and the tab would report nothing while the requests
/// themselves were still parked at their `recv`, exactly where the last run left them. Asking the
/// database instead means a restart changes nothing on screen — which is the claim the tab makes,
/// so it had better be one the tab can keep.
async fn approval_ids(app: &App) -> Result<Vec<String>, AppError> {
    let rows = app
        .dbos
        .list_workflows(&dbos::sysdb::types::WorkflowFilter {
            names: vec![APPROVAL_WORKFLOW],
            limit: Some(APPROVAL_LIST_LIMIT),
            sort_desc: true,
            ..Default::default()
        })
        .await?;
    Ok(rows.into_iter().map(|row| row.workflow_id).collect())
}

/// Every request in the database, newest first, each with its decision if it has one.
async fn messages_status(State(app): State<App>) -> Result<Json<Vec<Approval>>, AppError> {
    let ids = approval_ids(&app).await?;
    let mut approvals = Vec::with_capacity(ids.len());
    for workflow_id in ids {
        let decision = app
            .dbos
            .get_event(&workflow_id, DECISION_EVENT, Duration::ZERO)
            .await?;
        approvals.push(Approval {
            workflow_id,
            decision,
        });
    }
    Ok(Json(approvals))
}

#[derive(Deserialize)]
struct RespondRequest {
    workflow_id: String,
    decision: String,
}

/// **One message to one waiting workflow.**
///
/// The workflow is not running when this arrives — it is parked at `recv` with nothing of it in
/// memory — and it is the *row* this writes that wakes it. Which is why the same call works from
/// another process, or from an application in another language sharing this database.
async fn messages_respond(
    State(app): State<App>,
    Json(request): Json<RespondRequest>,
) -> Result<(), AppError> {
    app.dbos
        .send_with(
            dbos::SendMessage {
                topic: Some(APPROVAL_TOPIC),
                ..dbos::SendMessage::new(&request.workflow_id, &request.decision)
            },
            dbos::SendOptions::default(),
        )
        .await?;
    Ok(())
}

#[derive(Deserialize)]
struct RespondAllRequest {
    decision: String,
}

/// **Every waiting request, in one transaction.**
///
/// The difference from a loop of [`messages_respond`] is all-or-nothing: `send_bulk` is a single
/// insert, so a failure part-way through delivers nothing rather than a prefix. Nobody is approved
/// unless everybody is.
///
/// Requests that already have a decision are left out — sending to them would be delivered and
/// simply never received, since their `recv` has already returned.
async fn messages_respond_all(
    State(app): State<App>,
    Json(request): Json<RespondAllRequest>,
) -> Result<String, AppError> {
    let ids = approval_ids(&app).await?;
    let mut waiting = Vec::new();
    for id in ids {
        let decided: Option<String> = app
            .dbos
            .get_event(&id, DECISION_EVENT, Duration::ZERO)
            .await?;
        if decided.is_none() {
            waiting.push(id);
        }
    }
    let messages: Vec<dbos::SendMessage<'_, String>> = waiting
        .iter()
        .map(|id| dbos::SendMessage {
            topic: Some(APPROVAL_TOPIC),
            ..dbos::SendMessage::new(id, &request.decision)
        })
        .collect();
    app.dbos.send_bulk(&messages).await?;
    Ok(messages.len().to_string())
}

/// Crashes the application. For demonstration purposes only :)
async fn crash() {
    println!("Simulating application crash");
    std::process::exit(1);
}

/// A `dbos::Error` carried out of a handler as a 500.
struct AppError(dbos::Error);

impl From<dbos::Error> for AppError {
    fn from(error: dbos::Error) -> Self {
        Self(error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}
