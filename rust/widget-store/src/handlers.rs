//! HTTP handlers mirroring the Go widget-store's endpoints.

use crate::store;
use crate::workflows::{ORDER_ID, PAYMENT_ID, PAYMENT_STATUS};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    Json,
};
use durare::{DurableEngine, WorkflowOptions};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

const EVENT_TIMEOUT: Duration = Duration::from_secs(60);

fn error_json(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "error": msg }))).into_response()
}

pub async fn index() -> Html<&'static str> {
    Html(include_str!("../html/app.html"))
}

pub async fn get_product() -> Response {
    match store::get_product().await {
        Ok(p) => Json(p).into_response(),
        Err(e) => {
            eprintln!("product query failed: {e}");
            error_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch product")
        }
    }
}

pub async fn get_orders() -> Response {
    match store::get_orders().await {
        Ok(orders) => Json(orders).into_response(),
        Err(e) => {
            eprintln!("orders query failed: {e}");
            error_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch orders")
        }
    }
}

pub async fn get_order(Path(id): Path<String>) -> Response {
    let Ok(id) = id.parse::<i32>() else {
        return error_json(StatusCode::BAD_REQUEST, "Invalid order ID");
    };
    match store::get_order(id).await {
        Ok(Some(order)) => Json(order).into_response(),
        Ok(None) => error_json(StatusCode::NOT_FOUND, "Order not found"),
        Err(e) => {
            eprintln!("order query failed: {e}");
            error_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch order")
        }
    }
}

pub async fn restock() -> Response {
    match store::restock().await {
        Ok(()) => Json(json!({ "message": "Restocked successfully" })).into_response(),
        Err(e) => {
            eprintln!("restock failed: {e}");
            error_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to restock inventory",
            )
        }
    }
}

/// Start (or, on retry, attach to) the checkout workflow under the caller's
/// idempotency key, then wait for it to publish the payment id.
pub async fn checkout(
    State(engine): State<Arc<DurableEngine>>,
    Path(idempotency_key): Path<String>,
) -> Response {
    let started = engine
        .start::<String, String>(
            "checkoutWorkflow",
            String::new(),
            WorkflowOptions::with_id(&idempotency_key),
        )
        .await;
    if let Err(e) = started {
        eprintln!("checkout start failed for {idempotency_key}: {e}");
        return error_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Checkout failed to start",
        );
    }

    match engine
        .get_event::<String>(&idempotency_key, PAYMENT_ID, EVENT_TIMEOUT)
        .await
    {
        Ok(Some(payment_id)) if !payment_id.is_empty() => payment_id.into_response(),
        _ => {
            eprintln!("payment id retrieval failed for {idempotency_key}");
            error_json(StatusCode::INTERNAL_SERVER_ERROR, "Checkout failed")
        }
    }
}

/// The payment processor's webhook: deliver the status to the waiting checkout
/// workflow, then wait for it to publish the order id.
pub async fn payment_webhook(
    State(engine): State<Arc<DurableEngine>>,
    Path((payment_id, payment_status)): Path<(String, String)>,
) -> Response {
    if let Err(e) = engine
        .send(&payment_id, payment_status, PAYMENT_STATUS)
        .await
    {
        eprintln!("payment notification failed for {payment_id}: {e}");
        return error_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to process payment",
        );
    }

    match engine
        .get_event::<String>(&payment_id, ORDER_ID, EVENT_TIMEOUT)
        .await
    {
        Ok(Some(order_id)) if !order_id.is_empty() => order_id.into_response(),
        _ => {
            eprintln!("order id retrieval failed for {payment_id}");
            error_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Payment failed to process",
            )
        }
    }
}

/// Crash the process — the point of the demo: watch the checkout and dispatch
/// workflows resume exactly where they stopped.
pub async fn crash_application() -> Response {
    tokio::spawn(async {
        // Give the response time to flush.
        tokio::time::sleep(Duration::from_millis(100)).await;
        std::process::exit(1);
    });
    Json(json!({ "message": "Crashing application..." })).into_response()
}
