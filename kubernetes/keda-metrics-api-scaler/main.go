package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
)

// SleepWorkflowInput defines the input for the sleep workflow
type SleepWorkflowInput struct {
	DurationSeconds int `json:"duration_seconds"`
}

// MetricsResponse represents the response from the /metrics endpoint
type MetricsResponse struct {
	QueueLength int `json:"queue_length"`
}

// WorkflowQueueMetadata represents the queue metadata from the admin endpoint
type WorkflowQueueMetadata struct {
	WorkerConcurrency int `json:"worker_concurrency"`
}

// SleepWorkflow sleeps for the configured duration
func SleepWorkflow(ctx dbos.DBOSContext, input SleepWorkflowInput) (string, error) {
	duration := time.Duration(input.DurationSeconds) * time.Second
	dbos.Sleep(ctx, duration)
	return fmt.Sprintf("Slept for %d seconds", input.DurationSeconds), nil
}

func main() {
	dbosContext, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		AppName:     "dbos-starter",
		DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
	})
	if err != nil {
		panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
	}

	// Create queue with worker concurrency = 10
	queue := dbos.NewWorkflowQueue(dbosContext, "queueName", dbos.WithWorkerConcurrency(2))

	// Register the sleep workflow
	dbos.RegisterWorkflow(dbosContext, SleepWorkflow)

	err = dbos.Launch(dbosContext)
	if err != nil {
		panic(fmt.Sprintf("Launching DBOS failed: %v", err))
	}
	defer dbos.Shutdown(dbosContext, 5*time.Second)

	r := gin.Default()

	// Metrics endpoint for KEDA autoscaling - accepts queue name as URL parameter
	r.GET("/metrics/:queueName", func(c *gin.Context) {
		queueName := c.Param("queueName")
		workflows, err := dbos.ListWorkflows(dbosContext, dbos.WithQueuesOnly(), dbos.WithQueueName(queueName))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error computing metrics: %v", err)})
			return
		}

		c.JSON(http.StatusOK, MetricsResponse{QueueLength: len(workflows)})
	})

	// Handler to enqueue a workflow with configurable sleep duration
	r.GET("/enqueue/:duration", func(c *gin.Context) {
		// Get duration from URL path parameter
		durationStr := c.Param("duration")
		duration, err := strconv.Atoi(durationStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid duration: %v", err)})
			return
		}

		input := SleepWorkflowInput{
			DurationSeconds: duration,
		}

		handle, err := dbos.RunWorkflow(dbosContext, SleepWorkflow, input, dbos.WithQueue(queue.Name))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error enqueuing workflow: %v", err)})
			return
		}

		workflowID := handle.GetWorkflowID()

		c.JSON(http.StatusOK, gin.H{
			"message":     "Workflow enqueued successfully",
			"workflow_id": workflowID,
			"duration":    input.DurationSeconds,
		})
	})

	r.Run(":8000")
}
