package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
)

const STEPS_EVENT = "steps_event"
const WORKER_CONCURRENCY = 5

var dbosCtx dbos.DBOSContext
var taskQueue dbos.WorkflowQueue

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

func ScheduledWorkflow(ctx dbos.DBOSContext, scheduledTime time.Time) (string, error) {
	fmt.Printf("Scheduled workflow triggered at: %s\n", scheduledTime.Format(time.RFC3339))
	for i := 0; i < 20; i++ {
		_, err := dbos.RunWorkflow(ctx, ExampleWorkflow, "", dbos.WithQueue(taskQueue.Name))
		if err != nil {
			return "", err
		}
	}
	return "Enqueued 20 workflows", nil
}

/*****************************/
/**** AUTOSCALING ************/
/*****************************/

func ScalingWorkflow(ctx dbos.DBOSContext, scheduledTime time.Time) (string, error) {
	fmt.Printf("Scaling workflow triggered at: %s\n", scheduledTime.Format(time.RFC3339))

	// 1. Read queue length by listing all enqueued/pending workflows on our queue
	workflows, err := dbos.ListWorkflows(ctx, dbos.WithQueuesOnly(), dbos.WithQueueName(taskQueue.Name))
	if err != nil {
		return "", fmt.Errorf("failed to list workflows: %w", err)
	}
	qlen := len(workflows)

	// 2. Get the current number of instances in the worker pool
	currentInstances, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (int, error) {
		return getWorkerPoolInstances(stepCtx)
	})
	if err != nil {
		return "", fmt.Errorf("failed to get current instances: %w", err)
	}

	// Calculate desired instances: queue depth / worker concurrency
	desiredInstances := int(math.Ceil(float64(qlen) / float64(WORKER_CONCURRENCY)))
	if desiredInstances < 1 {
		desiredInstances = 1
	}

	fmt.Printf("Queue depth: %d, current instances: %d, desired instances: %d\n", qlen, currentInstances, desiredInstances)

	// 3. Set the number of workers if it differs from current
	if desiredInstances != currentInstances {
		result, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (string, error) {
			return setWorkerPoolInstances(stepCtx, desiredInstances)
		})
		if err != nil {
			fmt.Printf("ERROR scaling worker pool: %v\n", err)
			return "", fmt.Errorf("failed to set instances: %w", err)
		}
		fmt.Printf("Scaled worker pool: %s\n", result)
	}

	return fmt.Sprintf("qlen=%d, instances=%d", qlen, desiredInstances), nil
}

// getInstanceID retrieves the unique instance ID from the GCE metadata server.
func getInstanceID() (string, error) {
	req, err := http.NewRequest("GET",
		"http://metadata.google.internal/computeMetadata/v1/instance/id", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Metadata-Flavor", "Google")

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// getAccessToken retrieves an access token from the GCE metadata server.
func getAccessToken() (string, error) {
	req, err := http.NewRequest("GET",
		"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Metadata-Flavor", "Google")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("metadata request failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode token: %w", err)
	}
	return tokenResp.AccessToken, nil
}

// workerPoolURL returns the Cloud Run Admin v2 API URL for the worker pool.
func workerPoolURL() string {
	return fmt.Sprintf("https://run.googleapis.com/v2/projects/%s/locations/%s/workerPools/%s",
		os.Getenv("GCP_PROJECT_ID"),
		os.Getenv("GCP_REGION"),
		os.Getenv("WORKER_POOL_NAME"),
	)
}

// getWorkerPoolInstances retrieves the current instance count from the Cloud Run v2 API.
func getWorkerPoolInstances(ctx context.Context) (int, error) {
	token, err := getAccessToken()
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequest("GET", workerPoolURL(), nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("GET worker pool failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("GET worker pool returned %d: %s", resp.StatusCode, string(body))
	}

	var wp struct {
		Scaling struct {
			ManualInstanceCount int `json:"manualInstanceCount"`
		} `json:"scaling"`
	}
	if err := json.Unmarshal(body, &wp); err != nil {
		return 0, fmt.Errorf("failed to parse worker pool response: %w", err)
	}

	if wp.Scaling.ManualInstanceCount == 0 {
		return 1, nil
	}
	return wp.Scaling.ManualInstanceCount, nil
}

// setWorkerPoolInstances updates the worker pool's instance count via the Cloud Run v2 API.
func setWorkerPoolInstances(ctx context.Context, instances int) (string, error) {
	token, err := getAccessToken()
	if err != nil {
		return "", err
	}

	patch := map[string]interface{}{
		"scaling": map[string]interface{}{
			"manualInstanceCount": instances,
		},
		"launchStage": "BETA",
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return "", err
	}

	url := workerPoolURL() + "?updateMask=scaling,launchStage"
	req, err := http.NewRequest("PATCH", url, bytes.NewReader(patchBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("PATCH worker pool failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("PATCH worker pool returned %d: %s", resp.StatusCode, string(body))
	}

	fmt.Printf("Successfully set worker pool instances to %d\n", instances)
	return fmt.Sprintf("Set instances to %d", instances), nil
}

func stepOne(ctx context.Context) (string, error) {
	time.Sleep(1 * time.Second)
	fmt.Println("Step one completed!")
	return "Step 1 completed", nil
}

func stepTwo(ctx context.Context) (string, error) {
	time.Sleep(1 * time.Second)
	fmt.Println("Step two completed!")
	return "Step 2 completed", nil
}

func stepThree(ctx context.Context) (string, error) {
	time.Sleep(1 * time.Second)
	fmt.Println("Step three completed!")
	return "Step 3 completed", nil
}

/*****************************/
/**** Main Function **********/
/*****************************/

func main() {
	// Create DBOS context
	var err error

	// 1. Get the instance ID from the GCE metadata server (unique per container)
	executorID, err := getInstanceID()
	if err != nil {
		fmt.Printf("WARN: could not get instance ID, using hostname: %v\n", err)
		executorID, _ = os.Hostname()
	}

	// 2. Get the raw password from the Env Var injected by Cloud Run
	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		panic(fmt.Errorf("DB_PASSWORD environment variable is required"))
	}

	// 2. Construct the DSN (Data Source Name)
	// We use Sprintf to inject the runtime secret into the template
	dsn := fmt.Sprintf("user=%s password=%s database=%s host=%s",
		os.Getenv("DB_USER"),
		dbPassword, // <--- Injected here
		os.Getenv("DB_NAME"),
		os.Getenv("INSTANCE_UNIX_SOCKET"),
	)

	dbosCtx, err = dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL:        dsn,
		AppName:            "cloudrun-go",
		AdminServer:        true,
		ApplicationVersion: os.Getenv("K_REVISION"),
		ExecutorID:         executorID,
		ConductorAPIKey:    os.Getenv("DBOS_CONDUCTOR_KEY"),
	})
	if err != nil {
		panic(err)
	}

	// Create queue and register workflows
	taskQueue = dbos.NewWorkflowQueue(dbosCtx, "task_queue", dbos.WithWorkerConcurrency(WORKER_CONCURRENCY))
	dbos.RegisterWorkflow(dbosCtx, ExampleWorkflow)
	dbos.RegisterWorkflow(dbosCtx, ScheduledWorkflow, dbos.WithSchedule("0 */1 * * * *"))
	dbos.RegisterWorkflow(dbosCtx, ScalingWorkflow, dbos.WithSchedule("*/30 * * * * *"))

	// Launch DBOS
	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbosCtx.Shutdown(10 * time.Second)

	// Initialize Gin router
	gin.SetMode(gin.ReleaseMode)
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
