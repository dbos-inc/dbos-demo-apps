//! The queue patterns app, run in-process against a real Postgres.
//!
//! Each test builds the whole app with [`build`] and drives its routes directly, without a port.
//! There is nothing to mock: what is under test is when the queues let workflows run, which only a
//! real queue can show.
//!
//! Each test gets a database of its own, named after the database the app would use, so tests
//! running at once do not share a queue's limits. The database is created if it does not exist
//! and kept afterwards; tenants are unique per run, and the rate limit test reads only workflows it
//! created, so a rerun starts clean.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::Request;
use dbos::DBOS;
use dbos::sysdb::types::{Timestamp, WorkflowFilter, WorkflowStatus};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{RATE_LIMITED_WORKFLOW, build, config};

#[tokio::test(flavor = "multi_thread")]
async fn a_tenant_runs_at_most_two_tasks_at_once() {
    let (dbos, router) = test_app("fair_queue").await;
    let tenant = unique("tenant");

    for _ in 0..3 {
        post(
            &router,
            &format!("/api/workflows/fair_queue?tenant_id={tenant}"),
        )
        .await;
    }

    // Watch the tenant's tasks until all three finish, and keep the most ever running at once.
    let mut most_running = 0;
    eventually("the tenant's three tasks to succeed", async || {
        let rows = tenant_rows(&router, &tenant).await;
        let running = rows
            .iter()
            .filter(|row| row["workflow_status"] == "PENDING")
            .count();
        most_running = most_running.max(running);
        let succeeded = rows
            .iter()
            .filter(|row| row["workflow_status"] == "SUCCESS")
            .count();
        (succeeded == 3).then_some(())
    })
    .await;
    assert!(
        (1..=2).contains(&most_running),
        "{most_running} ran at once"
    );

    let pipeline = parse(&get(&router, "/api/fair_queue/pipeline").await);
    let success = pipeline["success"].as_array().unwrap();
    assert!(success.contains(&json!({ "tenant_id": tenant, "count": 3 })));

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn the_rate_limited_queue_starts_two_per_ten_seconds() {
    let (dbos, router) = test_app("rate_limit").await;
    let since = Timestamp::now();

    for _ in 0..3 {
        post(&router, "/api/workflows/rate_limited_queue").await;
    }

    let rows = eventually("all three to succeed", async || {
        let rows = dbos
            .list_workflows(&WorkflowFilter {
                names: vec![RATE_LIMITED_WORKFLOW],
                created_after: Some(since),
                load_input: false,
                load_output: false,
                ..Default::default()
            })
            .await
            .unwrap();
        let done = rows
            .iter()
            .filter(|row| row.status == WorkflowStatus::Success)
            .count();
        (rows.len() == 3 && done == 3).then_some(rows)
    })
    .await;

    // Two start at once; the third waits for the ten-second window to pass.
    let mut starts: Vec<i64> = rows
        .iter()
        .map(|row| {
            row.started_at
                .expect("a finished workflow started")
                .as_epoch_ms()
        })
        .collect();
    starts.sort_unstable();
    let spread = starts[2] - starts[0];
    assert!(
        spread >= 9_000,
        "the third started {spread} ms after the first"
    );

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn debouncing_runs_once_with_the_last_input() {
    let (dbos, router) = test_app("debouncer").await;
    let tenant = unique("tenant");

    for input in ["first", "second"] {
        post(
            &router,
            &format!("/api/workflows/debouncer?tenant_id={tenant}&input={input}"),
        )
        .await;
    }

    // The second input restarted the wait and replaced the first: one workflow is DELAYED.
    let pipeline = parse(&get(&router, "/api/debouncer/pipeline").await);
    let delayed: Vec<&Value> = pipeline["delayed"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["tenant_id"] == tenant.as_str())
        .collect();
    assert_eq!(delayed.len(), 1);
    assert_eq!(delayed[0]["input"], "second");

    // Ten seconds after the last input it runs, once, with that input.
    eventually("the debounced workflow to succeed", async || {
        let rows = tenant_debounced(&router, &tenant).await;
        (rows.len() == 1 && rows[0]["workflow_status"] == "SUCCESS").then_some(())
    })
    .await;
    let rows = tenant_debounced(&router, &tenant).await;
    assert_eq!(rows[0]["input"], "second");

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

/// The fair-queue managers the observability route lists for one tenant.
async fn tenant_rows(router: &Router, tenant: &str) -> Vec<Value> {
    tenant_listing(router, "fair_queue_concurrency_manager", tenant).await
}

/// The debounced workflows the observability route lists for one tenant.
async fn tenant_debounced(router: &Router, tenant: &str) -> Vec<Value> {
    tenant_listing(router, "debouncer_workflow", tenant).await
}

async fn tenant_listing(router: &Router, workflow_name: &str, tenant: &str) -> Vec<Value> {
    let listing = parse(
        &get(
            router,
            &format!("/api/workflows?workflow_name={workflow_name}"),
        )
        .await,
    );
    listing
        .as_array()
        .unwrap()
        .iter()
        .filter(|row| row["tenant_id"] == tenant)
        .cloned()
        .collect()
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
