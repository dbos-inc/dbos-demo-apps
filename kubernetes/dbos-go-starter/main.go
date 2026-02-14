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

const STEPS_EVENT = "steps_event"

// ExampleWorkflow runs three sequential steps, reporting progress via events.
func ExampleWorkflow(ctx dbos.DBOSContext, _ string) (string, error) {
	for i, step := range []func(context.Context) (string, error){stepOne, stepTwo, stepThree} {
		_, err := dbos.RunAsStep(ctx, step)
		if err != nil {
			return "", err
		}
		if err := dbos.SetEvent(ctx, STEPS_EVENT, i+1); err != nil {
			return "", err
		}
	}
	return "Workflow completed", nil
}

func stepOne(ctx context.Context) (string, error) {
	time.Sleep(5 * time.Second)
	fmt.Println("Step one completed!")
	return "Step 1 completed", nil
}

func stepTwo(ctx context.Context) (string, error) {
	time.Sleep(5 * time.Second)
	fmt.Println("Step two completed!")
	return "Step 2 completed", nil
}

func stepThree(ctx context.Context) (string, error) {
	time.Sleep(5 * time.Second)
	fmt.Println("Step three completed!")
	return "Step 3 completed", nil
}

// SleepWorkflow is a queue-friendly workflow for KEDA scaling demos.
func SleepWorkflow(ctx dbos.DBOSContext, durationSeconds int) (string, error) {
	dbos.Sleep(ctx, time.Duration(durationSeconds)*time.Second)
	return fmt.Sprintf("Slept for %d seconds", durationSeconds), nil
}

func main() {
	dbosCtx, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		AppName:            "dbos-app",
		DatabaseURL:        os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		ConductorURL:       os.Getenv("DBOS_CONDUCTOR_URL"),
		ConductorAPIKey:    os.Getenv("DBOS_CONDUCTOR_KEY"),
		ApplicationVersion: "0.1.0",
	})
	if err != nil {
		panic(fmt.Sprintf("Initializing DBOS failed: %v", err))
	}

	queue := dbos.NewWorkflowQueue(dbosCtx, "taskQueue", dbos.WithWorkerConcurrency(2))

	dbos.RegisterWorkflow(dbosCtx, ExampleWorkflow)
	dbos.RegisterWorkflow(dbosCtx, SleepWorkflow)

	if err := dbos.Launch(dbosCtx); err != nil {
		panic(fmt.Sprintf("Launching DBOS failed: %v", err))
	}
	defer dbos.Shutdown(dbosCtx, 10*time.Second)

	r := gin.Default()

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	// Run the three-step example workflow
	r.GET("/workflow/:taskid", func(c *gin.Context) {
		taskID := c.Param("taskid")
		_, err := dbos.RunWorkflow(dbosCtx, ExampleWorkflow, "", dbos.WithWorkflowID(taskID))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"workflow_id": taskID, "status": "started"})
	})

	// Get the last completed step for a workflow
	r.GET("/last_step/:taskid", func(c *gin.Context) {
		taskID := c.Param("taskid")
		step, err := dbos.GetEvent[int](dbosCtx, taskID, STEPS_EVENT, 0)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"last_step": step})
	})

	// Enqueue a sleep workflow (for KEDA scaling demos)
	r.GET("/enqueue/:duration", func(c *gin.Context) {
		duration, err := strconv.Atoi(c.Param("duration"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid duration"})
			return
		}
		handle, err := dbos.RunWorkflow(dbosCtx, SleepWorkflow, duration, dbos.WithQueue(queue.Name))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"workflow_id": handle.GetWorkflowID(), "duration": duration})
	})

	// Metrics endpoint for KEDA — returns current queue length
	r.GET("/metrics/:queueName", func(c *gin.Context) {
		queueName := c.Param("queueName")
		workflows, err := dbos.ListWorkflows(dbosCtx, dbos.WithQueuesOnly(), dbos.WithQueueName(queueName))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"queue_length": len(workflows)})
	})

	fmt.Println("Server starting on :8080")
	r.Run(":8080")
}
