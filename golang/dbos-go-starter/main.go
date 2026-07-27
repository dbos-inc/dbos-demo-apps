package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	_ "github.com/dbos-inc/dbos-transact-golang/dbos/driver/sqlite"
	"github.com/gin-gonic/gin"
)

const STEPS_EVENT = "steps_event"

const SCHEDULE_NAME = "scheduled-workflow"
const DEFAULT_CRON = "*/5 * * * * *"

const QUEUE_NAME = "demo-queue"
const DEFAULT_WORKER_CONCURRENCY = 3

const APPROVAL_TOPIC = "approval"
const COMM_STATUS_EVENT = "comm_status"

var dbosCtx dbos.Context
var demoQueue dbos.Queue

/*****************************/
/**** WORKFLOWS AND STEPS ****/
/*****************************/

func ExampleWorkflow(ctx dbos.Context, _ string) (string, error) {
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
/**** SCHEDULED WORKFLOW *****/
/*****************************/

// A workflow that runs on a cron schedule. The schedule can be created,
// paused, resumed, and triggered at runtime.
func ScheduledWorkflow(ctx dbos.Context, input dbos.ScheduledWorkflowInput) (any, error) {
	fmt.Printf("%s: Scheduled workflow starting.\n", time.Now().Format(time.RFC3339))
	if _, err := dbos.Sleep(ctx, 1*time.Second); err != nil {
		return nil, err
	}
	fmt.Printf("%s: Scheduled workflow ending.\n", time.Now().Format(time.RFC3339))
	return nil, nil
}

/*****************************/
/**** ENQUEUED WORKFLOW ******/
/*****************************/

// A workflow that runs on a queue with adjustable worker concurrency.
func EnqueuedWorkflow(ctx dbos.Context, _ string) (string, error) {
	fmt.Printf("%s: Enqueued workflow starting.\n", time.Now().Format(time.RFC3339))
	if _, err := dbos.Sleep(ctx, 5*time.Second); err != nil {
		return "", err
	}
	fmt.Printf("%s: Enqueued workflow ending.\n", time.Now().Format(time.RFC3339))
	return "Enqueued workflow completed", nil
}

/*****************************/
/**** COMMUNICATION **********/
/*****************************/

func commStepOne(ctx context.Context) (string, error) {
	time.Sleep(2 * time.Second)
	fmt.Println("Communication workflow: step 1 complete.")
	return "Step 1 completed", nil
}

func commStepTwo(ctx context.Context) (string, error) {
	time.Sleep(2 * time.Second)
	fmt.Println("Communication workflow: step 2 complete.")
	return "Step 2 completed", nil
}

// A human-in-the-loop workflow: it runs step one, then durably waits for an
// approval message before deciding whether to run step two.
func CommunicationWorkflow(ctx dbos.Context, _ string) (string, error) {
	if _, err := dbos.RunAsStep(ctx, commStepOne); err != nil {
		return "", err
	}
	if err := dbos.SetEvent(ctx, COMM_STATUS_EVENT, "waiting"); err != nil {
		return "", err
	}

	decision, err := dbos.Recv[string](ctx, APPROVAL_TOPIC, 120*time.Second)
	if err != nil {
		// The only expected error here is a timeout waiting for approval.
		dbos.SetEvent(ctx, COMM_STATUS_EVENT, "timeout")
		fmt.Println("Communication workflow: timed out waiting for approval.")
		return "timeout", nil
	}

	switch decision {
	case "approve":
		dbos.SetEvent(ctx, COMM_STATUS_EVENT, "step2")
		if _, err := dbos.RunAsStep(ctx, commStepTwo); err != nil {
			return "", err
		}
		dbos.SetEvent(ctx, COMM_STATUS_EVENT, "completed")
		return "completed", nil
	case "deny":
		dbos.SetEvent(ctx, COMM_STATUS_EVENT, "denied")
		fmt.Println("Communication workflow: denied.")
		return "denied", nil
	default:
		dbos.SetEvent(ctx, COMM_STATUS_EVENT, "timeout")
		return "timeout", nil
	}
}

/*****************************/
/**** Main Function **********/
/*****************************/

func main() {
	// Create DBOS context
	var err error
	dbosCtx, err = dbos.NewContext(context.Background(), dbos.Config{
		DatabaseURL:        os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		AppName:            "dbos-go-starter",
		AdminServer:        true,
		ApplicationVersion: "0.1.0",
		ConductorAPIKey:    os.Getenv("DBOS_CONDUCTOR_KEY"),
	})
	if err != nil {
		panic(err)
	}

	// Register workflows
	dbos.RegisterWorkflow(dbosCtx, ExampleWorkflow)
	dbos.RegisterWorkflow(dbosCtx, ScheduledWorkflow, dbos.WithWorkflowName("ScheduledWorkflow"))
	dbos.RegisterWorkflow(dbosCtx, EnqueuedWorkflow, dbos.WithWorkflowName("EnqueuedWorkflow"))
	dbos.RegisterWorkflow(dbosCtx, CommunicationWorkflow, dbos.WithWorkflowName("CommunicationWorkflow"))

	// Launch DBOS
	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown(dbosCtx, 10 * time.Second)

	// Register the demo queue and apply the default schedule (after launch).
	demoQueue, err = dbos.RegisterQueue(dbosCtx, QUEUE_NAME,
		dbos.WithWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY),
		dbos.WithQueueOnConflict(dbos.QueueConflictNeverUpdate),
	)
	if err != nil {
		fmt.Printf("Error registering queue: %s\n", err)
	}

	// Initialize Gin router
	router := gin.Default()

	// HTTP Handlers
	router.StaticFile("/", "./html/app.html")
	router.GET("/workflow/:taskid", workflowHandler)
	router.GET("/last_step/:taskid", lastStepHandler)
	router.POST("/crash", crashHandler)

	// Schedule handlers
	router.GET("/schedule/status", scheduleStatusHandler)
	router.POST("/schedule/apply", scheduleApplyHandler)
	router.POST("/schedule/pause", schedulePauseHandler)
	router.POST("/schedule/resume", scheduleResumeHandler)
	router.POST("/schedule/trigger", scheduleTriggerHandler)

	// Queue handlers
	router.GET("/queue/status", queueStatusHandler)
	router.POST("/queue/enqueue", queueEnqueueHandler)
	router.POST("/queue/concurrency", queueConcurrencyHandler)

	// Communication handlers
	router.GET("/comm/status/:workflowId", commStatusHandler)
	router.POST("/comm/start", commStartHandler)
	router.POST("/comm/approve/:workflowId", commApproveHandler)
	router.POST("/comm/deny/:workflowId", commDenyHandler)

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
		// GetEvent with a zero timeout returns an error until the workflow reaches
		// its first checkpoint and sets the event. Report step 0 in that window
		// rather than erroring, so the frontend shows "executing step 1".
		c.String(http.StatusOK, "0")
		return
	}

	c.String(http.StatusOK, fmt.Sprintf("%d", step))
}

