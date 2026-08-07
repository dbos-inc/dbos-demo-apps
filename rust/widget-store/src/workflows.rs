//! The checkout and dispatch workflows — a faithful port of the Go
//! widget-store's `workflows.go`, with each database write wrapped in a
//! checkpointed step so a crash never repeats one.

use crate::models::OrderStatus;
use crate::store;
use durare::{DurableContext, Result, WorkflowOptions};
use std::time::Duration;

pub const PAYMENT_STATUS: &str = "payment_status";
pub const PAYMENT_ID: &str = "payment_id";
pub const ORDER_ID: &str = "order_id";

/// One checkout: create the order, reserve inventory, publish the payment id,
/// wait for the payment webhook, then finalize — dispatching on success,
/// compensating (inventory back, order cancelled) on failure or timeout.
///
/// Started under the caller's idempotency key, so a retried checkout attaches
/// to the same run instead of double-charging.
#[durare::workflow("checkoutWorkflow")]
pub async fn checkout_workflow(ctx: DurableContext, _input: String) -> Result<String> {
    let workflow_id = ctx.workflow_id().to_string();

    // Create a new order.
    let order_id = ctx
        .step("create_order", || async { store::create_order().await })
        .await?;

    // Attempt to reserve inventory, cancelling the order if none remains.
    let reserved = ctx
        .step("reserve_inventory", || async {
            store::reserve_inventory().await
        })
        .await?;
    if !reserved {
        println!("No inventory for order {order_id}");
        let _ = ctx
            .step("cancel_order", || async {
                store::update_order_status(order_id, OrderStatus::Cancelled).await
            })
            .await;
        // An empty payment id tells the checkout handler there is nothing to pay.
        ctx.set_event(PAYMENT_ID, "").await?;
        return Ok(String::new());
    }

    // Publish the payment id (this workflow's id) for the checkout handler.
    ctx.set_event(PAYMENT_ID, &workflow_id).await?;

    // Wait up to a minute for the payment webhook; anything but "paid"
    // (deny, timeout, or an error) takes the compensation path — like the Go
    // app, which folds errors into the failure branch.
    let payment_status = ctx
        .recv::<String>(PAYMENT_STATUS, Duration::from_secs(60))
        .await
        .ok()
        .flatten();
    if payment_status.as_deref() == Some("paid") {
        println!("Payment succeeded for order {order_id}");
        ctx.step("mark_paid", || async {
            store::update_order_status(order_id, OrderStatus::Paid).await
        })
        .await?;
        let _ = ctx
            .start_workflow::<i32, String>(
                "dispatchOrderWorkflow",
                order_id,
                WorkflowOptions::default(),
            )
            .await;
    } else {
        println!(
            "Payment failed for order {order_id} (status: {:?})",
            payment_status
        );
        let _ = ctx
            .step("undo_reserve_inventory", || async {
                store::undo_reserve_inventory().await
            })
            .await;
        let _ = ctx
            .step("cancel_order", || async {
                store::update_order_status(order_id, OrderStatus::Cancelled).await
            })
            .await;
    }

    // Publish the order id for the payment webhook's response.
    ctx.set_event(ORDER_ID, order_id.to_string()).await?;
    Ok(String::new())
}

/// Ship the order: ten durable one-second ticks, each decrementing the order's
/// progress; the store marks it DISPATCHED at zero. Kill the process mid-way
/// and the restart resumes at the recorded tick — progress never rewinds.
#[durare::workflow("dispatchOrderWorkflow")]
pub async fn dispatch_order_workflow(ctx: DurableContext, order_id: i32) -> Result<String> {
    println!("Dispatching order {order_id}");
    for _ in 0..10 {
        ctx.sleep(Duration::from_secs(1)).await?;
        ctx.step("update_order_progress", || async {
            store::update_order_progress(order_id).await
        })
        .await?;
    }
    Ok(String::new())
}
