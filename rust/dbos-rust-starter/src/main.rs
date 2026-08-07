//! A DBOS starter app on the `durare` durable-execution SDK for Rust — a port of
//! the Go `dbos-go-starter`. It demonstrates durable workflows, steps, durable
//! sleep, cron schedules, queues, events, and human-in-the-loop messaging, all
//! behind a small `axum` web server that mirrors the Go starter's endpoints and
//! reuses its frontend verbatim.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use durare::{
    ApplySchedule, DurableContext, DurableEngine, EngineConfig, ListFilter, PostgresProvider,
    Result, ScheduleStatus, ScheduledInput, WorkflowOptions, WorkflowQueue, WorkflowStatus,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const STEPS_EVENT: &str = "steps_event";

const SCHEDULE_NAME: &str = "scheduled-workflow";
const SCHEDULED_WORKFLOW: &str = "ScheduledWorkflow";
const DEFAULT_CRON: &str = "*/5 * * * * *";

const QUEUE_NAME: &str = "demo-queue";
const ENQUEUED_WORKFLOW: &str = "EnqueuedWorkflow";
const DEFAULT_WORKER_CONCURRENCY: usize = 3;

const APPROVAL_TOPIC: &str = "approval";
const COMM_STATUS_EVENT: &str = "comm_status";

// ---------------------------------------------------------------------------
// Workflows and steps
// ---------------------------------------------------------------------------

// Runs three durable steps in sequence, publishing a progress event (1, 2, 3)
// after each so the frontend can poll how far along it is.
#[durare::workflow("ExampleWorkflow")]
async fn example_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    step_one(&ctx).await?;
    ctx.set_event(STEPS_EVENT, 1i32).await?;
    step_two(&ctx).await?;
    ctx.set_event(STEPS_EVENT, 2i32).await?;
    step_three(&ctx).await?;
    ctx.set_event(STEPS_EVENT, 3i32).await?;
    Ok("Workflow completed".to_string())
}

#[durare::step]
async fn step_one(_ctx: &DurableContext) -> Result<String> {
    tokio::time::sleep(Duration::from_secs(5)).await;
    println!("Step one completed!");
    Ok("Step 1 completed".to_string())
}

#[durare::step]
async fn step_two(_ctx: &DurableContext) -> Result<String> {
    tokio::time::sleep(Duration::from_secs(5)).await;
    println!("Step two completed!");
    Ok("Step 2 completed".to_string())
}

#[durare::step]
async fn step_three(_ctx: &DurableContext) -> Result<String> {
    tokio::time::sleep(Duration::from_secs(5)).await;
    println!("Step three completed!");
    Ok("Step 3 completed".to_string())
}

// A workflow that runs on a cron schedule. The schedule is created, paused,
// resumed, and triggered at runtime via the managed-schedule API.
#[durare::workflow("ScheduledWorkflow")]
async fn scheduled_workflow(ctx: DurableContext, _tick: ScheduledInput) -> Result<()> {
    println!("Scheduled workflow starting.");
    ctx.sleep(Duration::from_secs(1)).await?;
    println!("Scheduled workflow ending.");
    Ok(())
}

// A workflow that runs on a queue with a per-process worker-concurrency limit.
#[durare::workflow("EnqueuedWorkflow")]
async fn enqueued_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    println!("Enqueued workflow starting.");
    ctx.sleep(Duration::from_secs(5)).await?;
    println!("Enqueued workflow ending.");
    Ok("Enqueued workflow completed".to_string())
}

#[durare::step]
async fn comm_step_one(_ctx: &DurableContext) -> Result<String> {
    tokio::time::sleep(Duration::from_secs(2)).await;
    println!("Communication workflow: step 1 complete.");
    Ok("Step 1 completed".to_string())
}

#[durare::step]
async fn comm_step_two(_ctx: &DurableContext) -> Result<String> {
    tokio::time::sleep(Duration::from_secs(2)).await;
    println!("Communication workflow: step 2 complete.");
    Ok("Step 2 completed".to_string())
}

