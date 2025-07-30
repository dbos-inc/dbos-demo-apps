package main

import "time"

const WIDGET_ID = 1

type OrderStatus int

const (
	CANCELLED  OrderStatus = -1
	PENDING    OrderStatus = 0
	DISPATCHED OrderStatus = 1
	PAID       OrderStatus = 2
)

type Product struct {
	ProductID   int     `json:"product_id"`
	Product     string  `json:"product"`
	Description string  `json:"description"`
	Inventory   int     `json:"inventory"`
	Price       float64 `json:"price"`
}

type Order struct {
	OrderID           int       `json:"order_id"`
	OrderStatus       int       `json:"order_status"`
	LastUpdateTime    time.Time `json:"last_update_time"`
	ProgressRemaining int       `json:"progress_remaining"`
}

type UpdateOrderStatusInput struct {
	OrderID     int
	OrderStatus OrderStatus
}