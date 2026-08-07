//! Database operations for the app's own tables (products, orders).
//!
//! The pool is a process global set once in `main`, read inside workflow steps
//! — the dependency-injection pattern from durare's determinism guide: the
//! dependency lives outside durable state, so checkpoints stay portable.

use crate::models::{Order, OrderStatus, Product, WIDGET_ID};
use durare::{Error, Result};
use sqlx::{PgPool, Row};
use std::sync::OnceLock;

static DB: OnceLock<PgPool> = OnceLock::new();

pub fn init_db(pool: PgPool) {
    let _ = DB.set(pool);
}

pub fn db() -> &'static PgPool {
    DB.get().expect("app database pool not initialized")
}

fn db_err(e: sqlx::Error) -> Error {
    Error::app(format!("database error: {e}"))
}

/// Create the app tables and seed the demo product if they don't exist yet
/// (idempotent — mirrors `migrations/001_widget_store.up.sql`).
pub async fn bootstrap(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS orders (
            order_id SERIAL PRIMARY KEY,
            order_status INTEGER NOT NULL,
            last_update_time TIMESTAMP DEFAULT now() NOT NULL,
            progress_remaining INTEGER DEFAULT 10 NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(db_err)?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS products (
            product_id SERIAL PRIMARY KEY,
            product VARCHAR(255) NOT NULL UNIQUE,
            description TEXT NOT NULL,
            inventory INTEGER NOT NULL,
            price DECIMAL(10,2) NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(db_err)?;
    sqlx::query(
        "INSERT INTO products (product_id, product, description, inventory, price)
         VALUES ($1, 'Premium Quality Widget', 'Enhance your productivity with our top-rated widgets!', 100, 99.99)
         ON CONFLICT (product_id) DO NOTHING",
    )
    .bind(WIDGET_ID)
    .execute(pool)
    .await
    .map_err(db_err)?;
    Ok(())
}

// Inventory management.

pub async fn reserve_inventory() -> Result<bool> {
    let result = sqlx::query(
        "UPDATE products SET inventory = inventory - 1 WHERE product_id = $1 AND inventory > 0",
    )
    .bind(WIDGET_ID)
    .execute(db())
    .await
    .map_err(db_err)?;
    Ok(result.rows_affected() > 0)
}

pub async fn undo_reserve_inventory() -> Result<()> {
    sqlx::query("UPDATE products SET inventory = inventory + 1 WHERE product_id = $1")
        .bind(WIDGET_ID)
        .execute(db())
        .await
        .map_err(db_err)?;
    Ok(())
}

// Order management.

pub async fn create_order() -> Result<i32> {
    let row = sqlx::query("INSERT INTO orders (order_status) VALUES ($1) RETURNING order_id")
        .bind(OrderStatus::Pending.as_i32())
        .fetch_one(db())
        .await
        .map_err(db_err)?;
    Ok(row.get("order_id"))
}

pub async fn update_order_status(order_id: i32, status: OrderStatus) -> Result<()> {
    sqlx::query("UPDATE orders SET order_status = $1 WHERE order_id = $2")
        .bind(status.as_i32())
        .bind(order_id)
        .execute(db())
        .await
        .map_err(db_err)?;
    Ok(())
}

/// Decrement the order's progress counter, marking it DISPATCHED at zero.
/// Returns the remaining progress.
pub async fn update_order_progress(order_id: i32) -> Result<i32> {
    let row = sqlx::query(
        "UPDATE orders SET progress_remaining = progress_remaining - 1
         WHERE order_id = $1 RETURNING progress_remaining",
    )
    .bind(order_id)
    .fetch_one(db())
    .await
    .map_err(db_err)?;
    let remaining: i32 = row.get("progress_remaining");
    if remaining == 0 {
        update_order_status(order_id, OrderStatus::Dispatched).await?;
    }
    Ok(remaining)
}

// Read paths for the HTTP handlers.

pub async fn get_product() -> Result<Product> {
    let row = sqlx::query(
        "SELECT product_id, product, description, inventory, price::FLOAT8 AS price
         FROM products LIMIT 1",
    )
    .fetch_one(db())
    .await
    .map_err(db_err)?;
    Ok(Product {
        product_id: row.get("product_id"),
        product: row.get("product"),
        description: row.get("description"),
        inventory: row.get("inventory"),
        price: row.get("price"),
    })
}

fn order_from_row(row: &sqlx::postgres::PgRow) -> Order {
    Order {
        order_id: row.get("order_id"),
        order_status: row.get("order_status"),
        last_update_time: row.get("last_update_time"),
        progress_remaining: row.get("progress_remaining"),
    }
}

pub async fn get_orders() -> Result<Vec<Order>> {
    let rows = sqlx::query(
        "SELECT order_id, order_status, last_update_time, progress_remaining FROM orders",
    )
    .fetch_all(db())
    .await
    .map_err(db_err)?;
    Ok(rows.iter().map(order_from_row).collect())
}

pub async fn get_order(order_id: i32) -> Result<Option<Order>> {
    let row = sqlx::query(
        "SELECT order_id, order_status, last_update_time, progress_remaining
         FROM orders WHERE order_id = $1",
    )
    .bind(order_id)
    .fetch_optional(db())
    .await
    .map_err(db_err)?;
    Ok(row.as_ref().map(order_from_row))
}

pub async fn restock() -> Result<()> {
    sqlx::query("UPDATE products SET inventory = 100")
        .execute(db())
        .await
        .map_err(db_err)?;
    Ok(())
}
