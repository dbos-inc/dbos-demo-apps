package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/dbos-inc/dbos-transact-go/dbos"
)

/*****************************/
/**** WORKFLOWS AND STEPS
/*****************************/
var (
	wf = dbos.WithWorkflow(workflow)
)

func workflow(ctx context.Context, _ string) (string, error) {
	_, err := dbos.RunAsStep(ctx, step1, "")
	if err != nil {
		return "", err
	}
	return dbos.RunAsStep(ctx, step2, "")
}

func step1(ctx context.Context, _ string) (string, error) {
	fmt.Println("Executing step 1")
	return "Step 1 completed", nil
}
func step2(ctx context.Context, _ string) (string, error) {
	fmt.Println("Executing step 2")
	return "Step 2 completed - Workflow finished successfully", nil
}

/*****************************/
/**** QUEUES
/*****************************/
var (
	queue   = dbos.NewWorkflowQueue("example-queue")
	step    = dbos.WithWorkflow(stepFunction)
	queueWf = dbos.WithWorkflow(queueWorkflow)
)

func stepFunction(ctx context.Context, i int) (int, error) {
	time.Sleep(5 * time.Second)
	fmt.Printf("Step %d completed\n", i)
	return i, nil
}

func queueWorkflow(ctx context.Context, _ string) (string, error) {
	fmt.Println("Enqueuing steps")
	handles := make([]dbos.WorkflowHandle[int], 10)
	for i := range 10 {
		handle, err := step(ctx, i, dbos.WithQueue(queue.Name))
		if err != nil {
			return "", fmt.Errorf("failed to enqueue step %d: %w", i, err)
		}
		handles[i] = handle
	}
	results := make([]int, 10)
	for i, handle := range handles {
		result, err := handle.GetResult(ctx)
		if err != nil {
			return "", fmt.Errorf("failed to get result for step %d: %w", i, err)
		}
		results[i] = result
	}
	return fmt.Sprintf("Successfully completed %d steps", len(results)), nil
}

func main() {
	err := dbos.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Destroy()

	http.HandleFunc("/workflow", func(w http.ResponseWriter, r *http.Request) {
		handle, err := wf(r.Context(), "")
		if err != nil {
			http.Error(w, fmt.Sprintf("Error: %s", err), http.StatusInternalServerError)
			return
		}
		res, err := handle.GetResult(r.Context())
		if err != nil {
			http.Error(w, fmt.Sprintf("Error: %s", err), http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, "Workflow result: %s", res)
	})

	http.HandleFunc("/queue", func(w http.ResponseWriter, r *http.Request) {
		handle, err := queueWf(r.Context(), "")
		if err != nil {
			http.Error(w, fmt.Sprintf("Error: %s", err), http.StatusInternalServerError)
			return
		}
		res, err := handle.GetResult(r.Context())
		if err != nil {
			http.Error(w, fmt.Sprintf("Error: %s", err), http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, "Workflow result: %s", res)
	})

	// Start the server on port 8888
	fmt.Println("Server starting on http://localhost:8888")
	err = http.ListenAndServe(":8888", nil)
	if err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}
