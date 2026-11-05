//! The application's own tables, and the queries the workflows and handlers run against them.
//!
//! Nothing here is durable by itself. Each of these is called from inside a [`dbos::step`], and it
//! is the step that makes the call happen once: the checkpoint records that the body ran, and a
//! replay reads the recorded answer instead of running it again. That is the boundary worth being
//! precise about, because the step's checkpoint and the row a query writes land in **two separate
//! transactions** — Rust has no transactional step yet. A crash in the window between them replays
//! the step, so a write below can be applied twice: the inventory decrement, its compensating
//! increment and the order insert are each at-least-once, not exactly-once.
//!
//! That gap closes when Rust gains datasources and the transactional step built on them, which
//! commit the application write and the step's checkpoint in a single transaction the way the
//! other SDKs already do. Until then this demo leaves the window open rather than hiding it
//! behind hand-rolled idempotency keys, because the mechanism it is here to show is recovery.

use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

/// The only product the store sells.
pub const WIDGET_ID: i32 = 1;

/// Order statuses, shared by number with the Python, TypeScript, Go and Java widget stores: the
/// frontend and the schema are the same in all five, so the numbers are a wire format.
pub const CANCELLED: i32 = -1;
pub const PENDING: i32 = 0;
pub const DISPATCHED: i32 = 1;
pub const PAID: i32 = 2;

/// How many progress ticks a dispatched order takes to arrive.
pub const DISPATCH_TICKS: i32 = 10;

/// A failure of the application's own database, in a form a checkpoint can hold.
///
/// `sqlx::Error` is not serializable and a recorded failure has to survive a column, so what gets
/// recorded is the message. That is the honest trade: the workflow's error channel keeps enough to
/// read in a log or on a handle, and drops a source chain that could not have been decoded anyway.
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[error("widget store database error: {0}")]
pub struct StoreError(pub String);

impl From<sqlx::Error> for StoreError {
    fn from(error: sqlx::Error) -> Self {
        Self(error.to_string())
    }
}

/// The product, as the storefront displays it.
#[derive(Serialize)]
pub struct Product {
    pub product_id: i32,
    pub product: String,
    pub description: String,
    pub inventory: i32,
    pub price: f64,
}

/// An order, as the orders list displays it.
#[derive(Serialize)]
pub struct Order {
    pub order_id: i32,
    pub order_status: i32,
    /// Rendered as text by the frontend and never parsed, so it is cast to text in SQL rather than
    /// pulling a calendar crate in to turn a timestamp back into one.
    pub last_update_time: String,
    pub progress_remaining: i32,
}

/// A pool onto the application's tables.
///
/// Cloned into every workflow and handler that needs it — `PgPool` is an `Arc` inside, so a clone
/// is a refcount bump and they all share one set of connections.
#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

impl Store {
    /// Builds a pool without connecting to anything.
    ///
    /// Lazy on purpose, and the ordering is why: the workflows capture a store, so it has to exist
    /// before they are registered, which is before `DBOS::launch` — and `launch` is what creates
    /// the database. A lazy pool opens its first connection when the first query runs, by which
    /// time the database is there. [`create_schema`](Self::create_schema) is that first query.
    pub fn lazy(database_url: &str) -> Result<Self, sqlx::Error> {
        Ok(Self {
            pool: PgPoolOptions::new().connect_lazy(database_url)?,
        })
    }

