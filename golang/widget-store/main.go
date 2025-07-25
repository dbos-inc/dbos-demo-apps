package main

import (
	"context"
	"encoding/gob"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"
)

var (
	checkoutWF      = dbos.WithWorkflow(checkoutWorkflow)
	dispatchOrderWF = dbos.WithWorkflow(dispatchOrderWorkflow)
	tempSendWF      = dbos.WithWorkflow(tempSendWorkflow)
)

const WIDGET_ID = 1
const PAYMENT_STATUS = "payment_status"
const PAYMENT_ID = "payment_id"
const ORDER_ID = "order_id"

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

var (
	db     *pgxpool.Pool
	logger *logrus.Logger
)

func main() {
	logger = logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339,
	})
	logger.SetLevel(logrus.InfoLevel)

	dbURL := os.Getenv("DBOS_DATABASE_URL")
	if dbURL == "" {
		logger.Fatal("DBOS_DATABASE_URL required")
	}

	err := dbos.Initialize(dbos.Config{AppName: "widget_store_go", DatabaseURL: os.Getenv("DBOS_DATABASE_URL")})
	if err != nil {
		logger.WithError(err).Fatal("DBOS init failed")
	}

	err = dbos.Launch()
	if err != nil {
		logger.WithError(err).Fatal("DBOS launch failed")
	}
	defer dbos.Shutdown()

	db, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		logger.WithError(err).Fatal("DB connection failed")
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
	r.POST("/payment_webhook/:payment_id/:payment_status", paymentEndpoint)
	r.POST("/crash_application", crashApplication)

	if err := r.Run(":8080"); err != nil {
		logger.WithError(err).Fatal("HTTP server failed")
	}
}

func checkoutWorkflow(ctx context.Context, _ string) (string, error) {
	workflowID, _ := dbos.GetWorkflowID(ctx)

	// Create a new order
	orderID, err := dbos.RunAsStep(ctx, createOrder, "")
	if err != nil {
		logger.WithError(err).WithField("wf_id", workflowID).Error("order create fail")
		return "", err
	}

	// Attempt to reserve inventory, cancelling the order if no inventory remains
	success, err := dbos.RunAsStep(ctx, reserveInventory, "")
	if err != nil || !success {
		logger.WithField("order", orderID).Warn("no inventory")
		dbos.RunAsStep(ctx, updateOrderStatus, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
		err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInput{Key: PAYMENT_ID, Message: ""})
		return "", err
	}

	payment_id, err := dbos.GetWorkflowID(ctx)
	if err != nil {
		logger.WithError(err).WithFields(logrus.Fields{"order": orderID, "wf_id": workflowID}).Error("workflow ID fail")
		return "", err
	}
	err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInput{Key: PAYMENT_ID, Message: payment_id})
	if err != nil {
		logger.WithError(err).WithFields(logrus.Fields{"order": orderID, "payment": payment_id}).Error("event set fail")
		return "", err
	}

	payment_status, err := dbos.Recv[string](ctx, dbos.WorkflowRecvInput{Topic: PAYMENT_STATUS, Timeout: 60 * time.Second})
	if err != nil || payment_status != "paid" {
		logger.WithFields(logrus.Fields{"order": orderID, "payment": payment_id, "status": payment_status}).Warn("payment failed")
		dbos.RunAsStep(ctx, undoReserveInventory, "")
		dbos.RunAsStep(ctx, updateOrderStatus, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: CANCELLED})
	} else {
		logger.WithFields(logrus.Fields{"order": orderID, "payment": payment_id}).Info("payment success")
		dbos.RunAsStep(ctx, updateOrderStatus, UpdateOrderStatusInput{OrderID: orderID, OrderStatus: PAID})
		dispatchOrderWF(ctx, orderID)
	}
	err = dbos.SetEvent(ctx, dbos.WorkflowSetEventInput{Key: ORDER_ID, Message: strconv.Itoa(orderID)})
	if err != nil {
		logger.WithError(err).WithField("order", orderID).Error("order event fail")
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
		logger.WithError(err).Error("product fetch fail")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product"})
		return
	}
	c.JSON(http.StatusOK, product)
}

func getOrders(c *gin.Context) {
	rows, err := db.Query(context.Background(),
		"SELECT order_id, order_status, last_update_time, progress_remaining FROM orders")
	if err != nil {
		logger.WithError(err).Error("orders query fail")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var order Order
		err := rows.Scan(&order.OrderID, &order.OrderStatus, &order.LastUpdateTime, &order.ProgressRemaining)
		if err != nil {
			logger.WithError(err).Error("order scan fail")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process orders"})
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
			logger.WithError(err).WithField("order", id).Error("order query fail")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
		}
		return
	}
	c.JSON(http.StatusOK, order)
}

func restock(c *gin.Context) {
	_, err := db.Exec(context.Background(), "UPDATE products SET inventory = 100")
	if err != nil {
		logger.WithError(err).Error("restock fail")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restock inventory"})
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

func dispatchOrderWorkflow(ctx context.Context, orderID int) (string, error) {
	var t time.Time
	gob.Register(t) // TODO: Should be done automatically
	for range 10 {
		_, err := dbos.Sleep(ctx, time.Second)
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("sleep fail")
			return "", err
		}
		_, err = dbos.RunAsStep(ctx, updateOrderProgress, orderID)
		if err != nil {
			logger.WithError(err).WithField("order", orderID).Error("progress fail")
			return "", err
		}
	}
	return "", nil
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
		logger.WithError(err).WithField("key", idempotencyKey).Error("checkout start fail")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed to start"})
		return
	}

	payment_id, err := dbos.GetEvent[string](c, dbos.WorkflowGetEventInput{TargetWorkflowID: idempotencyKey, Key: PAYMENT_ID, Timeout: 60 * time.Second})
	if err != nil || payment_id == "" {
		logger.WithField("key", idempotencyKey).Error("payment ID not found")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Checkout failed"})
		return
	}

	c.String(http.StatusOK, payment_id)
}

// TODO: You shouldn't need a workflow to run dbos.Send
func tempSendWorkflow(ctx context.Context, input dbos.WorkflowSendInput) (string, error) {
	return "", dbos.Send(ctx, input)
}

func paymentEndpoint(c *gin.Context) {
	paymentID := c.Param("payment_id")
	paymentStatus := c.Param("payment_status")

	_, err := tempSendWF(c, dbos.WorkflowSendInput{DestinationID: paymentID, Topic: PAYMENT_STATUS, Message: paymentStatus})
	if err != nil {
		logger.WithError(err).WithFields(logrus.Fields{"payment": paymentID, "status": paymentStatus}).Error("send fail")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
		return
	}

	orderID, err := dbos.GetEvent[string](c, dbos.WorkflowGetEventInput{TargetWorkflowID: paymentID, Key: ORDER_ID, Timeout: 60 * time.Second})
	if err != nil || orderID == "" {
		logger.WithField("payment", paymentID).Error("order ID not found")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed to process"})
		return
	}

	c.String(http.StatusOK, orderID)
}

func crashApplication(c *gin.Context) {
	logger.Warn("crash requested")
	c.JSON(http.StatusOK, gin.H{"message": "Crashing application..."})
	// Give time for response to be sent
	go func() {
		time.Sleep(100 * time.Millisecond)
		logger.Fatal("intentional crash")
	}()
}
