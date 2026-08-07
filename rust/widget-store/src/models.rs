use serde::Serialize;

/// The single demo product's id.
pub const WIDGET_ID: i32 = 1;

/// Order lifecycle states, stored as integers in the `orders` table.
#[derive(Clone, Copy)]
pub enum OrderStatus {
    Cancelled = -1,
    Pending = 0,
    Dispatched = 1,
    Paid = 2,
}

impl OrderStatus {
    pub fn as_i32(self) -> i32 {
        self as i32
    }
}

#[derive(Serialize)]
pub struct Product {
    pub product_id: i32,
    pub product: String,
    pub description: String,
    pub inventory: i32,
    pub price: f64,
}

#[derive(Serialize)]
pub struct Order {
    pub order_id: i32,
    pub order_status: i32,
    pub last_update_time: chrono::NaiveDateTime,
    pub progress_remaining: i32,
}
