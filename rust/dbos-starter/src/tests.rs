//! The starter app, run in-process against a real Postgres.
//!
//! Each test builds the whole app with [`build`] and drives its routes directly, without a port.
//! There is nothing to mock: workflows call `dbos::step` and friends as free functions, so a test
//! runs them for real and checks what they recorded.
//!
//! Each test gets a database of its own, named after the database the app would use, so tests
//! running at once neither recover nor dequeue each other's workflows. The database is created if
//! it does not exist and kept afterwards; workflow ids are unique per run, so a rerun starts clean.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::Request;
use axum::http::header::CONTENT_TYPE;
use dbos::DBOS;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{build, config};

#[tokio::test(flavor = "multi_thread")]
async fn example_workflow_runs_its_steps_in_order() {
    let (dbos, router) = test_app("example").await;
    let id = unique("example");

    post(&router, &format!("/workflow/{id}"), None).await;
    // The id is an idempotency key: posting it again joins the workflow already running.
    post(&router, &format!("/workflow/{id}"), None).await;

    eventually("the third step's progress event", async || {
        (get(&router, &format!("/last_step/{id}")).await == "3").then_some(())
    })
    .await;
    let result = dbos
        .retrieve_workflow::<String, dbos::EngineOnly>(&id)
        .unwrap()
        .result()
        .await
        .unwrap();
    assert_eq!(result, "Workflow completed");

    let steps: Vec<String> = dbos
        .list_workflow_steps(&id)
        .await
        .unwrap()
        .into_iter()
        .map(|step| step.step_name)
        .filter(|name| name.starts_with("step_"))
        .collect();
    assert_eq!(steps, ["step_one", "step_two", "step_three"]);

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn reading_an_event_waits_for_it_to_be_published() {
    let (dbos, router) = test_app("events").await;

    let id = post(&router, "/events/start", None).await;

    // Asked for before the order has shipped, the read blocks until the workflow publishes it.
    let read = parse(&post(&router, "/events/read", Some(json!({ "key": "shipped" }))).await);
    assert_eq!(read["value"], "shipped at step 3");
    assert!(read["waited_ms"].as_u64().unwrap() > 0);

    let status = parse(&get(&router, "/events/status").await);
    assert_eq!(status["workflow_id"], id.as_str());
    let values: Vec<&str> = status["keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|key| key["value"].as_str().unwrap())
        .collect();
    assert_eq!(
        values,
        [
            "accepted at step 1",
            "charged at step 2",
            "shipped at step 3"
        ]
    );

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn an_approval_waits_for_its_message() {
    let (dbos, router) = test_app("approval").await;

    let id = post(&router, "/messages/start", None).await;
    let status = parse(&get(&router, "/messages/status").await);
    assert_eq!(decision_of(&status, &id), Some(&Value::Null));

    post(
        &router,
        "/messages/respond",
        Some(json!({ "workflow_id": id, "decision": "approved" })),
    )
    .await;

    assert_eq!(approval_result(&dbos, &id).await, "approved");
    let status = parse(&get(&router, "/messages/status").await);
    assert_eq!(decision_of(&status, &id), Some(&json!("approved")));

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn approve_all_answers_every_waiting_request() {
    let (dbos, router) = test_app("approve_all").await;

    let first = post(&router, "/messages/start", None).await;
    let second = post(&router, "/messages/start", None).await;

    // At least these two: requests an earlier, interrupted run left waiting are answered too.
    let sent: usize = post(
        &router,
        "/messages/respond-all",
        Some(json!({ "decision": "rejected" })),
    )
    .await
    .parse()
    .unwrap();
    assert!(sent >= 2, "sent {sent}");

    assert_eq!(approval_result(&dbos, &first).await, "rejected");
    assert_eq!(approval_result(&dbos, &second).await, "rejected");

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn queue_limit_changes_while_the_app_runs() {
    let (dbos, router) = test_app("queue").await;

    post(
        &router,
        "/queue/concurrency",
        Some(json!({ "concurrency": 5 })),
    )
    .await;
    let status = parse(&get(&router, "/queue/status").await);
    assert_eq!(status["worker_concurrency"], 5);

    post(&router, "/queue/enqueue", None).await;
    eventually("all five queued workflows to succeed", async || {
        let status = parse(&get(&router, "/queue/status").await);
        (status["workflow_counts"] == json!({ "SUCCESS": 5 })).then_some(())
    })
    .await;

    dbos.shutdown().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn schedule_can_be_paused_resumed_and_triggered() {
    let (dbos, router) = test_app("schedule").await;
    // Once a year, so nothing but the trigger below runs it during the test.
    let cron = "0 0 0 1 1 *";

    post(&router, "/schedule/apply", Some(json!({ "cron": cron }))).await;
    let status = parse(&get(&router, "/schedule/status").await);
    assert_eq!(status["cron"], cron);
    assert_eq!(status["schedule_status"], "ACTIVE");

    post(&router, "/schedule/pause", None).await;
    let status = parse(&get(&router, "/schedule/status").await);
    assert_eq!(status["schedule_status"], "PAUSED");

    // Triggering runs it now, paused or not.
    let before = successes(&status);
    post(&router, "/schedule/trigger", None).await;
    eventually("the triggered run to succeed", async || {
        let status = parse(&get(&router, "/schedule/status").await);
        (successes(&status) > before).then_some(())
    })
    .await;

    post(&router, "/schedule/resume", None).await;
    let status = parse(&get(&router, "/schedule/status").await);
    assert_eq!(status["schedule_status"], "ACTIVE");

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

async fn get(router: &Router, uri: &str) -> String {
    send(router, "GET", uri, None).await
}

async fn post(router: &Router, uri: &str, body: Option<Value>) -> String {
    send(router, "POST", uri, body).await
}

/// One request through the router, asserting success and returning the body.
async fn send(router: &Router, method: &str, uri: &str, body: Option<Value>) -> String {
    let mut request = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(json) => {
            request = request.header(CONTENT_TYPE, "application/json");
            Body::from(json.to_string())
        }
        None => Body::empty(),
    };
    let response = router
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
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

/// The decision the Messages tab shows for one request, or `None` if it does not list it.
fn decision_of<'a>(status: &'a Value, workflow_id: &str) -> Option<&'a Value> {
    status
        .as_array()
        .unwrap()
        .iter()
        .find(|approval| approval["workflow_id"] == workflow_id)
        .map(|approval| &approval["decision"])
}

async fn approval_result(dbos: &DBOS, workflow_id: &str) -> String {
    dbos.retrieve_workflow::<String, dbos::EngineOnly>(workflow_id)
        .unwrap()
        .result()
        .await
        .unwrap()
}

/// How many scheduled runs the Schedules tab counts as succeeded.
fn successes(status: &Value) -> u64 {
    status["workflow_counts"]["SUCCESS"].as_u64().unwrap_or(0)
}
