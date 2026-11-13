//! Advanced queue patterns: fair queueing, rate limits and debouncing.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use dbos::sysdb::types::{Timestamp, WorkflowFilter, WorkflowRecord, WorkflowStatus};
use dbos::{
    Config, DBOS, Debouncer, QueueConflict, QueueOptions, QueueRequest, RateLimit, StartOptions,
    WorkflowRef,
};
use rand::seq::IndexedRandom;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tower_http::services::{ServeDir, ServeFile};

const CONCURRENCY_QUEUE: &str = "concurrency-queue";
const PARTITIONED_QUEUE: &str = "partitioned-queue";
const RATE_LIMITED_QUEUE: &str = "rate-limited-queue";
const DEBOUNCER_QUEUE: &str = "debouncer-queue";

// The frontend asks for workflows by these names.
const FAIR_QUEUE_WORKFLOW: &str = "fair_queue_workflow";
const FAIR_QUEUE_MANAGER: &str = "fair_queue_concurrency_manager";
const RATE_LIMITED_WORKFLOW: &str = "rate_limited_queue_workflow";
const DEBOUNCER_WORKFLOW: &str = "debouncer_workflow";

/// Used when `DBOS_SYSTEM_DATABASE_URL` is not set. The database is created if it does not exist.
const DEFAULT_DATABASE_URL: &str =
    "postgres://postgres:dbos@localhost:5432/dbos_queue_patterns_dbos_sys";

/// The tenants the randomized batch draws from.
const MIX_TENANTS: [&str; 4] = ["alice", "bob", "clark", "dave"];
const MIX_TOTAL: usize = 50;

const THIRTY_MINUTES_MS: i64 = 30 * 60 * 1000;

#[derive(Clone)]
struct App {
    dbos: DBOS,
    fair_queue_manager: WorkflowRef<(), ()>,
    rate_limited: WorkflowRef<(), ()>,
    debouncer: Arc<Debouncer<'static, DebouncerInput, ()>>,
}

/*****************************/
/**** Fair Queueing **********/
/*****************************/

// The fair queue example uses two queues. PARTITIONED_QUEUE is split by tenant and limits how many
// tasks each tenant runs at once. CONCURRENCY_QUEUE limits how many tasks each worker runs at once.
// A task goes through the first and then the second, so it is held to the limits of both.

/// The task itself, which simply sleeps for 5 seconds.
async fn fair_queue_workflow(_: ()) -> dbos::Result<()> {
    dbos::sleep(Duration::from_secs(5)).await?;
    Ok(())
}

/// Holds a slot on PARTITIONED_QUEUE while the task runs on CONCURRENCY_QUEUE.
async fn fair_queue_manager(task: WorkflowRef<(), ()>) -> dbos::Result<()> {
    let options = StartOptions {
        queue: Some(QueueRequest::new(CONCURRENCY_QUEUE)),
        ..StartOptions::default()
    };
    task.start_with((), options).await?.result().await
}

async fn enqueue_for_tenant(app: &App, tenant_id: &str) -> dbos::Result<()> {
    let options = StartOptions {
        queue: Some(QueueRequest {
            partition_key: Some(tenant_id),
            ..QueueRequest::new(PARTITIONED_QUEUE)
        }),
        ..StartOptions::default()
    };
    app.fair_queue_manager.start_with((), options).await?;
    Ok(())
}

#[derive(Deserialize)]
struct TenantQuery {
    tenant_id: String,
}

async fn fair_queue(
    State(app): State<App>,
    Query(query): Query<TenantQuery>,
) -> Result<Json<()>, AppError> {
    enqueue_for_tenant(&app, &query.tenant_id).await?;
    Ok(Json(()))
}

