package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	mrand "math/rand/v2"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
)

const STEPS_EVENT = "steps_event"

const SCHEDULE_NAME = "scheduled-workflow"
const DEFAULT_CRON = "*/5 * * * * *"

const QUEUE_NAME = "demo-queue"
const DEFAULT_WORKER_CONCURRENCY = 3

const RATE_LIMITED_QUEUE_NAME = "rate-limited-queue"
const DEFAULT_RATE_LIMIT = 2
const DEFAULT_RATE_PERIOD = 10 * time.Second

const FAIR_QUEUE_NAME = "fair-queue"
const DEFAULT_PARTITION_CONCURRENCY = 1
const DEFAULT_FAIR_WORKER_CONCURRENCY = 4

// The tenants the frontend offers. The random mix draws from the first four,
// leaving "ed" free to show a newcomer isn't stuck behind their backlog.
var FAIR_QUEUE_TENANTS = []string{"alice", "bob", "clark", "dave", "ed"}

const DELAYED_QUEUE_NAME = "delayed-queue"

// The longest delay the demo accepts: one day. DBOS itself has no hard limit.
const MAX_DELAY_SECONDS = 24 * 60 * 60

var DELAY_ERROR = fmt.Sprintf("delay must be a whole number of seconds from 1 to %d", MAX_DELAY_SECONDS)

const APPROVAL_TOPIC = "approval"
const COMM_STATUS_EVENT = "comm_status"

var dbosCtx dbos.Context
var demoQueue, rateLimitedQueue, fairQueue, delayedQueue dbos.Queue

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
/**** QUEUE WORKFLOW *********/
/*****************************/

// Every Queues sub-page enqueues this same workflow, each on its own queue,
// so the differences you see come from the queues alone.
func QueueWorkflow(ctx dbos.Context, _ string) (string, error) {
	_, err := dbos.Sleep(ctx, 5*time.Second)
	return "", err
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

	decision, err := dbos.Recv[string](ctx, APPROVAL_TOPIC, 15*time.Second)
	if errors.Is(err, dbos.ErrTimeout) {
		// Returning an error ends the workflow in the ERROR state.
		return "", errors.New("timed out waiting for approval")
	} else if err != nil {
		return "", err
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
		return "", fmt.Errorf("unexpected decision %q", decision)
	}
}

/*****************************/
/**** Main Function **********/
/*****************************/

// Register a queue, or exit if the queue can't be registered.
func mustRegisterQueue(name string, options ...dbos.QueueOption) dbos.Queue {
	queue, err := dbos.RegisterQueue(dbosCtx, name, options...)
	if err != nil {
		panic(fmt.Sprintf("registering queue %s: %s", name, err))
	}
	return queue
}

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
	dbos.RegisterWorkflow(dbosCtx, QueueWorkflow, dbos.WithWorkflowName("QueueWorkflow"))
	dbos.RegisterWorkflow(dbosCtx, CommunicationWorkflow, dbos.WithWorkflowName("CommunicationWorkflow"))

	// Launch DBOS
	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown(dbosCtx, 10*time.Second)

	// Register the demo queues (after launch). QueueConflictNeverUpdate keeps any
	// settings changed at runtime across restarts.
	neverUpdate := dbos.WithQueueOnConflict(dbos.QueueConflictNeverUpdate)
	demoQueue = mustRegisterQueue(QUEUE_NAME,
		dbos.WithWorkerConcurrency(DEFAULT_WORKER_CONCURRENCY), neverUpdate)
	rateLimitedQueue = mustRegisterQueue(RATE_LIMITED_QUEUE_NAME,
		dbos.WithRateLimiter(&dbos.RateLimiter{Limit: DEFAULT_RATE_LIMIT, Period: DEFAULT_RATE_PERIOD}), neverUpdate)
	fairQueue = mustRegisterQueue(FAIR_QUEUE_NAME,
		dbos.WithPartitionConcurrency(DEFAULT_PARTITION_CONCURRENCY),
		dbos.WithWorkerConcurrency(DEFAULT_FAIR_WORKER_CONCURRENCY), neverUpdate)
	delayedQueue = mustRegisterQueue(DELAYED_QUEUE_NAME, neverUpdate)

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

	// Queue handlers: worker concurrency
	router.GET("/queue/status", queueStatusHandler)
	router.POST("/queue/enqueue", queueEnqueueHandler)
	router.POST("/queue/concurrency", queueConcurrencyHandler)

	// Queue handlers: rate limiting
	router.GET("/queue/rate/status", rateStatusHandler)
	router.POST("/queue/rate/enqueue", rateEnqueueHandler)
	router.POST("/queue/rate/limit", rateLimitHandler)

	// Queue handlers: fair queues
	router.GET("/queue/fair/status", fairStatusHandler)
	router.POST("/queue/fair/enqueue", fairEnqueueHandler)
	router.POST("/queue/fair/random_mix", fairRandomMixHandler)
	router.POST("/queue/fair/limits", fairLimitsHandler)

	// Queue handlers: delays
	router.GET("/queue/delay/status", delayStatusHandler)
	router.POST("/queue/delay/enqueue", delayEnqueueHandler)
	router.POST("/queue/delay/set/:workflowId", delaySetHandler)

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

