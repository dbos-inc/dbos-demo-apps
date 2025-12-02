package app

import "time"

// Report represents a security scan report
type Report struct {
	ID        int       `db:"id"`
	RepoName  string    `db:"repo_name"`
	HasVuln   bool      `db:"has_vuln"`
	RawReport string    `db:"raw_report"`
	CreatedAt time.Time `db:"created_at"`
}

// Issue represents a generated GitHub issue
type Issue struct {
	ID         int       `db:"id"`
	RepoName   string    `db:"repo_name"`
	IssueBody  string    `db:"issue_body"`
	Status     string    `db:"status"` // pending_approval, rejected, approved
	WorkflowID string    `db:"workflow_id"`
	CreatedAt  time.Time `db:"created_at"`
}