/// Enqueues a batch skewed toward one tenant, one at a time so they arrive in randomized order.
async fn fair_queue_random_mix(State(app): State<App>) -> Result<Json<Value>, AppError> {
    let (favored, picks) = {
        // Not held across an await: the generator isn't `Send`.
        let mut rng = rand::rng();
        let favored = *MIX_TENANTS.choose(&mut rng).expect("not empty");
        // The favored tenant appears twice, so it is twice as likely to be picked.
        let mut weighted = MIX_TENANTS.to_vec();
        weighted.push(favored);
        let picks: Vec<&str> = (0..MIX_TOTAL)
            .map(|_| *weighted.choose(&mut rng).expect("not empty"))
            .collect();
        (favored, picks)
    };
    for tenant in picks {
        enqueue_for_tenant(&app, tenant).await?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    Ok(Json(json!({ "total": MIX_TOTAL, "favored": favored })))
}

/*****************************/
/**** Rate Limiting **********/
/*****************************/

/// No more than two of these start per 10 seconds, which RATE_LIMITED_QUEUE enforces.
async fn rate_limited_workflow(_: ()) -> dbos::Result<()> {
    dbos::sleep(Duration::from_secs(5)).await?;
    Ok(())
}

async fn rate_limited_queue(State(app): State<App>) -> Result<Json<()>, AppError> {
    let options = StartOptions {
        queue: Some(QueueRequest::new(RATE_LIMITED_QUEUE)),
        ..StartOptions::default()
    };
    app.rate_limited.start_with((), options).await?;
    Ok(Json(()))
}

/*****************************/
/**** Debouncing *************/
/*****************************/

#[derive(Clone, Serialize, Deserialize)]
struct DebouncerInput {
    tenant_id: String,
    input: String,
}

async fn debouncer_workflow(input: DebouncerInput) -> dbos::Result<()> {
    println!(
        "Executing debounced workflow for tenant {} with input {}",
        input.tenant_id, input.input
    );
    dbos::sleep(Duration::from_secs(5)).await?;
    Ok(())
}

#[derive(Deserialize)]
struct DebouncerQuery {
    tenant_id: String,
    input: String,
}

/// Each new input for a tenant restarts the wait: the workflow runs 10 seconds after input stops
/// being submitted for that tenant, with the last input submitted.
async fn debouncer(
    State(app): State<App>,
    Query(query): Query<DebouncerQuery>,
) -> Result<Json<()>, AppError> {
    let input = DebouncerInput {
        tenant_id: query.tenant_id.clone(),
        input: query.input,
    };
    app.debouncer
        .debounce(&query.tenant_id, Duration::from_secs(10), input)
        .await?;
    Ok(Json(()))
}

/*****************************/
/**** Observability **********/
/*****************************/

fn thirty_minutes_ago() -> Timestamp {
    Timestamp::from_epoch_ms(Timestamp::now().as_epoch_ms() - THIRTY_MINUTES_MS)
}

/// A listed row's input, which it holds as the text it was stored as.
fn debouncer_input(row: &WorkflowRecord) -> Option<DebouncerInput> {
    serde_json::from_str(row.input.as_deref()?).ok()
}

#[derive(Deserialize)]
struct ListQuery {
    workflow_name: String,
}

async fn list_workflows(
    State(app): State<App>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<Value>>, AppError> {
    let rows = app
        .dbos
        .list_workflows(&WorkflowFilter {
            names: vec![&query.workflow_name],
            sort_desc: true,
            load_output: false,
            ..Default::default()
        })
        .await?;
    let debounced = query.workflow_name == DEBOUNCER_WORKFLOW;
    let statuses = rows
        .iter()
        .map(|row| {
            let input = debounced.then(|| debouncer_input(row)).flatten();
            let tenant_id = input
                .as_ref()
                .map(|input| input.tenant_id.clone())
                .or_else(|| row.queue_partition_key.clone());
            json!({
                "workflow_id": row.workflow_id,
                "workflow_status": row.status.as_str(),
                "workflow_name": row.name,
                "start_time": row.created_at.as_epoch_ms(),
                "tenant_id": tenant_id,
                "input": input.map(|input| input.input),
            })
        })
        .collect();
    Ok(Json(statuses))
}

/// Rows per tenant, with tenants in the order they first appear.
fn counts_by_tenant(rows: &[WorkflowRecord]) -> Vec<Value> {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    for row in rows {
        let tenant = row.queue_partition_key.as_deref().unwrap_or("unknown");
        match counts.iter_mut().find(|(seen, _)| *seen == tenant) {
            Some((_, count)) => *count += 1,
            None => counts.push((tenant, 1)),
        }
    }
    counts
        .into_iter()
        .map(|(tenant_id, count)| json!({ "tenant_id": tenant_id, "count": count }))
        .collect()
}

async fn fair_queue_pipeline(State(app): State<App>) -> Result<Json<Value>, AppError> {
    // The managers run on the partitioned queue, so they carry the tenant as their partition key.
    let waiting_managers = app
        .dbos
        .list_workflows(&WorkflowFilter {
            names: vec![FAIR_QUEUE_MANAGER],
            status: vec![WorkflowStatus::Enqueued, WorkflowStatus::Pending],
            load_input: false,
            load_output: false,
            ..Default::default()
        })
        .await?;
    let finished_managers = app
        .dbos
        .list_workflows(&WorkflowFilter {
            names: vec![FAIR_QUEUE_MANAGER],
            status: vec![WorkflowStatus::Success],
            created_after: Some(thirty_minutes_ago()),
            load_input: false,
            load_output: false,
            ..Default::default()
        })
        .await?;
    // The work runs on the concurrency queue with no partition key of its own, so it takes its
    // tenant from the manager that enqueued it.
    let running_work = app
        .dbos
        .list_workflows(&WorkflowFilter {
            names: vec![FAIR_QUEUE_WORKFLOW],
            status: vec![WorkflowStatus::Pending],
            load_input: false,
            load_output: false,
            ..Default::default()
        })
        .await?;
    let tenants: HashMap<&str, &str> = waiting_managers
        .iter()
        .filter_map(|manager| {
            let tenant = manager.queue_partition_key.as_deref()?;
            Some((manager.workflow_id.as_str(), tenant))
        })
        .collect();
    let pending_concurrency: Vec<Value> = running_work
        .iter()
        .map(|work| {
            let tenant = work
                .parent_workflow_id
                .as_deref()
                .and_then(|parent| tenants.get(parent).copied())
                .unwrap_or("unknown");
            json!({ "workflow_id": work.workflow_id, "tenant_id": tenant })
        })
        .collect();
    Ok(Json(json!({
        "enqueued": counts_by_tenant(&waiting_managers),
        "pending_concurrency": pending_concurrency,
        "success": counts_by_tenant(&finished_managers),
    })))
}

/// A debounced workflow is DELAYED while its window is open, ENQUEUED when it fires, PENDING while
/// it runs, then SUCCESS. Debouncing on the tenant means at most one is DELAYED per tenant.
async fn debouncer_pipeline(State(app): State<App>) -> Result<Json<Value>, AppError> {
    let list = |status: WorkflowStatus, created_after: Option<Timestamp>| {
        let dbos = app.dbos.clone();
        async move {
            let rows = dbos
                .list_workflows(&WorkflowFilter {
                    names: vec![DEBOUNCER_WORKFLOW],
                    status: vec![status],
                    created_after,
                    sort_desc: true,
                    load_output: false,
                    ..Default::default()
                })
                .await?;
            Ok::<_, dbos::Error>(rows.iter().map(debouncer_item).collect::<Vec<_>>())
        }
    };
    Ok(Json(json!({
        "delayed": list(WorkflowStatus::Delayed, None).await?,
        "pending": list(WorkflowStatus::Pending, None).await?,
        "completed": list(WorkflowStatus::Success, Some(thirty_minutes_ago())).await?,
    })))
}

fn debouncer_item(row: &WorkflowRecord) -> Value {
    let input = debouncer_input(row);
    json!({
        "workflow_id": row.workflow_id,
        "tenant_id": input.as_ref().map_or("unknown", |input| input.tenant_id.as_str()),
        "input": input.as_ref().map_or("", |input| input.input.as_str()),
        "start_time": row.created_at.as_epoch_ms(),
        // When the debounce window closes, and null once the workflow has left DELAYED.
        "delay_until": row.delay_until.map(Timestamp::as_epoch_ms),
        // When it actually started running, which is what the completed list sorts by.
        "ran_at": row.started_at.unwrap_or(row.created_at).as_epoch_ms(),
    })
}

/*****************************/
/**** Main Function **********/
/*****************************/

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let (dbos, router) = build(config()).await?;

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await?;
    println!("Server starting on http://localhost:8000");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
        })
        .await?;

    dbos.shutdown().await;
    Ok(())
}

