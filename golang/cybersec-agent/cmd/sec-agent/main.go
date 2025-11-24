package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"time"

	"sec-agent/internal/app"
	"sec-agent/internal/tui"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

func main() {
	// Initialize database connection
	db, err := app.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize DBOS context
	dbosContext, err := initDBOS()
	if err != nil {
		log.Fatalf("Failed to initialize DBOS: %v", err)
	}
	defer dbos.Shutdown(dbosContext, 5*time.Second)

	// Register workflows
	registerWorkflows(dbosContext)

	// Launch DBOS context
	if err := dbos.Launch(dbosContext); err != nil {
		log.Fatalf("Failed to launch DBOS: %v", err)
	}

	// Start TUI
	if err := tui.Run(dbosContext, db); err != nil {
		log.Fatalf("TUI error: %v", err)
		os.Exit(1)
	}
}

// initDBOS initializes the DBOS context
func initDBOS() (dbos.DBOSContext, error) {
	databaseURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DBOS_SYSTEM_DATABASE_URL environment variable is not set")
	}

	ctx, err := dbos.NewDBOSContext(context.Background(), dbos.Config{
		AppName:            "dbos-cybersec-agent",
		DatabaseURL:        databaseURL,
		Logger:             slog.New(slog.NewTextHandler(io.Discard, nil)),
		ApplicationVersion: "dev",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create DBOS context: %w", err)
	}

	return ctx, nil
}

// registerWorkflows registers all workflows with DBOS
func registerWorkflows(ctx dbos.DBOSContext) {
	dbos.RegisterWorkflow(ctx, app.ScanWorkflow, dbos.WithWorkflowName("scan_workflow"))
	dbos.RegisterWorkflow(ctx, app.IssueWorkflow, dbos.WithWorkflowName("issue_workflow"))
}
