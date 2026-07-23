// DBOS Go interop app.
//
// Registers echoWorkflow on interop-queue-go as a configured instance method
// (class=InteropService, instance="default").
// The workflow receives a single typed EchoInput struct (positionalArgs[0]).
//
// POST /enqueue/{target}  — accepts {positionalArgs, namedArgs} body,
//
//	unmarshals into PortableWorkflowArgs and enqueues
//	echoWorkflow to interop-queue-{target}.
//
// POST /debounce/{target} — accepts {first, final} payloads, debounces
//
//	echoWorkflow twice on one key so the calls coalesce,
//	and returns the result of the single run.
//
// GET  /healthz           — liveness probe.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// FailWorkflow always fails with a PortableWorkflowError carrying the canonical
// interop error envelope (name/message/code/data). A workflow run under portable
// serialization stores this as the cross-language JSON envelope, letting callers
// in any language deserialize the same fields.
func (s *InteropService) FailWorkflow(_ dbos.Context, _ string) (map[string]any, error) {
	return nil, &dbos.PortableWorkflowError{
		Name:    "InteropError",
		Message: "interop boom",
		Code:    418,
		Data:    map[string]any{"detail": "teapot"},
	}
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

func enqueueHandler(w http.ResponseWriter, r *http.Request) {
	target := r.PathValue("target")
	queueName, ok := queueNames[target]
	if !ok {
		http.Error(w, fmt.Sprintf("unknown target: %s", target), http.StatusBadRequest)
		return
	}

	var args dbos.PortableWorkflowArgs
	if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
		http.Error(w, fmt.Sprintf("invalid body: %v", err), http.StatusBadRequest)
		return
	}

	handle, err := dbos.Enqueue[map[string]any](
		dbosClient,
		queueName,
		"echoWorkflow",
		args,
		dbos.WithEnqueueClassName("interop"),
		dbos.WithEnqueueConfigName("default"),
		dbos.WithEnqueueApplicationVersion("interop-v1"),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send a date message to the enqueued workflow using portable serialisation.
	msgDate := time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC)
	if err := dbos.Send(dbosClient, handle.GetWorkflowID(), msgDate, "date-msg", dbos.WithPortableSend()); err != nil {
		http.Error(w, fmt.Sprintf("send failed: %v", err), http.StatusInternalServerError)
		return
	}

	result, err := handle.GetResult()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// debounceRequest carries the two payloads for a coalescing check: "first" is
// debounced with a long period, then "final" replaces it with a short one.
type debounceRequest struct {
	First dbos.PortableWorkflowArgs `json:"first"`
	Final dbos.PortableWorkflowArgs `json:"final"`
}

func debounceHandler(w http.ResponseWriter, r *http.Request) {
	target := r.PathValue("target")
	queueName, ok := queueNames[target]
	if !ok {
		http.Error(w, fmt.Sprintf("unknown target: %s", target), http.StatusBadRequest)
		return
	}

	var req debounceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid body: %v", err), http.StatusBadRequest)
		return
	}

	debouncer := dbos.NewDebouncerClient[map[string]any, dbos.PortableWorkflowArgs](
		"echoWorkflow", dbosClient,
		dbos.WithDebouncerQueue(queueName),
		dbos.WithDebouncerClassName("interop"),
		dbos.WithDebouncerConfigName("default"),
	)

	key := "interop-go-" + target
	h1, err := debouncer.Debounce(key, 10*time.Second, req.First, dbos.WithApplicationVersion("interop-v1"))
	if err != nil {
		http.Error(w, fmt.Sprintf("first debounce failed: %v", err), http.StatusInternalServerError)
		return
	}
	h2, err := debouncer.Debounce(key, 1*time.Second, req.Final, dbos.WithApplicationVersion("interop-v1"))
	if err != nil {
		http.Error(w, fmt.Sprintf("second debounce failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Send the date message to the (single) coalesced workflow.
	msgDate := time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC)
	if err := dbos.Send(dbosClient, h2.GetWorkflowID(), msgDate, "date-msg", dbos.WithPortableSend()); err != nil {
		http.Error(w, fmt.Sprintf("send failed: %v", err), http.StatusInternalServerError)
		return
	}

	result, err := h2.GetResult()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{
		"coalesced": h1.GetWorkflowID() == h2.GetWorkflowID(),
		"result":    result,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// errorHandler enqueues the target's failWorkflow, awaits its (failed) result,
// and returns the deserialized portable error envelope. This exercises portable
// error deserialization: the target serializes the error as cross-language JSON,
// and this runtime reads it back into a *dbos.PortableWorkflowError.
func errorHandler(w http.ResponseWriter, r *http.Request) {
	target := r.PathValue("target")
	queueName, ok := queueNames[target]
	if !ok {
		http.Error(w, fmt.Sprintf("unknown target: %s", target), http.StatusBadRequest)
		return
	}

	handle, err := dbos.Enqueue[map[string]any](
		dbosClient,
		queueName,
		"failWorkflow",
		dbos.PortableWorkflowArgs{PositionalArgs: []any{"trigger"}},
		dbos.WithEnqueueClassName("interop"),
		dbos.WithEnqueueConfigName("default"),
		dbos.WithEnqueueApplicationVersion("interop-v1"),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = handle.GetResult()
	if err == nil {
		http.Error(w, "expected failWorkflow to fail", http.StatusInternalServerError)
		return
	}

	var pe *dbos.PortableWorkflowError
	if !errors.As(err, &pe) {
		http.Error(w, fmt.Sprintf("expected PortableWorkflowError, got %T: %v", err, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{
		"name":    pe.Name,
		"message": pe.Message,
		"code":    pe.Code,
		"data":    pe.Data,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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
		ApplicationVersion: "interop-v1",
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create DBOS context: %v\n", err)
		os.Exit(1)
	}

	service := &InteropService{configName: "default"}
	dbos.RegisterWorkflow(dbosCtx, service.EchoWorkflow,
		dbos.WithWorkflowName("echoWorkflow"),
		dbos.WithInstance(service))
	dbos.RegisterWorkflow(dbosCtx, service.FailWorkflow,
		dbos.WithWorkflowName("failWorkflow"),
		dbos.WithInstance(service))
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
	mux.HandleFunc("POST /debounce/{target}", debounceHandler)
	mux.HandleFunc("POST /error/{target}", errorHandler)

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
