package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const PAYMENT_STATUS = "payment_status"
const PAYMENT_ID = "payment_id"
const ORDER_ID = "order_id"

// HTTP handlers
func getProduct(c *gin.Context, db *pgxpool.Pool, logger *slog.Logger) {
	var product Product
	err := db.QueryRow(context.Background(),
		"SELECT product_id, product, description, inventory, price FROM products LIMIT 1").
		Scan(&product.ProductID, &product.Product, &product.Description, &product.Inventory, &product.Price)

	if err != nil {
		logger.Error("product query failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product"})
		return
	}
	c.JSON(http.StatusOK, product)
}

func getOrders(c *gin.Context, db *pgxpool.Pool, logger *slog.Logger) {
	rows, err := db.Query(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders")
	if err != nil {
		logger.Error("orders database query failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var order Order
		err := rows.Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)
		if err != nil {
			logger.Error("order data parsing failed", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process orders"})
			return
		}
		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, orders)
}

func getOrder(c *gin.Context, db *pgxpool.Pool, logger *slog.Logger) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		logger.Warn("invalid order ID", "error", err, "id", idStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order ID"})
		return
	}

	var order Order
	err = db.QueryRow(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders WHERE order_id = $1", id).
		Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)

	if err != nil {
		if err == pgx.ErrNoRows {
			logger.Warn("order not found", "order", id)
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		} else {
			logger.Error("order database query failed", "error", err, "order", id)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
		}
		return
	}
	c.JSON(http.StatusOK, order)
}

func restock(c *gin.Context, db *pgxpool.Pool, logger *slog.Logger) {
	_, err := db.Exec(context.Background(), "UPDATE products SET inventory = 100")
	if err != nil {
		logger.Error("inventory update failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restock inventory"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Restocked successfully"})
}

// XXX can we fold our context inside the gin context?
// and more generally, how do funky contexts play together
func checkoutEndpoint(c *gin.Context, dbosCtx dbos.DBOSContext, logger *slog.Logger) {
	idempotencyKey := c.Param("idempotency_key")

	// Start the checkout workflow with the idempotency key
	_, err := dbos.RunWorkflow(dbosCtx, checkoutWorkflow, "", dbos.WithWorkflowID(idempotencyKey))
	if err != nil {
		logger.Error("checkout workflow start failed", "error", err, "key", idempotencyKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed to start"})
		return
	}

	payment_id, err := dbos.GetEvent[string](dbosCtx, idempotencyKey, PAYMENT_ID, 60*time.Second)
	if err != nil || payment_id == "" {
		logger.Error("payment ID retrieval failed", "key", idempotencyKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed"})
		return
	}

	c.String(http.StatusOK, payment_id)
}

func paymentEndpoint(c *gin.Context, dbosCtx dbos.DBOSContext, logger *slog.Logger) {
	paymentID := c.Param("payment_id")
	paymentStatus := c.Param("payment_status")

	err := dbos.Send(dbosCtx, paymentID, paymentStatus, PAYMENT_STATUS)
	if err != nil {
		logger.Error("payment notification failed", "error", err, "payment", paymentID, "status", paymentStatus)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
		return
	}

	orderID, err := dbos.GetEvent[string](dbosCtx, paymentID, ORDER_ID, 60*time.Second)
	if err != nil || orderID == "" {
		logger.Error("order ID retrieval failed", "payment", paymentID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed to process"})
		return
	}

	c.String(http.StatusOK, orderID)
}

func crashApplication(c *gin.Context, logger *slog.Logger) {
	logger.Warn("application crash requested")
	c.JSON(http.StatusOK, gin.H{"message": "Crashing application..."})
	// Give time for response to be sent
	go func() {
		time.Sleep(100 * time.Millisecond)
		logger.Error("intentional crash for demo")
		os.Exit(1)
	}()
}
