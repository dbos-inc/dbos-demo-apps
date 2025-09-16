package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
)

const STEPS_EVENT = "steps_event"

var dbosCtx dbos.DBOSContext

/*****************************/
/**** WORKFLOWS AND STEPS ****/
/*****************************/

func ExampleWorkflow(ctx dbos.DBOSContext, _ string) (string, error) {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
		return stepOne(stepCtx)
	})
	if err != nil {
		return "", err
	}
	err = dbos.SetEvent(ctx, STEPS_EVENT, 1)
	if err != nil {
		return "", err
	}
	_, err = dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
		return stepTwo(stepCtx)
	})
	if err != nil {
		return "", err
	}
	err = dbos.SetEvent(ctx, STEPS_EVENT, 2)
	if err != nil {
		return "", err
	}
	_, err = dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
		return stepThree(stepCtx)
	})
	if err != nil {
		return "", err
	}
	err = dbos.SetEvent(ctx, STEPS_EVENT, 3)
	if err != nil {
		return "", err
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

/*****************************/
/**** Main Function **********/
/*****************************/

func main() {
	// Create DBOS context
	var err error
	dbosCtx, err = dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		AppName:     "dbos-toolbox",
		AdminServer: true,
	})
	if err != nil {
		panic(err)
	}

	// Register workflows
	dbos.RegisterWorkflow(dbosCtx, ExampleWorkflow)

	// Launch DBOS
	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbosCtx.Shutdown(10 * time.Second)

	// Initialize Gin router
	router := gin.Default()

	// HTTP Handlers
	router.StaticFile("/", "./html/app.html")
	router.GET("/workflow/:taskid", workflowHandler)
	router.GET("/last_step/:taskid", lastStepHandler)
	router.POST("/crash", crashHandler)

	fmt.Println("Server starting on http://localhost:8080")
	err = router.Run(":8080")
	if err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}

/*****************************/
/**** HTTP HANDLERS **********/
/*****************************/

func workflowHandler(c *gin.Context) {
	taskID := c.Param("taskid")

	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Task ID is required"})
		return
	}

	_, err := dbos.RunWorkflow(dbosCtx, ExampleWorkflow, "", dbos.WithWorkflowID(taskID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
}

func lastStepHandler(c *gin.Context) {
	taskID := c.Param("taskid")

	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Task ID is required"})
		return
	}

	step, err := dbos.GetEvent[int](dbosCtx, taskID, STEPS_EVENT, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.String(http.StatusOK, fmt.Sprintf("%d", step))
}

// This endpoint crashes the application. For demonstration purposes only :)
func crashHandler(c *gin.Context) {
	os.Exit(1)
}
