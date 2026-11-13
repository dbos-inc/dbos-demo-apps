//! The widget store: an online storefront that survives being killed mid-checkout.
//!
//! Buy a widget and watch the order go out. Then press the crash button — at any point, including
//! halfway through a dispatch — and start the app again. The order resumes from the last step that
//! finished, and nothing here does anything to make that happen: `launch()` recovers what the
//! previous run abandoned, and a step that finished replays from its checkpoint rather than
//! running a second time.
//!
//! A step *interrupted* mid-write is the exception, and `store.rs` is where it is spelled out: its
//! checkpoint and its row are two separate commits while Rust has no transactional step, so those
//! writes are at-least-once and a badly timed crash can miscount the inventory.
//!
//! The Rust port of the widget store that already exists in Python, TypeScript, Go and Java. Same
//! application schema, same HTTP surface, same frontend, so the five can be read against each
//! other — see `src/workflows.rs`, which is the part worth reading.

mod store;
mod workflows;

use std::time::Duration;

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use dbos::{Config, DBOS, StartOptions, WorkflowRef};

use store::{Order, Product, Store, StoreError};
use workflows::{ORDER_ID, PAYMENT_ID, PAYMENT_STATUS, PAYMENT_TIMEOUT};

/// Used when `DBOS_SYSTEM_DATABASE_URL` is not set. The database is created if it does not exist.
///
/// Deliberately no username or password: the driver fills in whatever the URL leaves out from the
/// standard libpq variables, such as PGUSER and PGPASSWORD.
const DEFAULT_DATABASE_URL: &str = "postgres://localhost:5432/dbos_rust_widget_store";

/// The version this build of the application runs as.
///
/// Recovery only resumes workflows stamped with the running executor's own version, so the crate's
/// version is the natural answer: it changes when a release says the code changed, not when the
/// compiler happens to emit different bytes.
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// How long the storefront waits for a checkout to publish the id to pay against.
///
/// The same deadline the workflow gives the payment, because both ends are waiting on the same
/// exchange and a storefront that gave up first would report a failure the workflow had not had.
const EVENT_TIMEOUT: Duration = PAYMENT_TIMEOUT;

#[derive(Clone)]
struct App {
    dbos: DBOS,
    store: Store,
    checkout: WorkflowRef<(), (), StoreError>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let (dbos, router) = build(config()).await?;

    // Loopback, not 0.0.0.0: this app ships a button that exits the process, which is a fine thing
    // to hand yourself and a poor thing to hand your network.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    println!("Server starting on http://localhost:8080");
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
            println!("Shutting down");
        })
        .await?;

    dbos.shutdown().await;
    Ok(())
}

/// The configuration this app runs with: the environment's, with a local default database.
fn config() -> Config {
    let mut config = Config::from_env("dbos-rust-widget-store");
    if config.database_url.is_empty() {
        config.database_url = DEFAULT_DATABASE_URL.to_owned();
    }
    config.app_version = Some(APP_VERSION.to_owned());
    config
}

/// Registers the workflows, launches DBOS and creates the store's tables, then builds the routes.
///
/// Everything `main` does short of listening on a port, so the tests can run the same app
/// in-process against a database of their own.
async fn build(config: Config) -> Result<(DBOS, Router), Box<dyn std::error::Error>> {
    let database_url = config.database_url.clone();
    let dbos = DBOS::new(config);

    // The store is built but not connected: a lazy pool, so it can exist before `launch()` creates
    // the database. It is captured rather than passed, because a Rust workflow takes its input and
    // nothing else — there is no context argument to hang a pool off.
    let store = Store::lazy(&database_url)?;

    // Registered before launch, because recovery starts inside it: a workflow the registry does not
    // know by name is one the recovering executor cannot resume.
    let dispatch = {
        let store = store.clone();
        dbos.register_workflow("DispatchOrderWorkflow", move |order_id: i32| {
            let store = store.clone();
            async move { workflows::dispatch_order(store, order_id).await }
        })?
    };
    let checkout = {
        let store = store.clone();
        let dispatch = dispatch.clone();
        dbos.register_workflow("CheckoutWorkflow", move |_: ()| {
            let store = store.clone();
            let dispatch = dispatch.clone();
            async move { workflows::checkout(store, dispatch).await }
        })?
    };

    // Migrates, connects — and recovers whatever the previous run abandoned, which is the entire
    // crash-and-resume demonstration.
    dbos.launch().await?;

    // The pool's first query, and so its first connection: the database exists by now.
    store.create_schema().await?;

    let app = App {
        dbos: dbos.clone(),
        store,
        checkout,
    };
    let router = Router::new()
        .route("/", get(index))
        .route("/product", get(get_product))
        .route("/orders", get(get_orders))
        .route("/order/{id}", get(get_order))
        .route("/restock", post(restock))
        .route("/checkout/{idempotency_key}", post(checkout_endpoint))
        .route(
            "/payment_webhook/{payment_id}/{payment_status}",
            post(payment_endpoint),
        )
        .route("/crash_application", post(crash_application))
        .with_state(app);
    Ok((dbos, router))
}

