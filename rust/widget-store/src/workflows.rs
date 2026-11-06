//! The two workflows the storefront runs.
//!
//! **The demo is the crash button.** Buy a widget, and while the order is being dispatched, kill
//! the process. Start it again and the order carries on arriving from where it stopped — no
//! application code takes part in that, because `launch()` recovers whatever the previous run
//! abandoned and a step that finished replays from its checkpoint rather than running again.
//!
//! The checkout is the interesting half. It reserves inventory, then *stops* and waits to be told
//! whether the card was charged — a wait that outlives the process, because the deadline is a row
//! rather than a timer in memory. Whichever way the answer goes, the workflow is what puts the
//! books back: a payment that fails returns the widget to the shelf, and a payment that never
//! comes does the same when the deadline passes.
//!
//! **Compensation, not a guarantee.** That pairing balances the books against a *failed payment*,
//! which is the case it is written for. It does not close the window `store.rs` describes: a step
//! interrupted between its write and its checkpoint runs again, so a crash placed just so can
//! decrement inventory twice against a single compensating increment. Rust has no transactional
//! step yet, and this demo shows recovery rather than papering over that.

use std::time::Duration;

use dbos::WorkflowRef;

use crate::store::{CANCELLED, DISPATCH_TICKS, PAID, Store, StoreError};

/// The topic the payment webhook sends its answer on.
pub const PAYMENT_STATUS: &str = "payment_status";
/// The key the checkout publishes the id to pay against — which is the workflow's own id.
pub const PAYMENT_ID: &str = "payment_id";
/// The key the checkout publishes the order it created, once the outcome is settled.
pub const ORDER_ID: &str = "order_id";

/// The status string the webhook sends when the card was charged. Anything else is a refusal.
pub const PAID_STATUS: &str = "paid";

/// How long a checkout waits to be told whether it was paid for.
///
/// A deadline rather than a hang: an abandoned checkout has a widget reserved against it, and the
/// timeout is what eventually puts that back. Nobody answering is not a failure — it is one of the
/// two answers, and the workflow handles it the same way it handles a refusal.
pub const PAYMENT_TIMEOUT: Duration = Duration::from_secs(60);

/// How long each dispatch tick takes, so the progress bar has something to show.
pub const DISPATCH_TICK: Duration = Duration::from_secs(1);

/// Buys a widget: reserve it, wait to be paid, then either dispatch it or put it back.
///
/// Started under the browser's idempotency key, so a double-clicked Buy button joins the checkout
/// already running rather than reserving a second widget.
pub async fn checkout(
    store: Store,
    dispatch: WorkflowRef<i32, (), StoreError>,
) -> dbos::Result<(), StoreError> {
    // The payment id the storefront will pay against is this workflow's own id. One identifier for
    // the checkout and the payment, so the webhook needs nothing else to find the workflow waiting.
    let workflow_id = dbos::workflow_id().expect("checkout runs as a workflow");

    let order_id = dbos::step("create_order", || async { Ok(store.create_order().await?) }).await?;

    // Reserve before charging, so two buyers cannot be sold the same last widget.
    let reserved = dbos::step("reserve_inventory", || async {
        Ok(store.reserve_inventory().await?)
    })
    .await?;
    if !reserved {
        dbos::step("cancel_order", || async {
            Ok(store.update_order_status(order_id, CANCELLED).await?)
        })
        .await?;
        // An empty payment id is how the storefront hears "no": it is waiting on this key, and
        // leaving it unpublished would only make it wait out its own timeout for an answer that
        // is already known.
        dbos::set_event(PAYMENT_ID, &String::new()).await?;
        return Ok(());
    }

    dbos::set_event(PAYMENT_ID, &workflow_id).await?;

    // **The pause.** Nothing of this workflow is in memory while it waits: it is parked on a row,
    // and the webhook's `send` is what wakes it. Restart the process here and the wait resumes with
    // whatever is left of its deadline.
    let status: Option<String> = dbos::recv(Some(PAYMENT_STATUS), PAYMENT_TIMEOUT).await?;

    if status.as_deref() == Some(PAID_STATUS) {
        dbos::step("mark_order_paid", || async {
            Ok(store.update_order_status(order_id, PAID).await?)
        })
        .await?;
        // A child workflow, started and not awaited: dispatching takes ten seconds and the buyer
        // should not be kept waiting for it. Being a child rather than a spawned task is what makes
        // it survive — a crash mid-dispatch is recovered on the next launch.
        dispatch.start(order_id).lift().await?;
    } else {
        // Refused, or nobody answered before the deadline. Either way the widget goes back on the
        // shelf, which is the compensation the reservation above was taken out against.
        dbos::step("undo_reserve_inventory", || async {
            Ok(store.undo_reserve_inventory().await?)
        })
        .await?;
        dbos::step("cancel_order", || async {
            Ok(store.update_order_status(order_id, CANCELLED).await?)
        })
        .await?;
    }

    // Published last, once the outcome is settled: the webhook is waiting on this key, and it is
    // what tells the storefront which order to show.
    dbos::set_event(ORDER_ID, &order_id.to_string()).await?;
    Ok(())
}

/// Walks a paid order to the buyer, one tick a second, and marks it dispatched at the end.
///
/// Ten seconds of nothing but sleeping and counting, which is exactly what makes it the thing to
/// crash: `dbos::sleep` is durable, so the ticks already taken stay taken and a restart picks up
/// the count where it stopped rather than starting the order over.
pub async fn dispatch_order(store: Store, order_id: i32) -> dbos::Result<(), StoreError> {
    for _ in 0..DISPATCH_TICKS {
        dbos::sleep(DISPATCH_TICK).await?;
        dbos::step("update_order_progress", || async {
            Ok(store.update_order_progress(order_id).await?)
        })
        .await?;
    }
    Ok(())
}
