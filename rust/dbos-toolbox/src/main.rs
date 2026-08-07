//! The durare toolbox — a port of the Go `dbos-toolbox` template app. Example
//! code for the core durable-execution features: workflows and steps, queues
//! with parallel tasks, and scheduled (cron) workflows, each behind an HTTP
//! endpoint. Use it as a template when starting a new durare app — start by
//! editing `main.rs`.

use axum::{
    extract::State,
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use durare::{
    DurableContext, DurableEngine, EngineConfig, PostgresProvider, Result, ScheduledInput,
    WorkflowOptions, WorkflowQueue,
};
use std::sync::Arc;
use std::time::Duration;

const QUEUE_NAME: &str = "example-queue";

// ---------------------------------------------------------------------------
// Workflows and steps
// ---------------------------------------------------------------------------

#[durare::workflow("ExampleWorkflow")]
async fn example_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    ctx.step("step_one", || async { step_one().await }).await?;
    ctx.step("step_two", || async { step_two().await }).await
}

async fn step_one() -> Result<String> {
    println!("Step one completed!");
    Ok("Step 1 completed".to_string())
}

async fn step_two() -> Result<String> {
    println!("Step two completed!");
    Ok("Step 2 completed - Workflow finished successfully".to_string())
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

#[durare::workflow("QueuedStepWorkflow")]
async fn queued_step_workflow(ctx: DurableContext, i: i32) -> Result<i32> {
    ctx.sleep(Duration::from_secs(5)).await?;
    println!("Step {i} completed!");
    Ok(i)
}

/// Enqueue ten tasks on the example queue, then wait for all of them — they
/// run in parallel, so the whole batch takes about as long as one task.
#[durare::workflow("QueueWorkflow")]
async fn queue_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    let mut handles = Vec::with_capacity(10);
    for i in 0..10 {
        let opts = WorkflowOptions {
            queue: Some(QUEUE_NAME.to_string()),
            ..Default::default()
        };
        let handle = ctx
            .start_workflow::<i32, i32>("QueuedStepWorkflow", i, opts)
            .await?;
        handles.push(handle);
    }
    let mut results = Vec::with_capacity(10);
    for handle in handles {
        results.push(handle.result().await?);
    }
    println!("Successfully completed {} steps", results.len());
    Ok(format!("Successfully completed {} steps", results.len()))
}

// ---------------------------------------------------------------------------
// Scheduled workflows
// ---------------------------------------------------------------------------

#[durare::workflow(name = "ScheduledWorkflow", schedule = "*/15 * * * * *")]
async fn scheduled_workflow(_ctx: DurableContext, input: ScheduledInput) -> Result<String> {
    // The wall clock is fine for log output; durable code would use ctx.now().
    println!(
        "I am a scheduled workflow scheduled at {} and running at {}",
        input.scheduled_time,
        chrono::Utc::now().to_rfc3339()
    );
    Ok(String::new())
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let db_url = std::env::var("DBOS_SYSTEM_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set DBOS_SYSTEM_DATABASE_URL (or DATABASE_URL) to a Postgres URL");

    // Opt in to recovery on launch (off by default in durare): a restart
    // resumes any workflow a previous run left unfinished. Sound here because
    // the toolbox is a single process.
    let provider = PostgresProvider::connect(&db_url).await?;
    let config = EngineConfig::default().recover_on_launch(true);
    let mut engine = DurableEngine::with_config(Arc::new(provider), config).await?;

    // Register the example queue before launch (queue configuration is sealed
    // at launch in durare).
    engine.register_queue(WorkflowQueue::new(QUEUE_NAME));

    engine.launch().await?;
    let engine = Arc::new(engine);

    // The DBOS admin HTTP server (health, recovery, workflow management).
    let admin_port: u16 = std::env::var("ADMIN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let _admin = durare::AdminServer::start(engine.clone(), admin_port).await?;

    let app = Router::new()
        .route("/", get(homepage))
        .route("/workflow", get(workflow_handler))
        .route("/queue", get(queue_handler))
        .with_state(engine);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Server starting on http://localhost:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

async fn workflow_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    run_and_report(&engine, "ExampleWorkflow").await
}

async fn queue_handler(State(engine): State<Arc<DurableEngine>>) -> Response {
    run_and_report(&engine, "QueueWorkflow").await
}

/// Start the named workflow, wait for its result, and report it as text —
/// the toolbox pattern: every endpoint launches a workflow.
async fn run_and_report(engine: &DurableEngine, name: &str) -> Response {
    let handle = match engine
        .start::<String, String>(name, String::new(), WorkflowOptions::default())
        .await
    {
        Ok(h) => h,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("Error: {e}"),
            )
                .into_response()
        }
    };
    match handle.result().await {
        Ok(res) => format!("Workflow result: {res}").into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error: {e}"),
        )
            .into_response(),
    }
}

async fn homepage() -> Html<&'static str> {
    Html(HOMEPAGE)
}

const HOMEPAGE: &str = r#"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="https://dbos-blog-posts.s3.us-west-1.amazonaws.com/live-demo/favicon.ico" type="image/x-icon">
    <script src="https://cdn.tailwindcss.com"></script>
    <title>durare Toolbox</title>
</head>
<body class="bg-gray-100 min-h-screen font-sans">
    <div class="max-w-2xl mx-auto py-12 px-4">
        <div class="bg-white rounded-lg shadow-lg p-8 space-y-8">
            <h1 class="text-3xl font-bold text-gray-900">Welcome to the durare Toolbox!</h1>

            <p class="text-gray-600">
                This app contains example code for many durable-execution features. You can use it as a template when starting a new durare app&mdash;start by editing <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">main.rs</code>.
            </p>

            <p class="text-gray-600">
                Each endpoint launches a new workflow&mdash;<strong>view the app logs to see them run.</strong>
            </p>

            <div class="space-y-4">
                <div class="text-gray-600">
                    Workflows: <button onclick="fetch('/workflow').then(r=>r.text()).then(t=>alert(t))" class="text-blue-600 hover:text-blue-800 font-medium">/workflow</button>
                </div>
                <div class="text-gray-600">
                    Queues: <button onclick="fetch('/queue').then(r=>r.text()).then(t=>alert(t))" class="text-blue-600 hover:text-blue-800 font-medium">/queue</button>
                </div>
            </div>

            <div class="space-y-6">
                <p class="text-gray-800 font-medium">To get started developing locally:</p>
                <ul class="space-y-4">
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">1</span>
                        </span>
                        <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">cargo add durare</code>
                    </li>
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">2</span>
                        </span>
                        <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">git clone https://github.com/SamuelXing/dbos-demo-apps</code>
                    </li>
                    <li class="flex items-start">
                        <span class="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                            <span class="text-blue-600 text-sm font-medium">3</span>
                        </span>
                        <span>Edit <code class="bg-gray-100 px-3 py-1 rounded font-mono text-sm">main.rs</code> to start building!</span>
                    </li>
                </ul>
            </div>

            <p class="text-gray-600">
                Check out the
                <a href="https://docs.rs/durare" target="_blank" class="text-blue-600 hover:text-blue-800 hover:underline">
                    durare documentation
                </a>
                to learn how to build with durable execution!
            </p>
        </div>
    </div>
</body>
</html>
"#;
