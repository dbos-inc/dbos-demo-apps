package main

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"
)

const PAYMENT_STATUS = "payment_status"
const PAYMENT_ID = "payment_id"
const ORDER_ID = "order_id"

// HTTP handlers
func getProduct(c *gin.Context, db *pgxpool.Pool, logger *logrus.Logger) {
	var product Product
	err := db.QueryRow(context.Background(),
		"SELECT product_id, product, description, inventory, price FROM products LIMIT 1").
		Scan(&product.ProductID, &product.Product, &product.Description, &product.Inventory, &product.Price)

	if err != nil {
		logger.WithError(err).Error("product query failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product"})
		return
	}
	c.JSON(http.StatusOK, product)
}

func getOrders(c *gin.Context, db *pgxpool.Pool, logger *logrus.Logger) {
	rows, err := db.Query(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders")
	if err != nil {
		logger.WithError(err).Error("orders database query failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var order Order
		err := rows.Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)
		if err != nil {
			logger.WithError(err).Error("order data parsing failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process orders"})
			return
		}
		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, orders)
}

func getOrder(c *gin.Context, db *pgxpool.Pool, logger *logrus.Logger) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		logger.WithError(err).WithField("id", idStr).Warn("invalid order ID")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order ID"})
		return
	}

	var order Order
	err = db.QueryRow(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders WHERE order_id = $1", id).
		Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)

	if err != nil {
		if err == pgx.ErrNoRows {
			logger.WithField("order", id).Warn("order not found")
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		} else {
			logger.WithError(err).WithField("order", id).Error("order database query failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
		}
		return
	}
	c.JSON(http.StatusOK, order)
}

func restock(c *gin.Context, db *pgxpool.Pool, logger *logrus.Logger) {
	_, err := db.Exec(context.Background(), "UPDATE products SET inventory = 100")
	if err != nil {
		logger.WithError(err).Error("inventory update failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restock inventory"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Restocked successfully"})
}

// XXX can we fold our context inside the gin context?
// and more generally, how do funky contexts play together
func checkoutEndpoint(c *gin.Context, dbosCtx dbos.DBOSContext, logger *logrus.Logger) {
	idempotencyKey := c.Param("idempotency_key")

	// Start the checkout workflow with the idempotency key
	_, err := dbos.RunAsWorkflow(dbosCtx, checkoutWorkflow, "", dbos.WithWorkflowID(idempotencyKey))
	if err != nil {
		logger.WithError(err).WithField("key", idempotencyKey).Error("checkout workflow start failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed to start"})
		return
	}

	payment_id, err := dbos.GetEvent[string](dbosCtx, idempotencyKey, PAYMENT_ID, 60 * time.Second)
	if err != nil || payment_id == "" {
		logger.WithField("key", idempotencyKey).Error("payment ID retrieval failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed"})
		return
	}

	c.String(http.StatusOK, payment_id)
}

func paymentEndpoint(c *gin.Context, dbosCtx dbos.DBOSContext, logger *logrus.Logger) {
	paymentID := c.Param("payment_id")
	paymentStatus := c.Param("payment_status")

	err := dbos.Send(dbosCtx, paymentID, paymentStatus, PAYMENT_STATUS)
	if err != nil {
		logger.WithError(err).WithFields(logrus.Fields{"payment": paymentID, "status": paymentStatus}).Error("payment notification failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
		return
	}

	orderID, err := dbos.GetEvent[string](dbosCtx, paymentID, ORDER_ID, 60 * time.Second)
	if err != nil || orderID == "" {
		logger.WithField("payment", paymentID).Error("order ID retrieval failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed to process"})
		return
	}

	c.String(http.StatusOK, orderID)
}

func crashApplication(c *gin.Context, logger *logrus.Logger) {
	logger.Warn("application crash requested")
	c.JSON(http.StatusOK, gin.H{"message": "Crashing application..."})
	// Give time for response to be sent
	go func() {
		time.Sleep(100 * time.Millisecond)
		logger.Fatal("intentional crash for demo")
	}()
}
