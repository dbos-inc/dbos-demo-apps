//! The widget store, run in-process against a real Postgres.
//!
//! Each test builds the whole app with [`build`] and drives its routes directly, without a port.
//! There is nothing to mock: the checkout calls `dbos::step` and friends as free functions, so a
//! test runs it for real and checks the orders and inventory it left behind.
//!
//! Each test gets a database of its own, named after the database the app would use, so tests
//! running at once neither share a shelf of widgets nor recover each other's checkouts. The
//! database is created if it does not exist and kept afterwards; each test restocks before it
//! buys, and idempotency keys are unique per run, so a rerun starts clean.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::Request;
use dbos::DBOS;
use serde_json::Value;
use tower::ServiceExt;

use super::{build, config};
use crate::store::{CANCELLED, DISPATCHED};

#[tokio::test(flavor = "multi_thread")]
async fn a_paid_checkout_is_dispatched() {
    let (dbos, router) = test_app("paid").await;
    post(&router, "/restock").await;
    let stocked = inventory(&router).await;

    let key = unique("paid");
    // The checkout pays against its own id, which is the idempotency key it was started under.
    let payment_id = post(&router, &format!("/checkout/{key}")).await;
    assert_eq!(payment_id, key);
    assert_eq!(inventory(&router).await, stocked - 1);

    let order_id = post(&router, &format!("/payment_webhook/{payment_id}/paid")).await;

    // Ten one-second ticks of the dispatch child workflow, then the order is out.
    eventually("the order to be dispatched", async || {
        let order = parse(&get(&router, &format!("/order/{order_id}")).await);
        (order["order_status"] == DISPATCHED).then_some(order)
    })
    .await;
    let order = parse(&get(&router, &format!("/order/{order_id}")).await);
    assert_eq!(order["progress_remaining"], 0);
    assert_eq!(inventory(&router).await, stocked - 1);

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn a_refused_payment_puts_the_widget_back() {
    let (dbos, router) = test_app("refused").await;
    post(&router, "/restock").await;
    let stocked = inventory(&router).await;

    let key = unique("refused");
    let payment_id = post(&router, &format!("/checkout/{key}")).await;
    assert_eq!(inventory(&router).await, stocked - 1);

    let order_id = post(&router, &format!("/payment_webhook/{payment_id}/failed")).await;

    let order = parse(&get(&router, &format!("/order/{order_id}")).await);
    assert_eq!(order["order_status"], CANCELLED);
    assert_eq!(inventory(&router).await, stocked);

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn a_double_clicked_checkout_reserves_one_widget() {
    let (dbos, router) = test_app("double_click").await;
    post(&router, "/restock").await;
    let stocked = inventory(&router).await;

    // The second request joins the checkout the first started, rather than starting another.
    let key = unique("double-click");
    let first = post(&router, &format!("/checkout/{key}")).await;
    let second = post(&router, &format!("/checkout/{key}")).await;
    assert_eq!(first, second);
    assert_eq!(inventory(&router).await, stocked - 1);

    post(&router, &format!("/payment_webhook/{first}/failed")).await;
    assert_eq!(inventory(&router).await, stocked);

    dbos.shutdown().await;
}

// ============================================================
// HELPERS
// ============================================================

/// The app, launched on a database of its own named after `test`.
async fn test_app(test: &str) -> (DBOS, Router) {
    let mut config = config();
    config.database_url = database_for(&config.database_url, test);
    // Several apps run at once, one per test; a small pool each keeps them all under Postgres's
    // default connection limit.
    config.max_connections = 5;
    build(config).await.expect("the app launches")
}

/// `url` with `_test_<test>` appended to its database name, keeping any query string.
fn database_for(url: &str, test: &str) -> String {
    let (base, query) = url
        .split_once('?')
        .map_or((url, None), |(b, q)| (b, Some(q)));
    let (server, database) = base.rsplit_once('/').expect("the URL names a database");
    let mut url = format!("{server}/{database}_test_{test}");
    if let Some(query) = query {
        url.push('?');
        url.push_str(query);
    }
    url
}

/// An id no earlier run of the tests has used.
fn unique(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{prefix}-{nanos}")
}

async fn inventory(router: &Router) -> i64 {
    parse(&get(router, "/product").await)["inventory"]
        .as_i64()
        .unwrap()
}

async fn get(router: &Router, uri: &str) -> String {
    send(router, "GET", uri).await
}

async fn post(router: &Router, uri: &str) -> String {
    send(router, "POST", uri).await
}

/// One request through the router, asserting success and returning the body.
async fn send(router: &Router, method: &str, uri: &str) -> String {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .unwrap();
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(
        status.is_success(),
        "{method} {uri} answered {status}: {text}"
    );
    text
}

fn parse(body: &str) -> Value {
    serde_json::from_str(body).unwrap()
}

/// Polls `probe` until it returns something, failing after a minute.
async fn eventually<T>(what: &str, mut probe: impl AsyncFnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        if let Some(value) = probe().await {
            return value;
        }
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}
