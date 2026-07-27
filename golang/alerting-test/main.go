package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	_ "github.com/dbos-inc/dbos-transact-golang/dbos/driver/sqlite"
	"github.com/gin-gonic/gin"
)

var (
	logger      *slog.Logger
	dbosContext dbos.Context
	alertQueue  dbos.Queue
)

// alertWorkflow simulates a long-running workflow that can be monitored for alerting.
// It sleeps for the given duration (in seconds, default 60) then completes.
func alertWorkflow(ctx dbos.Context, durationSecs int) (string, error) {
	if durationSecs <= 0 {
		durationSecs = 60
	}
	wfID, _ := ctx.GetWorkflowID()
	logger.Info("alert workflow started", "workflow_id", wfID, "duration_secs", durationSecs)

	_, err := dbos.Sleep(ctx, time.Duration(durationSecs)*time.Second)
	if err != nil {
		return "", err
	}

	_, err = dbos.Sleep(ctx, 1*time.Second)
	if err != nil {
		return "", err
	}

	logger.Info("alert workflow completed", "workflow_id", wfID)
	return "done", nil
}

type EnqueueRequest struct {
	DurationSecs int    `json:"duration_secs"`
	WorkflowID   string `json:"workflow_id"`
}

func enqueueHandler(c *gin.Context) {
	var req EnqueueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Use defaults if no body provided
		req.DurationSecs = 60
	}

	opts := []dbos.WorkflowOption{dbos.WithQueue(alertQueue)}
	if req.WorkflowID != "" {
		opts = append(opts, dbos.WithWorkflowID(req.WorkflowID))
	}

	handle, err := dbos.RunWorkflow(dbosContext, alertWorkflow, req.DurationSecs, opts...)
	if err != nil {
		logger.Error("failed to enqueue workflow", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"workflow_id":   handle.GetWorkflowID(),
		"queue":         alertQueue.GetName(),
		"duration_secs": req.DurationSecs,
	})
}

func main() {
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	dbURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if dbURL == "" {
		logger.Error("DBOS_SYSTEM_DATABASE_URL required")
		os.Exit(1)
	}

	conductorAPIKey := os.Getenv("DBOS_CONDUCTOR_API_KEY")
	if conductorAPIKey == "" {
		conductorAPIKey = "dbos_200239b0-0c53-4b02-b5ea-f1239eae0125_ae53cc89-ae7d-4a42-9b41-a649c590e601"
	}

	var err error
	dbosContext, err = dbos.NewContext(context.Background(), dbos.Config{
		AppName:            "alerting",
		DatabaseURL:        dbURL,
		AdminServer:        true,
		Logger:             logger,
		ConductorAPIKey:    conductorAPIKey,
		ApplicationVersion: "0.1.0",
	})
	if err != nil {
		logger.Error("DBOS initialization failed", "error", err)
		os.Exit(1)
	}

	dbos.RegisterWorkflow(dbosContext, alertWorkflow)
	alertQueue, err = dbos.RegisterQueue(dbosContext, "alert-queue", dbos.WithGlobalConcurrency(1))
	if err != nil {
		logger.Error("queue registration failed", "error", err)
		os.Exit(1)
	}
	dbos.SetAlertHandler(dbosContext, func(name string, message string, metadata map[string]string) {
		fmt.Printf("ALERT RECEIVED — NAME: %s | MESSAGE: %s | METADATA: %v\n",
			strings.ToUpper(name), strings.ToUpper(message), metadata)
	})

	if err = dbosContext.Launch(); err != nil {
		logger.Error("DBOS service start failed", "error", err)
		os.Exit(1)
	}
	defer dbos.Shutdown(dbosContext, 10 * time.Second)

	r := gin.Default()
	r.POST("/enqueue", enqueueHandler)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	if err := r.Run(":8080"); err != nil {
		logger.Error("HTTP server start failed", "error", err)
		os.Exit(1)
	}
}
