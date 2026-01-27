package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	db     *pgxpool.Pool
	logger *slog.Logger
)

func main() {
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	dbURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if dbURL == "" {
		logger.Error("DBOS_SYSTEM_DATABASE_URL required")
		os.Exit(1)
	}

	dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		AppName:            "gogogo",
		DatabaseURL:        os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		AdminServer:        true,
		Logger:             logger,
		ConductorAPIKey:    os.Getenv("DBOS_CONDUCTOR_API_KEY"),
		ApplicationVersion: "0.1.0",
	})
	if err != nil {
		logger.Error("DBOS initialization failed", "error", err)
		os.Exit(1)
	}
	dbos.RegisterWorkflow(dbosContext, checkoutWorkflow)
	dbos.RegisterWorkflow(dbosContext, dispatchOrderWorkflow)

	err = dbosContext.Launch()
	if err != nil {
		logger.Error("DBOS service start failed", "error", err)
		os.Exit(1)
	}
	defer dbosContext.Shutdown(10 * time.Second)

	db, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
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
		logger.Error("HTTP server start failed", "error", err)
		os.Exit(1)
	}
}
