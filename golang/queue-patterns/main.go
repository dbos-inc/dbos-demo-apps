package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/gin-gonic/gin"
)

const CONCURRENCY_QUEUE = "concurrency-queue"
const PARTITIONED_QUEUE = "partitioned-queue"
const RATE_LIMITED_QUEUE = "rate-limited-queue"
const DEBOUNCER_QUEUE = "debouncer-queue"

var dbosCtx dbos.Context
var concurrencyQueue dbos.Queue
var partitionedQueue dbos.Queue
var rateLimitedQueue dbos.Queue
var debouncerQueue dbos.Queue

var debouncer *dbos.Debouncer[string, DebouncerInput]

/*****************************/
/**** Fair Queueing **********/
/*****************************/

// The set of tenants the UI offers and the randomized batch draws from.
var FAIR_QUEUE_TENANTS = []string{"alice", "bob", "clark", "dave", "ed"}

// The workflow for fair queueing simply sleeps for 5 seconds.
func FairQueueWorkflow(ctx dbos.Context, _ string) (string, error) {
	_, err := dbos.Sleep(ctx, 5*time.Second)
	return "", err
}

// The fair queue example uses two queues:
// PARTITIONED_QUEUE is split by tenant ID and limits the total number of concurrent tasks per tenant
// CONCURRENCY_QUEUE limits the number of concurrent tasks per worker
// These are registered below.
// Workflows are first enqueued on the former and then to the latter, thus applying the limits of both queues.

func FairQueueConcurrencyManager(ctx dbos.Context, _ string) (string, error) {
	// This "concurrency manager" workflow holds a slot on PARTITIONED_QUEUE and executes FairQueueWorkflow on the CONCURRENCY_QUEUE.
	handle, err := dbos.RunWorkflow(ctx, FairQueueWorkflow, "", dbos.WithQueue(concurrencyQueue))
	if err != nil {
		return "", err
	}
	return handle.GetResult()
}

// Enqueue a single "concurrency manager" workflow to PARTITIONED_QUEUE
func enqueueForTenant(tenantID string) error {
	_, err := dbos.RunWorkflow(dbosCtx, FairQueueConcurrencyManager, "",
		dbos.WithQueue(partitionedQueue),
		dbos.WithQueuePartitionKey(tenantID),
	)
	return err
}

// Handler for single-workflow enqueue
func fairQueueHandler(c *gin.Context) {
	tenantID := c.Query("tenant_id")
	if err := enqueueForTenant(tenantID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, nil)
}

// Enqueue a randomized mix of workflows
func fairQueueRandomMixHandler(c *gin.Context) {
	total := 50
	tenants := FAIR_QUEUE_TENANTS[0:4]
	favored := tenants[rand.Intn(len(tenants))]
	// The favored tenant is twice as likely to be picked, so the batch is skewed
	// toward it. Picks are made one at a time, so they arrive in randomized order.
	weighted := []string{}
	for _, t := range tenants {
		weighted = append(weighted, t)
		if t == favored {
			weighted = append(weighted, t)
		}
	}
	for i := 0; i < total; i++ {
		tenant := weighted[rand.Intn(len(weighted))]
		if err := enqueueForTenant(tenant); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "favored": favored})
}

/*****************************/
/**** Rate Limiting **********/
/*****************************/

// This workflow is rate-limited: No more than two workflows can start per 10 seconds
// See RATE_LIMITED_QUEUE below
func RateLimitedQueueWorkflow(ctx dbos.Context, _ string) (string, error) {
	_, err := dbos.Sleep(ctx, 5*time.Second)
	return "", err
}

func rateLimitedQueueHandler(c *gin.Context) {
	_, err := dbos.RunWorkflow(dbosCtx, RateLimitedQueueWorkflow, "", dbos.WithQueue(rateLimitedQueue))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, nil)
}

/*****************************/
/**** Debouncing *************/
/*****************************/

