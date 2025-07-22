package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	checkoutWF = dbos.WithWorkflow(checkoutWorkflow)
)

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

var db *pgxpool.Pool

func main() {
	dbURL := os.Getenv("DBOS_DATABASE_URL")
	if dbURL == "" {
		panic("DBOS_DATABASE_URL environment variable is required")
	}

	err := dbos.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown()

	db, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	r := gin.Default()

	// Serve HTML
	r.StaticFile("/", "./html/app.html")

	// HTTP endpoints
	r.GET("/product", getProduct)
	r.GET("/orders", getOrders)
	r.GET("/order/:id", getOrder)
	r.POST("/restock", restock)
	r.POST("/checkout/:idempotency_key", checkoutEndpoint)

	r.Run(":8080")
}

func checkoutWorkflow(ctx context.Context, _ string) (string, error) {
	// Create a new order
	orderID, err := dbos.RunAsStep(ctx, createOrder, "")
	if err != nil {
		return "", err
	}

	// Attempt to reserve inventory, cancelling the order if no inventory remains
	success, err := dbos.RunAsStep(ctx, reserveInventory, "")
	if err != nil || !success {
		fmt.Printf("Failed to reserve inventory for order %d", orderID)
		dbos.RunAsStep(ctx, updateOrderStatus, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		return "", err
	}
	return "", nil
}

func getProduct(c *gin.Context) {
	var product Product
	err := db.QueryRow(context.Background(),
		"SELECT product_id, product, description, inventory, price FROM products LIMIT 1").
		Scan(&product.ProductID, &product.Product, &product.Description, &product.Inventory, &product.Price)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, product)
}

func getOrders(c *gin.Context) {
	rows, err := db.Query(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var order Order
		err := rows.Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, orders)
}

func getOrder(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order ID"})
		return
	}

	var order Order
	err = db.QueryRow(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders WHERE order_id = $1", id).
		Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, order)
}

func restock(c *gin.Context) {
	_, err := db.Exec(context.Background(), "UPDATE products SET inventory = 100")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Restocked successfully"})
}

func reserveInventory(ctx context.Context, _ string) (bool, error) {
	result, err := db.Exec(ctx,
		"UPDATE products SET inventory = inventory - 1 WHERE product_id = $1 AND inventory > 0",
		WIDGET_ID)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func undoReserveInventory(ctx context.Context, _ string) (string, error) {
	_, err := db.Exec(ctx,
		"UPDATE products SET inventory = inventory + 1 WHERE product_id = $1",
		WIDGET_ID)
	return "", err
}

func createOrder(ctx context.Context, _ string) (int, error) {
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

func checkoutEndpoint(c *gin.Context) {
	idempotencyKey := c.Param("idempotency_key")

	// Start the checkout workflow with the idempotency key
	_, err := checkoutWF(context.Background(), "", dbos.WithWorkflowID(idempotencyKey))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.String(http.StatusOK, "")
}
