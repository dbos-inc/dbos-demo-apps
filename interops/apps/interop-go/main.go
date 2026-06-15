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
// GET  /healthz           — liveness probe.
package main

import (
	"context"
	"encoding/json"
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

func (s *InteropService) EchoWorkflow(ctx dbos.DBOSContext, input EchoInput) (map[string]any, error) {
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
// HTTP handlers
// ---------------------------------------------------------------------------

var dbosCtx dbos.DBOSContext
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

	handle, err := dbos.Enqueue[dbos.PortableWorkflowArgs, map[string]any](
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
	if err := dbosClient.Send(handle.GetWorkflowID(), msgDate, "date-msg", dbos.WithPortableSend()); err != nil {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	if sysDBURL == "" {
		fmt.Fprintln(os.Stderr, "DBOS_SYSTEM_DATABASE_URL is required")
		os.Exit(1)
	}

	var err error
	dbosCtx, err = dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL:        sysDBURL,
		AppName:            "interop-go",
		AdminServer:        false,
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
	dbos.NewWorkflowQueue(dbosCtx, "interop-queue-go")

	if err = dbosCtx.Launch(); err != nil {
		fmt.Fprintf(os.Stderr, "failed to launch DBOS: %v\n", err)
		os.Exit(1)
	}
	defer dbosCtx.Shutdown(10 * time.Second)

	dbosClient, err = dbos.NewClient(context.Background(), dbos.ClientConfig{
		DatabaseURL: sysDBURL,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create DBOS client: %v\n", err)
		os.Exit(1)
	}
	defer dbosClient.Shutdown(10 * time.Second)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("POST /enqueue/{target}", enqueueHandler)

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