/*****************************/
/**** HELPERS ****************/
/*****************************/

// Count workflows grouped by status (matches the frontend summary panels).
func countByStatus(wfs []dbos.WorkflowStatus) map[string]int {
	counts := map[string]int{}
	for _, wf := range wfs {
		counts[string(wf.Status)]++
	}
	return counts
}

// Count workflows per tenant. Each workflow's partition key is its tenant.
func countByTenant(wfs []dbos.WorkflowStatus) []gin.H {
	var tenants []string
	counts := map[string]int{}
	for _, wf := range wfs {
		tenant := wf.QueuePartitionKey
		if tenant == "" {
			tenant = "unknown"
		}
		if counts[tenant] == 0 {
			tenants = append(tenants, tenant)
		}
		counts[tenant]++
	}
	rows := []gin.H{}
	for _, tenant := range tenants {
		rows = append(rows, gin.H{"tenant_id": tenant, "count": counts[tenant]})
	}
	return rows
}

// Workflows on the given queue started in the last 10 minutes, newest first.
func recentOnQueue(queueName string) []dbos.WorkflowStatus {
	wfs, _ := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterQueueName(queueName),
		dbos.WithFilterCreatedAfter(time.Now().Add(-10*time.Minute)),
		dbos.WithFilterSortDesc(),
		dbos.WithFilterLimit(500),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)
	return wfs
}

// Workflows on the given queue in any of the given states, newest first.
func onQueue(queueName string, statuses ...dbos.WorkflowStatusType) []dbos.WorkflowStatus {
	wfs, _ := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterQueueName(queueName),
		dbos.WithFilterStatus(statuses...),
		dbos.WithFilterSortDesc(),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)
	return wfs
}

// Look up one workflow's status, including its error if it failed.
func workflowStatus(workflowID string) (dbos.WorkflowStatus, bool) {
	wfs, err := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterWorkflowIDs(workflowID),
		dbos.WithFilterLoadInput(false),
	)
	if err != nil || len(wfs) == 0 {
		return dbos.WorkflowStatus{}, false
	}
	return wfs[0], true
}

// Milliseconds since the epoch, or nil for an unset time.
func epochMillis(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t.UnixMilli()
}

// The request's JSON body as a map, or an empty map if it has none.
func bodyMap(c *gin.Context) map[string]any {
	body := map[string]any{}
	_ = c.ShouldBindJSON(&body)
	return body
}

// Parse a request field (a JSON number or string) as an integer >= 1.
func parsePositiveInt(value any) (int, bool) {
	var n float64
	switch v := value.(type) {
	case float64:
		n = v
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return 0, false
		}
		n = f
	default:
		return 0, false
	}
	if n < 1 || n > math.MaxInt32 || n != math.Trunc(n) {
		return 0, false
	}
	return int(n), true
}

// Parse a request field as a trimmed name of 1 to 40 characters.
func parseName(value any) (string, bool) {
	s, _ := value.(string)
	s = strings.TrimSpace(s)
	return s, s != "" && utf8.RuneCountInString(s) <= 40
}

// Parse a request field as a whole number of seconds from 1 to MAX_DELAY_SECONDS.
func parseDelaySeconds(value any) (int, bool) {
	n, ok := parsePositiveInt(value)
	return n, ok && n <= MAX_DELAY_SECONDS
}

func respondError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
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

// ---- Worker concurrency: a queue with adjustable worker concurrency ----

func queueStatusHandler(c *gin.Context) {
	workerConcurrency := DEFAULT_WORKER_CONCURRENCY
	if q, err := dbos.RetrieveQueue(dbosCtx, QUEUE_NAME); err == nil && q != nil {
		if wc := q.GetWorkerConcurrency(); wc != nil {
			workerConcurrency = *wc
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"worker_concurrency": workerConcurrency,
		"workflow_counts":    countByStatus(recentOnQueue(QUEUE_NAME)),
	})
}

