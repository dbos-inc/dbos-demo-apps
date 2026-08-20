// DBOS Go interop app.
//
// Registers echoWorkflow on interop-queue-go as a configured instance method
// (class=InteropService, instance="default").
// The workflow receives a single typed EchoInput struct (positionalArgs[0]).
//
// POST /enqueue/{target}       — accepts {positionalArgs, namedArgs} body,
//
//	unmarshals into PortableWorkflowArgs and enqueues
//	echoWorkflow to interop-queue-{target}.
//
// POST /interop/{target}       — the same call, returning {result, parentId, childId} so
//
//	the caller can inspect the cross-application parent/child link.
//
// GET  /workflow/{id}          — status of any workflow in the shared system database.
// GET  /steps/{id}             — the recorded steps of a workflow, with child workflow IDs.
// GET  /healthz                — liveness probe.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

var (
	sysDBURL = os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	port     = envInt("PORT", 8003)
)

var queueNames = map[string]string{
	"python":     "interop-queue-python",
	"typescript": "interop-queue-typescript",
	"go":         "interop-queue-go",
	"java":       "interop-queue-java",
}

// All four runtimes share one system database, so each is a distinct DBOS
// application. An application's name decides what it owns — its workflows,
// queues and versions — and it only runs its own work.
var appNames = map[string]string{
	"python":     "interop-python",
	"typescript": "interop-typescript",
	"go":         "interop-go",
	"java":       "interop-java",
}

// Application version names are unique across every application sharing a
// system database, so each runtime carries its own rather than a common
// "interop-v1", and an enqueue targets the version of the runtime that will
// run the workflow.
var appVersions = map[string]string{
	"python":     "interop-python-v1",
	"typescript": "interop-typescript-v1",
	"go":         "interop-go-v1",
	"java":       "interop-java-v1",
}

// ---------------------------------------------------------------------------
// EchoInput — typed struct received by echoWorkflow (positionalArgs[0]).
// ---------------------------------------------------------------------------

type EchoInput struct {
	Text  string   `json:"text"`
	Num   int      `json:"num"`
	Float float64  `json:"float"`
	Items []string `json:"items"`
	Date  string   `json:"date"`
}

// ---------------------------------------------------------------------------
// Echo workflow — a configured instance method registered with name
// "echoWorkflow" and config name "default", mirroring the Python/TS apps.
// ---------------------------------------------------------------------------

type InteropService struct {
	configName string
}

func (s *InteropService) ConfigName() string { return s.configName }

func (s *InteropService) EchoWorkflow(ctx dbos.Context, input EchoInput) (map[string]any, error) {
	parsedDate, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		return nil, fmt.Errorf("echoWorkflow: invalid date %q: %w", input.Date, err)
	}

	// Receive a date message sent by the caller.
	msgDateRaw, err := dbos.Recv[string](ctx, "date-msg", 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("echoWorkflow: recv failed: %w", err)
	}
	// Parse the date: senders may produce "2025-03-15" or "2025-03-15T00:00:00Z".
	msgTime, err := time.Parse(time.RFC3339, msgDateRaw)
	if err != nil {
		msgTime, err = time.Parse("2006-01-02", msgDateRaw)
	}
	if err != nil {
		return nil, fmt.Errorf("echoWorkflow: invalid msg date %q: %w", msgDateRaw, err)
	}

	return map[string]any{
		"echo_text":   input.Text,
		"echo_num":    input.Num,
		"echo_float":  input.Float,
		"items_count": len(input.Items),
		"echo_date":   parsedDate.Format("2006-01-02"),
		"msg_date":    msgTime.Format("2006-01-02"),
	}, nil
}

// ---------------------------------------------------------------------------
// Interop driver — a workflow that enqueues another application's echoWorkflow
// through the runtime itself, so the enqueued workflow is recorded as a child
// of this one even though a different application owns and runs it.
// ---------------------------------------------------------------------------

type driveInput struct {
	Target string
	Body   []byte
}

func interopDriver(ctx dbos.Context, in driveInput) (string, error) {
	var args dbos.PortableWorkflowArgs
	if err := json.Unmarshal(in.Body, &args); err != nil {
		return "", fmt.Errorf("interopDriver: invalid body: %w", err)
	}

	handle, err := dbos.Enqueue[map[string]any](
		ctx,
		queueNames[in.Target],
		"echoWorkflow",
		args,
		dbos.WithEnqueueClassName("interop"),
		dbos.WithEnqueueConfigName("default"),
		// Hand the workflow to the target application, which dequeues and runs
		// it on the version it is deployed at.
		dbos.WithEnqueueApplicationName(appNames[in.Target]),
		dbos.WithEnqueueApplicationVersion(appVersions[in.Target]),
	)
	if err != nil {
		return "", err
	}
	childID := handle.GetWorkflowID()

	// Send the date message the child workflow is waiting on. Workflow IDs are
	// unique across the whole system database, so this reaches the child no
	// matter which application runs it.
	msgDate := time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC)
	if err := dbos.Send(ctx, childID, msgDate, "date-msg", dbos.WithPortableSend()); err != nil {
		return "", err
	}

	result, err := handle.GetResult()
	if err != nil {
		return "", err
	}
	parentID, err := dbos.GetWorkflowID(ctx)
	if err != nil {
		return "", err
	}
	envelope, err := json.Marshal(map[string]any{
		"result":   result,
		"parentId": parentID,
		"childId":  childID,
	})
	return string(envelope), err
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