/// Serves the HTML frontend, embedded in the binary.
async fn index() -> Html<&'static str> {
    Html(include_str!("../html/app.html"))
}

async fn get_product(State(app): State<App>) -> Result<Json<Product>, AppError> {
    Ok(Json(app.store.product().await?))
}

async fn get_orders(State(app): State<App>) -> Result<Json<Vec<Order>>, AppError> {
    Ok(Json(app.store.orders().await?))
}

async fn get_order(
    State(app): State<App>,
    Path(order_id): Path<i32>,
) -> Result<Json<Order>, AppError> {
    app.store
        .order(order_id)
        .await?
        .map(Json)
        .ok_or(AppError::NotFound)
}

async fn restock(State(app): State<App>) -> Result<(), AppError> {
    Ok(app.store.restock().await?)
}

/// Starts a checkout and answers with the id to pay against.
///
/// **The idempotency key is the workflow id**, which is what makes a double-clicked Buy button
/// harmless: the second POST joins the checkout already running instead of starting another, and
/// gets the same answer from the same event.
///
/// The handle is dropped rather than awaited. The checkout goes on to wait a minute for a payment,
/// and no HTTP request should be held open for that — what this waits for is the one event it
/// needs, which the workflow publishes as soon as it has reserved the widget.
async fn checkout_endpoint(
    State(app): State<App>,
    Path(idempotency_key): Path<String>,
) -> Result<String, AppError> {
    app.checkout
        .start_with(
            (),
            StartOptions {
                workflow_id: Some(&idempotency_key),
                ..Default::default()
            },
        )
        .await?;

    let payment_id: Option<String> = app
        .dbos
        .get_event(&idempotency_key, PAYMENT_ID, EVENT_TIMEOUT)
        .await?;
    // An empty id is the workflow saying it could not reserve a widget; `None` is it never having
    // answered at all. Both are a failed checkout as far as the storefront is concerned.
    match payment_id {
        Some(id) if !id.is_empty() => Ok(id),
        _ => Err(AppError::CheckoutFailed),
    }
}

/// The payment provider's callback: tells the waiting checkout whether the card was charged.
///
/// The checkout is not running when this arrives — it is parked at its `recv` with nothing of it in
/// memory — and it is the row this writes that wakes it. Which is why the same call would work from
/// another process.
async fn payment_endpoint(
    State(app): State<App>,
    Path((payment_id, payment_status)): Path<(String, String)>,
) -> Result<String, AppError> {
    app.dbos
        .send_with(
            dbos::SendMessage {
                topic: Some(PAYMENT_STATUS),
                ..dbos::SendMessage::new(&payment_id, &payment_status)
            },
            dbos::SendOptions::default(),
        )
        .await?;

    // Then wait for the checkout to settle the order, so the storefront can show which one it was.
    let order_id: Option<String> = app
        .dbos
        .get_event(&payment_id, ORDER_ID, EVENT_TIMEOUT)
        .await?;
    match order_id {
        Some(id) if !id.is_empty() => Ok(id),
        _ => Err(AppError::CheckoutFailed),
    }
}

/// Crashes the application. For demonstration purposes only :)
///
/// The pause is so the response reaches the browser that asked for it; the exit is deliberately
/// the rudest one available, because a graceful shutdown would prove nothing.
async fn crash_application() -> &'static str {
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        println!("Simulating application crash");
        std::process::exit(1);
    });
    "Crashing application..."
}

/// What a handler failed with, as a status code.
enum AppError {
    NotFound,
    CheckoutFailed,
    /// Anything the engine or the database reported.
    Internal(String),
}

impl From<dbos::Error<StoreError>> for AppError {
    fn from(error: dbos::Error<StoreError>) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<dbos::Error> for AppError {
    fn from(error: dbos::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<StoreError> for AppError {
    fn from(error: StoreError) -> Self {
        Self::Internal(error.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "Order not found".to_owned()),
            Self::CheckoutFailed => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Checkout failed".to_owned(),
            ),
            Self::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        }
        .into_response()
    }
}

#[cfg(test)]
mod tests;