    /// The application's tables, created if absent and left alone if not.
    ///
    /// Idempotent rather than versioned: two tables that have never changed do not need a migration
    /// tool, and a demo that runs on `cargo run` alone is worth more here than a rehearsal of one.
    /// The schema itself is copied from the other widget stores, column for column.
    pub async fn create_schema(&self) -> Result<(), sqlx::Error> {
        // `sqlx::raw_sql` takes a `&'static str`, so the default below has to be a literal rather
        // than the constant it has to agree with. This keeps the two from drifting: raise
        // `DISPATCH_TICKS` without raising the default and orders would start at fewer ticks than
        // the workflow sends, and never reach DISPATCHED.
        const _: () = assert!(
            DISPATCH_TICKS == 10,
            "the orders DDL below hard-codes the default"
        );
        sqlx::raw_sql(
            "CREATE TABLE IF NOT EXISTS orders (
                 order_id SERIAL PRIMARY KEY,
                 order_status INTEGER NOT NULL,
                 last_update_time TIMESTAMP DEFAULT now() NOT NULL,
                 progress_remaining INTEGER DEFAULT 10 NOT NULL
             );
             CREATE TABLE IF NOT EXISTS products (
                 product_id SERIAL PRIMARY KEY,
                 product VARCHAR(255) NOT NULL UNIQUE,
                 description TEXT NOT NULL,
                 inventory INTEGER NOT NULL,
                 price DECIMAL(10,2) NOT NULL
             );
             INSERT INTO products (product_id, product, description, inventory, price)
             VALUES (1, 'Premium Quality Widget',
                     'Enhance your productivity with our top-rated widgets!', 100, 99.99)
             ON CONFLICT (product_id) DO NOTHING;",
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Takes one widget off the shelf, if there is one.
    ///
    /// `inventory > 0` in the `WHERE` rather than a read followed by a write: two checkouts racing
    /// for the last widget both run this, and exactly one of them updates a row.
    pub async fn reserve_inventory(&self) -> Result<bool, StoreError> {
        let result = sqlx::query(
            "UPDATE products SET inventory = inventory - 1 WHERE product_id = $1 AND inventory > 0",
        )
        .bind(WIDGET_ID)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Puts it back, when the payment did not arrive.
    pub async fn undo_reserve_inventory(&self) -> Result<(), StoreError> {
        sqlx::query("UPDATE products SET inventory = inventory + 1 WHERE product_id = $1")
            .bind(WIDGET_ID)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_order(&self) -> Result<i32, StoreError> {
        let row = sqlx::query("INSERT INTO orders (order_status) VALUES ($1) RETURNING order_id")
            .bind(PENDING)
            .fetch_one(&self.pool)
            .await?;
        Ok(row.try_get("order_id")?)
    }

    pub async fn update_order_status(&self, order_id: i32, status: i32) -> Result<(), StoreError> {
        sqlx::query(
            "UPDATE orders SET order_status = $1, last_update_time = now() WHERE order_id = $2",
        )
        .bind(status)
        .bind(order_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Ticks one unit off an order's progress, and marks it dispatched when it runs out.
    ///
    /// The decrement is unconditional, which is the one place the missing transactional step is
    /// visible: a crash between this write and its checkpoint replays the step and ticks twice.
    /// `GREATEST(…, 0)` keeps that from running the counter negative, and the caller's fixed number
    /// of ticks means an order that lost one still reaches zero and still dispatches.
    pub async fn update_order_progress(&self, order_id: i32) -> Result<i32, StoreError> {
        let row = sqlx::query(
            "UPDATE orders
                SET progress_remaining = GREATEST(progress_remaining - 1, 0),
                    last_update_time = now()
              WHERE order_id = $1
          RETURNING progress_remaining",
        )
        .bind(order_id)
        .fetch_one(&self.pool)
        .await?;
        let remaining: i32 = row.try_get("progress_remaining")?;
        if remaining == 0 {
            self.update_order_status(order_id, DISPATCHED).await?;
        }
        Ok(remaining)
    }

    pub async fn product(&self) -> Result<Product, StoreError> {
        let row = sqlx::query(
            "SELECT product_id, product, description, inventory,
                    price::double precision AS price
               FROM products
              LIMIT 1",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(Product {
            product_id: row.try_get("product_id")?,
            product: row.try_get("product")?,
            description: row.try_get("description")?,
            inventory: row.try_get("inventory")?,
            price: row.try_get("price")?,
        })
    }

    pub async fn orders(&self) -> Result<Vec<Order>, StoreError> {
        let rows = sqlx::query(
            "SELECT order_id, order_status, last_update_time::text AS last_update_time,
                    progress_remaining
               FROM orders",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(order_from_row).collect()
    }

    /// One order, or `None` when there is no such row — which the handler answers 404 to.
    pub async fn order(&self, order_id: i32) -> Result<Option<Order>, StoreError> {
        let row = sqlx::query(
            "SELECT order_id, order_status, last_update_time::text AS last_update_time,
                    progress_remaining
               FROM orders
              WHERE order_id = $1",
        )
        .bind(order_id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(order_from_row).transpose()
    }

    /// Refills the shelf, so the demo can be run again.
    pub async fn restock(&self) -> Result<(), StoreError> {
        sqlx::query("UPDATE products SET inventory = 100")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

fn order_from_row(row: &sqlx::postgres::PgRow) -> Result<Order, StoreError> {
    Ok(Order {
        order_id: row.try_get("order_id")?,
        order_status: row.try_get("order_status")?,
        last_update_time: row.try_get("last_update_time")?,
        progress_remaining: row.try_get("progress_remaining")?,
    })
}
