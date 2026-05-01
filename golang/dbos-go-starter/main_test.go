package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

func TestExampleWorkflow(t *testing.T) {
	ctx, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		DatabaseURL: os.Getenv("DBOS_SYSTEM_DATABASE_URL"),
		AppName:     "dbos-go-starter-test",
	})
	if err != nil {
		t.Fatalf("NewDBOSContext: %v", err)
	}
	dbos.RegisterWorkflow(ctx, ExampleWorkflow)
	if err := ctx.Launch(); err != nil {
		t.Fatalf("Launch: %v", err)
	}
	t.Cleanup(func() { ctx.Shutdown(10 * time.Second) })

	const wfID = "starter-example-test"
	handle, err := dbos.RunWorkflow(ctx, ExampleWorkflow, "", dbos.WithWorkflowID(wfID))
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}
	got, err := handle.GetResult()
	if err != nil {
		t.Fatalf("GetResult: %v", err)
	}
	if want := "Workflow completed"; got != want {
		t.Errorf("ExampleWorkflow result = %q, want %q", got, want)
	}

	step, err := dbos.GetEvent[int](ctx, wfID, STEPS_EVENT, 5*time.Second)
	if err != nil {
		t.Fatalf("GetEvent: %v", err)
	}
	if step != 3 {
		t.Errorf("STEPS_EVENT = %d, want 3 after all steps", step)
	}
}