func queueEnqueueHandler(c *gin.Context) {
	_, err := dbos.RunWorkflow(dbosCtx, QueueWorkflow, "", dbos.WithQueue(demoQueue))
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

// ---- Rate limiting: a queue that starts at most Limit workflows every
// Period. The rate limit can be changed at runtime. ----

func rateStatusHandler(c *gin.Context) {
	limit, period := DEFAULT_RATE_LIMIT, DEFAULT_RATE_PERIOD
	if q, err := dbos.RetrieveQueue(dbosCtx, RATE_LIMITED_QUEUE_NAME); err == nil && q != nil {
		if rl := q.GetRateLimit(); rl != nil {
			limit, period = rl.Limit, rl.Period
		}
	}

	wfs := recentOnQueue(RATE_LIMITED_QUEUE_NAME)
	// The newest workflows. started_at is when the queue let each one start,
	// so the gaps between start times show the rate limit at work.
	workflows := []gin.H{}
	for _, wf := range wfs[:min(50, len(wfs))] {
		workflows = append(workflows, gin.H{
			"workflow_id": wf.ID,
			"status":      wf.Status,
			"enqueued_at": epochMillis(wf.CreatedAt),
			"started_at":  epochMillis(wf.StartedAt),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"limit_per_period": limit,
		"period_sec":       int(period.Seconds()),
		"workflow_counts":  countByStatus(wfs),
		"workflows":        workflows,
	})
}

func rateEnqueueHandler(c *gin.Context) {
	if _, err := dbos.RunWorkflow(dbosCtx, QueueWorkflow, "", dbos.WithQueue(rateLimitedQueue)); err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func rateLimitHandler(c *gin.Context) {
	body := bodyMap(c)
	limit, okLimit := parsePositiveInt(body["limit_per_period"])
	periodSec, okPeriod := parsePositiveInt(body["period_sec"])
	if !okLimit || !okPeriod {
		respondError(c, http.StatusBadRequest, "Limit and Period must be whole numbers of at least 1")
		return
	}
	q, err := dbos.RetrieveQueue(dbosCtx, RATE_LIMITED_QUEUE_NAME)
	if err == nil {
		err = q.SetRateLimit(dbosCtx, &dbos.RateLimiter{Limit: limit, Period: time.Duration(periodSec) * time.Second})
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- Fair queues: a queue partitioned by tenant. PartitionConcurrency limits
// how many workflows each tenant runs at once, and WorkerConcurrency limits how
// many run on this process in total, so one busy tenant can't starve the others.
// Both limits can be changed at runtime. ----

// Enqueue one workflow in the tenant's partition of the fair queue.
func enqueueForTenant(tenantID string) error {
	_, err := dbos.RunWorkflow(dbosCtx, QueueWorkflow, "",
		dbos.WithQueue(fairQueue),
		dbos.WithQueuePartitionKey(tenantID),
	)
	return err
}

func fairStatusHandler(c *gin.Context) {
	partitionConcurrency, workerConcurrency := DEFAULT_PARTITION_CONCURRENCY, DEFAULT_FAIR_WORKER_CONCURRENCY
	if q, err := dbos.RetrieveQueue(dbosCtx, FAIR_QUEUE_NAME); err == nil && q != nil {
		if pc := q.GetPartitionConcurrency(); pc != nil {
			partitionConcurrency = *pc
		}
		if wc := q.GetWorkerConcurrency(); wc != nil {
			workerConcurrency = *wc
		}
	}

	pending := []gin.H{}
	for _, wf := range onQueue(FAIR_QUEUE_NAME, dbos.WorkflowStatusPending) {
		tenant := wf.QueuePartitionKey
		if tenant == "" {
			tenant = "unknown"
		}
		pending = append(pending, gin.H{"workflow_id": wf.ID, "tenant_id": tenant})
	}
	success, _ := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterQueueName(FAIR_QUEUE_NAME),
		dbos.WithFilterStatus(dbos.WorkflowStatusSuccess),
		dbos.WithFilterCreatedAfter(time.Now().Add(-10*time.Minute)),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)

	c.JSON(http.StatusOK, gin.H{
		"partition_concurrency": partitionConcurrency,
		"worker_concurrency":    workerConcurrency,
		"enqueued":              countByTenant(onQueue(FAIR_QUEUE_NAME, dbos.WorkflowStatusEnqueued)),
		"pending":               pending,
		"success":               countByTenant(success),
	})
}

func fairEnqueueHandler(c *gin.Context) {
	tenantID, ok := parseName(bodyMap(c)["tenant_id"])
	if !ok {
		respondError(c, http.StatusBadRequest, "Tenant names must be 1 to 40 characters")
		return
	}
	if err := enqueueForTenant(tenantID); err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Enqueue a batch of workflows across four tenants, skewed toward one of them.
func fairRandomMixHandler(c *gin.Context) {
	total := 50
	tenants := FAIR_QUEUE_TENANTS[:4]
	favored := tenants[mrand.IntN(len(tenants))]
	// The favored tenant is twice as likely to be picked. Picks are made one
	// at a time, so the workflows arrive in randomized order.
	weighted := append(append([]string{}, tenants...), favored)
	for range total {
		if err := enqueueForTenant(weighted[mrand.IntN(len(weighted))]); err != nil {
			respondError(c, http.StatusInternalServerError, err.Error())
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "favored": favored})
}

func fairLimitsHandler(c *gin.Context) {
	body := bodyMap(c)
	partitionConcurrency, okPartition := parsePositiveInt(body["partition_concurrency"])
	workerConcurrency, okWorker := parsePositiveInt(body["worker_concurrency"])
	if !okPartition || !okWorker {
		respondError(c, http.StatusBadRequest, "PartitionConcurrency and WorkerConcurrency must be whole numbers of at least 1")
		return
	}
	q, err := dbos.RetrieveQueue(dbosCtx, FAIR_QUEUE_NAME)
	if err == nil {
		err = q.SetPartitionConcurrency(dbosCtx, &partitionConcurrency)
	}
	if err == nil {
		err = q.SetWorkerConcurrency(dbosCtx, &workerConcurrency)
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- Delays: enqueue a workflow that waits before running. The workflow stays
// DELAYED until its delay expires, then becomes ENQUEUED and runs. While it's
// DELAYED, its delay can be changed to run it sooner or later. The delay is
// stored in the database, so it survives restarts. ----

func delayStatusHandler(c *gin.Context) {
	// List every workflow still in progress, plus any created in the last 10 minutes.
	byID := map[string]dbos.WorkflowStatus{}
	for _, wf := range recentOnQueue(DELAYED_QUEUE_NAME) {
		byID[wf.ID] = wf
	}
	for _, wf := range onQueue(DELAYED_QUEUE_NAME,
		dbos.WorkflowStatusDelayed, dbos.WorkflowStatusEnqueued, dbos.WorkflowStatusPending) {
		byID[wf.ID] = wf
	}
	wfs := make([]dbos.WorkflowStatus, 0, len(byID))
	for _, wf := range byID {
		wfs = append(wfs, wf)
	}
	sort.Slice(wfs, func(i, j int) bool { return wfs[i].CreatedAt.After(wfs[j].CreatedAt) })

	workflows := []gin.H{}
	for _, wf := range wfs[:min(50, len(wfs))] {
		workflows = append(workflows, gin.H{
			"workflow_id": wf.ID,
			"status":      wf.Status,
			"enqueued_at": epochMillis(wf.CreatedAt),
			// When the delay expires and the workflow becomes eligible to run.
			"due_at": epochMillis(wf.DelayUntil),
		})
	}
	c.JSON(http.StatusOK, gin.H{"workflows": workflows})
}

func delayEnqueueHandler(c *gin.Context) {
	delaySeconds, ok := parseDelaySeconds(bodyMap(c)["delay_seconds"])
	if !ok {
		respondError(c, http.StatusBadRequest, DELAY_ERROR)
		return
	}
	_, err := dbos.RunWorkflow(dbosCtx, QueueWorkflow, "",
		dbos.WithQueue(delayedQueue),
		dbos.WithDelay(time.Duration(delaySeconds)*time.Second),
	)
	if err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Change a workflow's delay, counting from now. DBOS only changes the delay
// of a workflow that is still DELAYED.
func delaySetHandler(c *gin.Context) {
	workflowID := c.Param("workflowId")
	delaySeconds, ok := parseDelaySeconds(bodyMap(c)["delay_seconds"])
	if !ok {
		respondError(c, http.StatusBadRequest, DELAY_ERROR)
		return
	}
	wf, found := workflowStatus(workflowID)
	if !found || wf.QueueName != DELAYED_QUEUE_NAME {
		respondError(c, http.StatusNotFound, "Delayed workflow not found")
		return
	}
	if wf.Status != dbos.WorkflowStatusDelayed {
		respondError(c, http.StatusConflict, fmt.Sprintf("The workflow is %s, so its delay can no longer change", wf.Status))
		return
	}
	if err := dbos.SetWorkflowDelay(dbosCtx, workflowID,
		dbos.WithDelayDuration(time.Duration(delaySeconds)*time.Second)); err != nil {
		respondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

/*****************************/
/**** COMMUNICATION HANDLERS */
/*****************************/

func commStatusHandler(c *gin.Context) {
	workflowID := c.Param("workflowId")
	// The workflow returns an error when it times out waiting for approval, so
	// it ends in ERROR.
	if wf, found := workflowStatus(workflowID); found && wf.Status == dbos.WorkflowStatusError {
		message := ""
		if wf.Error != nil {
			message = wf.Error.Error()
		}
		c.JSON(http.StatusOK, gin.H{"state": "timeout", "error": message})
		return
	}
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