// This endpoint crashes the application. For demonstration purposes only :)
func crashHandler(c *gin.Context) {
	os.Exit(1)
}

// Count workflows grouped by status (matches the frontend summary panels).
func countByStatus(wfs []dbos.WorkflowStatus) map[string]int {
	counts := map[string]int{}
	for _, wf := range wfs {
		counts[string(wf.Status)]++
	}
	return counts
}

/*****************************/
/**** SCHEDULE HANDLERS ******/
/*****************************/

func scheduleStatusHandler(c *gin.Context) {
	cron := DEFAULT_CRON
	scheduleStatus := "UNKNOWN"
	if sched, err := dbos.GetSchedule(dbosCtx, SCHEDULE_NAME); err == nil {
		cron = sched.Schedule
		scheduleStatus = string(sched.Status)
	}

	wfs, _ := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName("ScheduledWorkflow"),
		dbos.WithFilterCreatedAfter(time.Now().Add(-10*time.Minute)),
		dbos.WithFilterLimit(500),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)

	c.JSON(http.StatusOK, gin.H{
		"cron":            cron,
		"schedule_status": scheduleStatus,
		"workflow_counts": countByStatus(wfs),
	})
}

func scheduleApplyHandler(c *gin.Context) {
	var body struct {
		Cron string `json:"cron"`
	}
	_ = c.ShouldBindJSON(&body)
	cron := body.Cron
	if cron == "" {
		cron = DEFAULT_CRON
	}

	if err := dbos.ApplySchedules(dbosCtx, []dbos.ScheduleSpec{{
		ScheduleName: SCHEDULE_NAME,
		Workflow:     ScheduledWorkflow,
		Schedule:     cron,
	}}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Explicitly resume so Apply always leaves the schedule active.
	_ = dbos.ResumeSchedule(dbosCtx, SCHEDULE_NAME)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func schedulePauseHandler(c *gin.Context) {
	if err := dbos.PauseSchedule(dbosCtx, SCHEDULE_NAME); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func scheduleResumeHandler(c *gin.Context) {
	if err := dbos.ResumeSchedule(dbosCtx, SCHEDULE_NAME); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func scheduleTriggerHandler(c *gin.Context) {
	if _, err := dbos.TriggerSchedule[any](dbosCtx, SCHEDULE_NAME); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/*****************************/
/**** QUEUE HANDLERS *********/
/*****************************/

func queueStatusHandler(c *gin.Context) {
	workerConcurrency := DEFAULT_WORKER_CONCURRENCY
	if q, err := dbos.RetrieveQueue(dbosCtx, QUEUE_NAME); err == nil && q != nil {
		if wc := q.GetWorkerConcurrency(); wc != nil {
			workerConcurrency = *wc
		}
	}

	wfs, _ := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName("EnqueuedWorkflow"),
		dbos.WithFilterCreatedAfter(time.Now().Add(-10*time.Minute)),
		dbos.WithFilterLimit(500),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)

	c.JSON(http.StatusOK, gin.H{
		"worker_concurrency": workerConcurrency,
		"workflow_counts":    countByStatus(wfs),
	})
}

func queueEnqueueHandler(c *gin.Context) {
	_, err := dbos.RunWorkflow(dbosCtx, EnqueuedWorkflow, "", dbos.WithQueue(demoQueue))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func queueConcurrencyHandler(c *gin.Context) {
	var body struct {
		Concurrency int `json:"concurrency"`
	}
	_ = c.ShouldBindJSON(&body)
	concurrency := body.Concurrency
	if concurrency < 1 {
		concurrency = DEFAULT_WORKER_CONCURRENCY
	}

	if _, err := dbos.RegisterQueue(dbosCtx, QUEUE_NAME,
		dbos.WithWorkerConcurrency(concurrency),
		dbos.WithQueueOnConflict(dbos.QueueConflictAlwaysUpdate),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/*****************************/
/**** COMMUNICATION HANDLERS */
/*****************************/

func commStatusHandler(c *gin.Context) {
	workflowID := c.Param("workflowId")
	state, err := dbos.GetEvent[string](dbosCtx, workflowID, COMM_STATUS_EVENT, 0)
	if err != nil || state == "" {
		state = "step1"
	}
	c.JSON(http.StatusOK, gin.H{"state": state})
}

func commStartHandler(c *gin.Context) {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	wfID := hex.EncodeToString(b)

	_, err := dbos.RunWorkflow(dbosCtx, CommunicationWorkflow, "", dbos.WithWorkflowID(wfID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"workflow_id": wfID})
}

func commApproveHandler(c *gin.Context) {
	workflowID := c.Param("workflowId")
	if err := dbos.Send(dbosCtx, workflowID, "approve", APPROVAL_TOPIC); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func commDenyHandler(c *gin.Context) {
	workflowID := c.Param("workflowId")
	if err := dbos.Send(dbosCtx, workflowID, "deny", APPROVAL_TOPIC); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