// A human-in-the-loop workflow: run step one, then durably wait (up to 120s) for
// an approval message before deciding whether to run step two.
#[durare::workflow("CommunicationWorkflow")]
async fn communication_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    comm_step_one(&ctx).await?;
    ctx.set_event(COMM_STATUS_EVENT, "waiting").await?;

    match ctx
        .recv::<String>(APPROVAL_TOPIC, Duration::from_secs(120))
        .await?
        .as_deref()
    {
        Some("approve") => {
            ctx.set_event(COMM_STATUS_EVENT, "step2").await?;
            comm_step_two(&ctx).await?;
            ctx.set_event(COMM_STATUS_EVENT, "completed").await?;
            Ok("completed".to_string())
        }
        Some("deny") => {
            ctx.set_event(COMM_STATUS_EVENT, "denied").await?;
            println!("Communication workflow: denied.");
            Ok("denied".to_string())
        }
        _ => {
            ctx.set_event(COMM_STATUS_EVENT, "timeout").await?;
            println!("Communication workflow: timed out waiting for approval.");
            Ok("timeout".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Surface durare's logs (e.g. the conductor's "connected to DBOS
    // conductor" line). `RUST_LOG` overrides the default filter.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "durare=info".into()),
        )
        .init();

    let db_url = std::env::var("DBOS_SYSTEM_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set DBOS_SYSTEM_DATABASE_URL (or DATABASE_URL) to a Postgres URL");

    let provider = PostgresProvider::connect(&db_url).await?;
    // Opt in to recovery on launch (off by default in durare): `launch()` itself
    // resumes any workflow a previous run — e.g. the /crash endpoint — left
    // unfinished, replaying it from its last checkpoint so completed steps are
    // served from the log and never re-run. Recovery runs in the background, so
    // the server is serving again immediately after a restart. Sound here
    // because the starter is a single process: its executor id has one live
    // owner.
    let config = EngineConfig::default().recover_on_launch(true);
    let mut engine = DurableEngine::with_config(Arc::new(provider), config).await?;

    // Register the demo queue *before* launch. durare seals queue registration at
    // launch (see the note on the concurrency handler), so this is where worker
    // concurrency is set.
    engine.register_queue(
        WorkflowQueue::new(QUEUE_NAME).worker_concurrency(DEFAULT_WORKER_CONCURRENCY),
    );

    engine.launch().await?;

    let engine = Arc::new(engine);

    // The DBOS admin HTTP server (health, recovery, workflow management). Held
    // for the process lifetime; it runs on its own task.
    let _admin = durare::AdminServer::start(engine.clone(), 3001).await?;

    // The DBOS console link (https://console.dbos.dev): a websocket client the
    // console pushes management requests through. Opt-in — set
    // DBOS_CONDUCTOR_KEY to the Conductor API key for an app registered as
    // "dbos-rust-starter" (the name must match; it is part of the websocket
    // path). Held for the process lifetime, like the admin server; the
    // connection self-heals with backoff, so a bad key shows as repeating
    // "failed to connect to conductor" warnings rather than an exit.
    let _conductor = match std::env::var("DBOS_CONDUCTOR_KEY") {
        Ok(key) => Some(durare::Conductor::start(
            engine.clone(),
            durare::ConductorConfig {
                // Empty = the hosted DBOS conductor (durare ≥ 0.3.3 defaults
                // it, honoring DBOS_DOMAIN); set to override, e.g. a proxy.
                url: std::env::var("DBOS_CONDUCTOR_URL").unwrap_or_default(),
                api_key: key,
                app_name: "dbos-rust-starter".into(),
                executor_metadata: None,
                alert_handler: None,
            },
        )?),
        Err(_) => None,
    };

    let app = Router::new()
        .route("/", get(index))
        .route("/workflow/:taskid", get(workflow_handler))
        .route("/last_step/:taskid", get(last_step_handler))
        .route("/crash", post(crash_handler))
        .route("/schedule/status", get(schedule_status_handler))
        .route("/schedule/apply", post(schedule_apply_handler))
        .route("/schedule/pause", post(schedule_pause_handler))
        .route("/schedule/resume", post(schedule_resume_handler))
        .route("/schedule/trigger", post(schedule_trigger_handler))
        .route("/queue/status", get(queue_status_handler))
        .route("/queue/enqueue", post(queue_enqueue_handler))
        .route("/queue/concurrency", post(queue_concurrency_handler))
        .route("/comm/status/:workflowId", get(comm_status_handler))
        .route("/comm/start", post(comm_start_handler))
        .route("/comm/approve/:workflowId", post(comm_approve_handler))
        .route("/comm/deny/:workflowId", post(comm_deny_handler))
        .with_state(engine);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    println!("Server starting on http://localhost:8080");
    axum::serve(listener, app).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

async fn index() -> Html<&'static str> {
    Html(include_str!("../html/app.html"))
}

async fn workflow_handler(
    Path(task_id): Path<String>,
    State(engine): State<Arc<DurableEngine>>,
) -> Response {
    if task_id.is_empty() {
        return bad_request("Task ID is required");
    }
    // Fire-and-forget: start the workflow running in the background; the frontend
    // polls /last_step to watch its progress.
    match engine
        .start_with(
            ExampleWorkflow,
            String::new(),
            WorkflowOptions::with_id(task_id),
        )
        .await
    {
        Ok(_handle) => StatusCode::OK.into_response(),
        Err(e) => internal_error(e),
    }
}

async fn last_step_handler(
    Path(task_id): Path<String>,
    State(engine): State<Arc<DurableEngine>>,
) -> Response {
    if task_id.is_empty() {
        return bad_request("Task ID is required");
    }
    // Zero-timeout read: the event is unset until the workflow reaches its first
    // checkpoint, so report step 0 in that window (frontend shows "executing 1").
    let step = engine
        .get_event::<i32>(&task_id, STEPS_EVENT, Duration::ZERO)
        .await
        .ok()
        .flatten()
        .unwrap_or(0);
    step.to_string().into_response()
}

// Crashes the process. For demonstrating crash recovery only :)
async fn crash_handler() -> Response {
    std::process::exit(1);
}

async fn schedule_status_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    let mut cron = DEFAULT_CRON.to_string();
    let mut status = "UNKNOWN".to_string();
    if let Ok(Some(sched)) = engine.get_schedule(SCHEDULE_NAME).await {
        cron = sched.schedule;
        status = match sched.status {
            ScheduleStatus::Active => "ACTIVE",
            ScheduleStatus::Paused => "PAUSED",
        }
        .to_string();
    }
    let wfs = recent(&engine, SCHEDULED_WORKFLOW).await;
    Json(json!({
        "cron": cron,
        "schedule_status": status,
        "workflow_counts": count_by_status(&wfs),
    }))
    .into_response()
}

