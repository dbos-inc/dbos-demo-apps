//! Widget Store on the `durare` durable-execution SDK — a port of the Go
//! `widget-store` demo. An online storefront whose checkout is a durable
//! workflow: create the order, reserve inventory, take payment via webhook,
//! then dispatch — and crash the app at any point to watch it resume from its
//! last completed step without double-charging or losing a widget.

mod handlers;
mod models;
mod store;
mod workflows;

use axum::{
    routing::{get, post},
    Router,
};
use durare::{DurableEngine, EngineConfig, PostgresProvider};
use std::sync::Arc;

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let db_url = std::env::var("DBOS_SYSTEM_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("set DBOS_SYSTEM_DATABASE_URL (or DATABASE_URL) to a Postgres URL");

    // Pool for the app's own tables (products/orders), set as a process global
    // read inside workflow steps. The schema bootstrap is idempotent.
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;
    store::bootstrap(&pool).await?;
    store::init_db(pool);

    // Opt in to recovery on launch (off by default in durare): after /crash_application,
    // a restart's launch() resumes the interrupted checkout/dispatch workflows from
    // their checkpoints, in the background. Sound here because the demo is a single
    // process — its executor id has one live owner.
    let provider = PostgresProvider::connect(&db_url).await?;
    let config = EngineConfig::default().recover_on_launch(true);
    let engine = DurableEngine::with_config(Arc::new(provider), config).await?;
    engine.launch().await?;
    let engine = Arc::new(engine);

    // The DBOS admin HTTP server (health, recovery, workflow management).
    let admin_port: u16 = std::env::var("ADMIN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let _admin = durare::AdminServer::start(engine.clone(), admin_port).await?;

    let app = Router::new()
        .route("/", get(handlers::index))
        .route("/product", get(handlers::get_product))
        .route("/orders", get(handlers::get_orders))
        .route("/order/:id", get(handlers::get_order))
        .route("/restock", post(handlers::restock))
        .route("/checkout/:idempotency_key", post(handlers::checkout))
        .route(
            "/payment_webhook/:payment_id/:payment_status",
            post(handlers::payment_webhook),
        )
        .route("/crash_application", post(handlers::crash_application))
        .with_state(engine);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Widget store starting on http://localhost:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
