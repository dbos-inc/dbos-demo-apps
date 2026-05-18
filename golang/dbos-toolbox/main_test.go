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
		AppName:     "dbos-toolbox-test",
	})
	if err != nil {
		t.Fatalf("NewDBOSContext: %v", err)
	}
	dbos.RegisterWorkflow(ctx, ExampleWorkflow)
	if err := ctx.Launch(); err != nil {
		t.Fatalf("Launch: %v", err)
	}
	t.Cleanup(func() { ctx.Shutdown(10 * time.Second) })

	handle, err := dbos.RunWorkflow(ctx, ExampleWorkflow, "")
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}
	got, err := handle.GetResult()
	if err != nil {
		t.Fatalf("GetResult: %v", err)
	}
	if want := "Step 2 completed - Workflow finished successfully"; got != want {
		t.Errorf("ExampleWorkflow result = %q, want %q", got, want)
	}
}