#[derive(Deserialize)]
struct ApplyBody {
    #[serde(default)]
    cron: String,
}

async fn schedule_apply_handler(
    State(engine): State<Arc<DurableEngine>>,
    body: Option<Json<ApplyBody>>,
) -> Response {
    let cron = body
        .map(|b| b.0.cron)
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| DEFAULT_CRON.to_string());

    match engine
        .apply_schedules(vec![ApplySchedule::new(
            SCHEDULE_NAME,
            SCHEDULED_WORKFLOW,
            cron,
        )])
        .await
    {
        Ok(()) => {
            // Explicitly resume so Apply always leaves the schedule active.
            let _ = engine.resume_schedule(SCHEDULE_NAME).await;
            ok()
        }
        Err(e) => internal_error(e),
    }
}

async fn schedule_pause_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    match engine.pause_schedule(SCHEDULE_NAME).await {
        Ok(_) => ok(),
        Err(e) => internal_error(e),
    }
}

async fn schedule_resume_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    match engine.resume_schedule(SCHEDULE_NAME).await {
        Ok(_) => ok(),
        Err(e) => internal_error(e),
    }
}

async fn schedule_trigger_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    match engine.trigger_schedule::<()>(SCHEDULE_NAME).await {
        Ok(_handle) => ok(),
        Err(e) => internal_error(e),
    }
}