var dbosCtx dbos.Context
var dbosClient dbos.Client

func healthzHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"status":"ok"}`)
}

// drive runs interopDriver for the request's target and returns the decoded
// {result, parentId, childId} envelope, or false after writing an error.
func drive(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	target := r.PathValue("target")
	if _, ok := queueNames[target]; !ok {
		http.Error(w, fmt.Sprintf("unknown target: %s", target), http.StatusBadRequest)
		return nil, false
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid body: %v", err), http.StatusBadRequest)
		return nil, false
	}
	handle, err := dbos.RunWorkflow(dbosCtx, interopDriver, driveInput{Target: target, Body: body})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	out, err := handle.GetResult()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	var envelope map[string]any
	if err := json.Unmarshal([]byte(out), &envelope); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	return envelope, true
}

func enqueueHandler(w http.ResponseWriter, r *http.Request) {
	if envelope, ok := drive(w, r); ok {
		writeJSON(w, envelope["result"])
	}
}

func interopHandler(w http.ResponseWriter, r *http.Request) {
	if envelope, ok := drive(w, r); ok {
		writeJSON(w, envelope)
	}
}

func stepsHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	steps, err := dbos.GetWorkflowSteps(dbosClient, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]map[string]any, 0, len(steps))
	for _, step := range steps {
		out = append(out, map[string]any{
			"functionId":      step.StepID,
			"functionName":    step.StepName,
			"childWorkflowId": nullable(step.ChildWorkflowID),
		})
	}
	writeJSON(w, out)
}

// nullable maps an empty string to JSON null: these payloads are compared field
// for field against the Python and TypeScript apps' answers for the same workflow.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func workflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	handle, err := dbos.RetrieveWorkflow[any](dbosClient, id)
	if err != nil {
		http.Error(w, fmt.Sprintf("no such workflow: %s", id), http.StatusNotFound)
		return
	}
	status, err := handle.GetStatus()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{
		"workflowId":         status.ID,
		"name":               status.Name,
		"status":             string(status.Status),
		"queueName":          nullable(status.QueueName),
		"applicationName":    nullable(status.ApplicationName),
		"applicationVersion": nullable(status.ApplicationVersion),
		"parentWorkflowId":   nullable(status.ParentWorkflowID),
		// The process that ran the workflow — different from the caller's when
		// another application dequeued it.
		"executorId": nullable(status.ExecutorID),
	})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	if sysDBURL == "" {
		fmt.Fprintln(os.Stderr, "DBOS_SYSTEM_DATABASE_URL is required")
		os.Exit(1)
	}

	var err error
	dbosCtx, err = dbos.NewContext(context.Background(), dbos.Config{
		DatabaseURL:        sysDBURL,
		AppName:            "interop-go",
		ApplicationVersion: appVersions["go"],
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create DBOS context: %v\n", err)
		os.Exit(1)
	}

	service := &InteropService{configName: "default"}
	dbos.RegisterWorkflow(dbosCtx, service.EchoWorkflow,
		dbos.WithWorkflowName("echoWorkflow"),
		dbos.WithInstance(service))
	dbos.RegisterWorkflow(dbosCtx, interopDriver,
		dbos.WithWorkflowName("interopDriver"))
	if _, err = dbos.RegisterQueue(dbosCtx, "interop-queue-go"); err != nil {
		fmt.Fprintf(os.Stderr, "failed to register queue: %v\n", err)
		os.Exit(1)
	}
	// The queue is database-backed and thus visible to every worker on this
	// system database; restrict this process to its own queue so the other
	// language runtimes' workers don't dequeue Go-targeted workflows.
	dbos.ListenQueues(dbosCtx, "interop-queue-go")

	if err = dbosCtx.Launch(); err != nil {
		fmt.Fprintf(os.Stderr, "failed to launch DBOS: %v\n", err)
		os.Exit(1)
	}
	defer dbos.Shutdown(dbosCtx, 10 * time.Second)

	dbosClient, err = dbos.NewClient(context.Background(), dbos.ClientConfig{
		DatabaseURL: sysDBURL,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create DBOS client: %v\n", err)
		os.Exit(1)
	}
	defer dbos.Shutdown(dbosClient, 10 * time.Second)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("POST /enqueue/{target}", enqueueHandler)
	mux.HandleFunc("POST /interop/{target}", interopHandler)
	mux.HandleFunc("GET /workflow/{id}", workflowHandler)
	mux.HandleFunc("GET /steps/{id}", stepsHandler)

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("interop-go listening on %s\n", addr)
	if err = http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			fmt.Fprintf(os.Stderr, "invalid %s=%q: %v\n", key, v, err)
			os.Exit(1)
		}
		return n
	}
	return def
}