type DebouncerInput struct {
	TenantID string `json:"tenant_id"`
	Input    string `json:"input"`
}

func DebouncerWorkflow(ctx dbos.Context, input DebouncerInput) (string, error) {
	fmt.Printf("Executing debounced workflow for tenant %s with input %s\n", input.TenantID, input.Input)
	_, err := dbos.Sleep(ctx, 5*time.Second)
	return "", err
}

func debouncerHandler(c *gin.Context) {
	tenantID := c.Query("tenant_id")
	input := c.Query("input")
	// Each time a new input is submitted for a tenant, debounce DebouncerWorkflow.
	// The debouncer will wait until 10 seconds after input stops being submitted for the
	// tenant, then enqueue the workflow with the last input submitted.
	debounceKey := tenantID
	debouncePeriod := 10 * time.Second
	_, err := debouncer.Debounce(dbosCtx, debounceKey, debouncePeriod,
		DebouncerInput{TenantID: tenantID, Input: input},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, nil)
}

/*****************************/
/**** Observability **********/
/*****************************/

func thirtyMinutesAgo() time.Time {
	return time.Now().Add(-30 * time.Minute)
}

// epochMillis renders a timestamp the way the frontend expects it (ms since epoch).
func epochMillis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}

// debouncerArgs pulls the tenant and input back out of a listed workflow's input.
// Listing deserializes into the registered struct when it can, and into a generic
// map otherwise, so handle both.
func debouncerArgs(input any) (string, string) {
	switch v := input.(type) {
	case DebouncerInput:
		return v.TenantID, v.Input
	case *DebouncerInput:
		return v.TenantID, v.Input
	case map[string]any:
		tenant, _ := v["tenant_id"].(string)
		in, _ := v["input"].(string)
		return tenant, in
	case string:
		var decoded DebouncerInput
		if err := json.Unmarshal([]byte(v), &decoded); err == nil {
			return decoded.TenantID, decoded.Input
		}
	}
	return "", ""
}

func listWorkflowsHandler(c *gin.Context) {
	workflowName := c.Query("workflow_name")
	workflows, err := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName(workflowName),
		dbos.WithFilterSortDesc(),
		dbos.WithFilterLoadInput(true),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	statuses := []gin.H{}
	for _, w := range workflows {
		var tenantID any = nil
		var input any = nil
		if workflowName == "fair_queue_concurrency_manager" || workflowName == "fair_queue_workflow" {
			if w.QueuePartitionKey != "" {
				tenantID = w.QueuePartitionKey
			}
		} else if workflowName == "debouncer_workflow" {
			t, i := debouncerArgs(w.Input)
			if t != "" {
				tenantID = t
			}
			if i != "" {
				input = i
			}
		}
		statuses = append(statuses, gin.H{
			"workflow_id":     w.ID,
			"workflow_status": string(w.Status),
			"workflow_name":   w.Name,
			"start_time":      epochMillis(w.CreatedAt),
			"tenant_id":       tenantID,
			"input":           input,
		})
	}
	c.JSON(http.StatusOK, statuses)
}

func countsByTenant(wfs []dbos.WorkflowStatus) []gin.H {
	counts := map[string]int{}
	order := []string{}
	for _, w := range wfs {
		tenant := w.QueuePartitionKey
		if tenant == "" {
			tenant = "unknown"
		}
		if _, seen := counts[tenant]; !seen {
			order = append(order, tenant)
		}
		counts[tenant]++
	}
	rows := []gin.H{}
	for _, tenant := range order {
		rows = append(rows, gin.H{"tenant_id": tenant, "count": counts[tenant]})
	}
	return rows
}