async fn queue_status_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    let wfs = recent(&engine, ENQUEUED_WORKFLOW).await;
    Json(json!({
        "worker_concurrency": worker_concurrency(&engine),
        "workflow_counts": count_by_status(&wfs),
    }))
    .into_response()
}

async fn queue_enqueue_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    let id = uuid::Uuid::new_v4().to_string();
    match engine
        .start_with(
            EnqueuedWorkflow,
            String::new(),
            WorkflowOptions::with_id(id).queue(QUEUE_NAME),
        )
        .await
    {
        Ok(_) => ok(),
        Err(e) => internal_error(e),
    }
}

// durare seals queue registration at launch: `register_queue` takes `&mut self`
// and the engine is shared `&self` afterward, so worker concurrency cannot be
// retuned at runtime the way the Go starter's slider does. Report the value
// fixed at startup; changing it means restarting with a new `register_queue`.
async fn queue_concurrency_handler(
    State(engine): State<Arc<DurableEngine>>,
    _body: Option<Json<serde_json::Value>>,
) -> Response {
    Json(json!({
        "ok": true,
        "worker_concurrency": worker_concurrency(&engine),
        "note": "durare fixes queue worker-concurrency at launch; restart to change it",
    }))
    .into_response()
}

async fn comm_status_handler(
    Path(workflow_id): Path<String>,
    State(engine): State<Arc<DurableEngine>>,
) -> Response {
    let state = engine
        .get_event::<String>(&workflow_id, COMM_STATUS_EVENT, Duration::ZERO)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "step1".to_string());
    Json(json!({ "state": state })).into_response()
}

async fn comm_start_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    let wf_id = uuid::Uuid::new_v4().to_string();
    match engine
        .start_with(
            CommunicationWorkflow,
            String::new(),
            WorkflowOptions::with_id(wf_id.clone()),
        )
        .await
    {
        Ok(_) => Json(json!({ "workflow_id": wf_id })).into_response(),
        Err(e) => internal_error(e),
    }
}

async fn comm_approve_handler(
    Path(workflow_id): Path<String>,
    State(engine): State<Arc<DurableEngine>>,
) -> Response {
    match engine
        .send(&workflow_id, "approve".to_string(), APPROVAL_TOPIC)
        .await
    {
        Ok(()) => ok(),
        Err(e) => internal_error(e),
    }
}

async fn comm_deny_handler(
    Path(workflow_id): Path<String>,
    State(engine): State<Arc<DurableEngine>>,
) -> Response {
    match engine
        .send(&workflow_id, "deny".to_string(), APPROVAL_TOPIC)
        .await
    {
        Ok(()) => ok(),
        Err(e) => internal_error(e),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Workflows of the given name that started in the last 10 minutes (for the
// frontend's status summaries).
async fn recent(engine: &DurableEngine, name: &str) -> Vec<WorkflowStatus> {
    let filter = ListFilter {
        name: vec![name.to_string()],
        start_time_ms: Some(minutes_ago_ms(10)),
        limit: Some(500),
        ..Default::default()
    };
    engine.list_workflows(&filter).await.unwrap_or_default()
}

fn count_by_status(wfs: &[WorkflowStatus]) -> HashMap<String, usize> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for wf in wfs {
        *counts.entry(wf.status.clone()).or_insert(0) += 1;
    }
    counts
}

fn worker_concurrency(engine: &DurableEngine) -> usize {
    engine
        .list_registered_queues()
        .into_iter()
        .find(|q| q.name == QUEUE_NAME)
        .and_then(|q| q.worker_concurrency)
        .unwrap_or(DEFAULT_WORKER_CONCURRENCY)
}

fn minutes_ago_ms(mins: u64) -> i64 {
    (SystemTime::now() - Duration::from_secs(mins * 60))
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn ok() -> Response {
    Json(json!({ "ok": true })).into_response()
}

fn bad_request(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
}

fn internal_error(e: durare::Error) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": e.to_string() })),
    )
        .into_response()
}
