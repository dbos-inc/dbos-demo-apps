package main

import (
	"context"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"
)

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

	dbURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if dbURL == "" {
		logger.Fatal("DBOS_SYSTEM_DATABASE_URL required")
	}

	dbosContext, err := dbos.NewDBOSContext(dbos.Config{
		AppName:     "widget_store_go",
		DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
	})
	if err != nil {
		logger.WithError(err).Fatal("DBOS initialization failed")
	}
	dbos.RegisterWorkflow(dbosContext, checkoutWorkflow)
	dbos.RegisterWorkflow(dbosContext, dispatchOrderWorkflow)

	err = dbosContext.Launch()
	if err != nil {
		logger.WithError(err).Fatal("DBOS service start failed")
	}
	defer dbosContext.Cancel()

	db, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		logger.WithError(err).Fatal("database connection failed")
	}
	defer db.Close()

	r := gin.Default()

	// Serve HTML
	r.StaticFile("/", "./html/app.html")

	// HTTP endpoints
	r.GET("/product", func(c *gin.Context) { getProduct(c, db, logger) })
	r.GET("/orders", func(c *gin.Context) { getOrders(c, db, logger) })
	r.GET("/order/:id", func(c *gin.Context) { getOrder(c, db, logger) })
	r.POST("/restock", func(c *gin.Context) { restock(c, db, logger) })
	r.POST("/checkout/:idempotency_key", func(c *gin.Context) { checkoutEndpoint(c, dbosContext, logger) })
	r.POST("/payment_webhook/:payment_id/:payment_status", func(c *gin.Context) { paymentEndpoint(c, dbosContext, logger) })
	r.POST("/crash_application", func(c *gin.Context) { crashApplication(c, logger) })

	if err := r.Run(":8080"); err != nil {
		logger.WithError(err).Fatal("HTTP server start failed")
	}
}