func fairQueuePipelineHandler(c *gin.Context) {
	// The "concurrency manager" workflows run on the partitioned queue and carry the
	// partition key (tenant_id) natively.
	enqueuedMgrs, err := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName("fair_queue_concurrency_manager"),
		dbos.WithFilterStatus(dbos.WorkflowStatusEnqueued, dbos.WorkflowStatusPending),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	successMgrs, err := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName("fair_queue_concurrency_manager"),
		dbos.WithFilterStatus(dbos.WorkflowStatusSuccess),
		dbos.WithFilterCreatedAfter(thirtyMinutesAgo()),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// The actual work runs on the concurrency queue. Those workflows have no partition
	// key of their own, so we inherit it from the parent manager that enqueued them.
	pendingWork, err := dbos.ListWorkflows(dbosCtx,
		dbos.WithFilterName("fair_queue_workflow"),
		dbos.WithFilterStatus(dbos.WorkflowStatusPending),
		dbos.WithFilterLoadInput(false),
		dbos.WithFilterLoadOutput(false),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	mgrKey := map[string]string{}
	for _, m := range enqueuedMgrs {
		mgrKey[m.ID] = m.QueuePartitionKey
	}

	pendingConcurrency := []gin.H{}
	for _, w := range pendingWork {
		tenant := "unknown"
		if key, ok := mgrKey[w.ParentWorkflowID]; ok && key != "" {
			tenant = key
		}
		pendingConcurrency = append(pendingConcurrency, gin.H{
			"workflow_id": w.ID,
			"tenant_id":   tenant,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"enqueued":            countsByTenant(enqueuedMgrs),
		"pending_concurrency": pendingConcurrency,
		"success":             countsByTenant(successMgrs),
	})
}

func debouncerPipelineHandler(c *gin.Context) {
	// A debounced workflow is DELAYED while its debounce window is still open,
	// then ENQUEUED when it fires, PENDING while running, then SUCCESS. We
	// surface the tenant and its (latest) input for each stage. Deduplication on
	// the tenant key means there is at most one DELAYED workflow per tenant —
	// i.e. the last input submitted wins.
	listByStatus := func(status dbos.WorkflowStatusType, extra ...dbos.ListWorkflowsOption) ([]dbos.WorkflowStatus, error) {
		opts := []dbos.ListWorkflowsOption{
			dbos.WithFilterName("debouncer_workflow"),
			dbos.WithFilterStatus(status),
			dbos.WithFilterSortDesc(),
			dbos.WithFilterLoadInput(true),
		}
		return dbos.ListWorkflows(dbosCtx, append(opts, extra...)...)
	}

	pending, err := listByStatus(dbos.WorkflowStatusPending)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	completed, err := listByStatus(dbos.WorkflowStatusSuccess, dbos.WithFilterCreatedAfter(thirtyMinutesAgo()))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	toItems := func(wfs []dbos.WorkflowStatus) []gin.H {
		items := []gin.H{}
		for _, w := range wfs {
			tenant, input := debouncerArgs(w.Input)
			if tenant == "" {
				tenant = "unknown"
			}
			// For DELAYED workflows this is when the debounce window closes
			// and the workflow will run; null once it has left DELAYED.
			var delayUntil any = nil
			if !w.DelayUntil.IsZero() {
				delayUntil = epochMillis(w.DelayUntil)
			}
			// When the workflow actually started running (it left the
			// debounce window), which is what the completed list sorts by.
			ranAt := epochMillis(w.StartedAt)
			if w.StartedAt.IsZero() {
				ranAt = epochMillis(w.CreatedAt)
			}
			items = append(items, gin.H{
				"workflow_id": w.ID,
				"tenant_id":   tenant,
				"input":       input,
				"start_time":  epochMillis(w.CreatedAt),
				"delay_until": delayUntil,
				"ran_at":      ranAt,
			})
		}
		return items
	}

	delayed, err := listByStatus(dbos.WorkflowStatusDelayed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"delayed":   toItems(delayed),
		"pending":   toItems(pending),
		"completed": toItems(completed),
	})
}

/*****************************/
/**** Main Function **********/
/*****************************/

// systemDatabaseURL returns the configured system database, falling back to the local
// Postgres that `npx dbos postgres start` sets up.
func systemDatabaseURL() string {
	if url := os.Getenv("DBOS_SYSTEM_DATABASE_URL"); url != "" {
		return url
	}
	return "postgres://postgres:dbos@localhost:5432/dbos_queue_patterns_dbos_sys"
}

func main() {
	// Create DBOS context
	var err error
	dbosCtx, err = dbos.NewContext(context.Background(), dbos.Config{
		DatabaseURL:        systemDatabaseURL(),
		AppName:            "dbos-queue-patterns",
		ApplicationVersion: "0.1.0",
		ConductorAPIKey:    os.Getenv("DBOS_CONDUCTOR_KEY"),
	})
	if err != nil {
		panic(err)
	}

	// Register workflows. The names match the Python and TypeScript versions of this
	// app so all three share the same frontend.
	dbos.RegisterWorkflow(dbosCtx, FairQueueWorkflow, dbos.WithWorkflowName("fair_queue_workflow"))
	dbos.RegisterWorkflow(dbosCtx, FairQueueConcurrencyManager, dbos.WithWorkflowName("fair_queue_concurrency_manager"))
	dbos.RegisterWorkflow(dbosCtx, RateLimitedQueueWorkflow, dbos.WithWorkflowName("rate_limited_queue_workflow"))
	dbos.RegisterWorkflow(dbosCtx, DebouncerWorkflow, dbos.WithWorkflowName("debouncer_workflow"))

	// Launch DBOS
	err = dbosCtx.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown(dbosCtx, 10*time.Second)

	// Register the queues (after launch).
	concurrencyQueue, err = dbos.RegisterQueue(dbosCtx, CONCURRENCY_QUEUE,
		dbos.WithWorkerConcurrency(4),
	)
	if err != nil {
		panic(err)
	}
	partitionedQueue, err = dbos.RegisterQueue(dbosCtx, PARTITIONED_QUEUE,
		dbos.WithPartitionQueue(),
		dbos.WithGlobalConcurrency(2),
	)
	if err != nil {
		panic(err)
	}
	rateLimitedQueue, err = dbos.RegisterQueue(dbosCtx, RATE_LIMITED_QUEUE,
		dbos.WithRateLimiter(&dbos.RateLimiter{Limit: 2, Period: 10 * time.Second}),
	)
	if err != nil {
		panic(err)
	}
	debouncerQueue, err = dbos.RegisterQueue(dbosCtx, DEBOUNCER_QUEUE)
	if err != nil {
		panic(err)
	}

	// The debounced workflow runs on DEBOUNCER_QUEUE, which must already be registered.
	debouncer, err = dbos.NewDebouncer(dbosCtx, DebouncerWorkflow,
		dbos.WithDebouncerQueue(DEBOUNCER_QUEUE),
	)
	if err != nil {
		panic(err)
	}

	// Initialize Gin router
	router := gin.Default()

	// API handlers
	router.POST("/api/workflows/fair_queue", fairQueueHandler)
	router.POST("/api/workflows/fair_queue/random_mix", fairQueueRandomMixHandler)
	router.POST("/api/workflows/rate_limited_queue", rateLimitedQueueHandler)
	router.POST("/api/workflows/debouncer", debouncerHandler)
	router.GET("/api/workflows", listWorkflowsHandler)
	router.GET("/api/fair_queue/pipeline", fairQueuePipelineHandler)
	router.GET("/api/debouncer/pipeline", debouncerPipelineHandler)

	// Serve the built frontend
	router.Static("/assets", "./frontend/dist/assets")
	router.StaticFile("/", "./frontend/dist/index.html")

	fmt.Println("Server starting on http://localhost:8000")
	err = router.Run(":8000")
	if err != nil {
		panic(err)
	}
}