/// The configuration this app runs with: the environment's, with a local default database.
fn config() -> Config {
    let mut config = Config::from_env("dbos-rust-queue-patterns");
    if config.database_url.is_empty() {
        config.database_url = DEFAULT_DATABASE_URL.to_owned();
    }
    config.app_version = Some(env!("CARGO_PKG_VERSION").to_owned());
    config
}

/// Registers the workflows, launches DBOS and registers the queues, then builds the routes.
///
/// Everything `main` does short of listening on a port, so the tests can run the same app
/// in-process against a database of their own.
async fn build(config: Config) -> Result<(DBOS, Router), Box<dyn std::error::Error>> {
    let dbos = DBOS::new(config);

    let task = dbos.register_workflow(FAIR_QUEUE_WORKFLOW, fair_queue_workflow)?;
    let manager = dbos.register_workflow(FAIR_QUEUE_MANAGER, move |_: ()| {
        fair_queue_manager(task.clone())
    })?;
    let rate_limited = dbos.register_workflow(RATE_LIMITED_WORKFLOW, rate_limited_workflow)?;
    let debounced = dbos.register_workflow(DEBOUNCER_WORKFLOW, debouncer_workflow)?;

    dbos.launch().await?;

    // Queues are registered after launch.
    let on_conflict = QueueConflict::UpdateIfLatestVersion;
    dbos.register_queue(
        CONCURRENCY_QUEUE,
        QueueOptions {
            worker_concurrency: Some(4),
            ..QueueOptions::default()
        },
        on_conflict,
    )
    .await?;
    dbos.register_queue(
        PARTITIONED_QUEUE,
        QueueOptions {
            partition_concurrency: Some(2),
            ..QueueOptions::default()
        },
        on_conflict,
    )
    .await?;
    dbos.register_queue(
        RATE_LIMITED_QUEUE,
        QueueOptions {
            rate_limit: Some(RateLimit {
                limit: 2,
                period: Duration::from_secs(10),
            }),
            ..QueueOptions::default()
        },
        on_conflict,
    )
    .await?;
    dbos.register_queue(DEBOUNCER_QUEUE, QueueOptions::default(), on_conflict)
        .await?;

    let app = App {
        dbos: dbos.clone(),
        fair_queue_manager: manager,
        rate_limited,
        debouncer: Arc::new(Debouncer {
            queue: Some(DEBOUNCER_QUEUE),
            ..Debouncer::new(&debounced)
        }),
    };

    let router = Router::new()
        .route("/api/workflows/fair_queue", post(fair_queue))
        .route(
            "/api/workflows/fair_queue/random_mix",
            post(fair_queue_random_mix),
        )
        .route(
            "/api/workflows/rate_limited_queue",
            post(rate_limited_queue),
        )
        .route("/api/workflows/debouncer", post(debouncer))
        .route("/api/workflows", get(list_workflows))
        .route("/api/fair_queue/pipeline", get(fair_queue_pipeline))
        .route("/api/debouncer/pipeline", get(debouncer_pipeline))
        // The built frontend.
        .nest_service("/assets", ServeDir::new("frontend/dist/assets"))
        .route_service("/", ServeFile::new("frontend/dist/index.html"))
        .with_state(app);
    Ok((dbos, router))
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
        let body = json!({ "error": self.0.to_string() });
        (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests;
