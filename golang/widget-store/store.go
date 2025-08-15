package main

import (
	"context"
)

// Database operations for inventory management
func reserveInventory(ctx context.Context) (bool, error) {
	result, err := db.Exec(ctx,
		"UPDATE products SET inventory = inventory - 1 WHERE product_id = $1 AND inventory > 0",
		WIDGET_ID)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func undoReserveInventory(ctx context.Context) (string, error) {
	_, err := db.Exec(ctx,
		"UPDATE products SET inventory = inventory + 1 WHERE product_id = $1",
		WIDGET_ID)
	return "", err
}

// Database operations for order management
func createOrder(ctx context.Context) (int, error) {
	var orderID int
	err := db.QueryRow(ctx,
		"INSERT INTO orders (order_status) VALUES ($1) RETURNING order_id",
		int(PENDING)).Scan(&orderID)
	return orderID, err
}

func updateOrderStatus(ctx context.Context, input UpdateOrderStatusInput) (string, error) {
	_, err := db.Exec(ctx,
		"UPDATE orders SET order_status = $1 WHERE order_id = $2",
		int(input.OrderStatus), input.OrderID)
	return "", err
}

func updateOrderProgress(ctx context.Context, orderID int) (int, error) {
	var progressRemaining int
	err := db.QueryRow(ctx,
		"UPDATE orders SET progress_remaining = progress_remaining - 1 WHERE order_id = $1 RETURNING progress_remaining",
		orderID).Scan(&progressRemaining)

	if err != nil {
		return 0, err
	}
	if progressRemaining == 0 {
		_, err = updateOrderStatus(ctx, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: DISPATCHED})
	}

	return progressRemaining, err
}
