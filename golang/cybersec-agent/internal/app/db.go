package app

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq"
)

var db *sql.DB

// InitDB initializes the database connection and creates tables if they don't exist
func InitDB() (*sql.DB, error) {
	databaseURL := os.Getenv("DBOS_SYSTEM_DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DBOS_SYSTEM_DATABASE_URL environment variable is not set")
	}

	var err error
	db, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Create tables if they don't exist
	if err := createTables(); err != nil {
		return nil, fmt.Errorf("failed to create tables: %w", err)
	}

	return db, nil
}

func createTables() error {
	reportsTable := `
	CREATE TABLE IF NOT EXISTS reports (
		id SERIAL PRIMARY KEY,
		repo_name TEXT NOT NULL UNIQUE,
		has_vuln BOOLEAN NOT NULL DEFAULT false,
		raw_report TEXT NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`

	issuesTable := `
	CREATE TABLE IF NOT EXISTS issues (
		id SERIAL PRIMARY KEY,
		repo_name TEXT NOT NULL,
		issue_body TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending_approval',
		workflow_id TEXT NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`

	if _, err := db.Exec(reportsTable); err != nil {
		return fmt.Errorf("failed to create reports table: %w", err)
	}

	if _, err := db.Exec(issuesTable); err != nil {
		return fmt.Errorf("failed to create issues table: %w", err)
	}

	return nil
}

// GetDB returns the database connection
func GetDB() *sql.DB {
	return db
}

// ClearAllData deletes all rows from the issues and reports tables
func ClearAllData() error {
	// Delete all issues
	if _, err := db.Exec("DELETE FROM issues"); err != nil {
		return fmt.Errorf("failed to clear issues table: %w", err)
	}

	// Delete all reports
	if _, err := db.Exec("DELETE FROM reports"); err != nil {
		return fmt.Errorf("failed to clear reports table: %w", err)
	}

	return nil
}
