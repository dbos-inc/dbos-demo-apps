package app

import (
	"database/sql"
	"fmt"
)

// CreateIssue inserts a new issue into the database
func CreateIssue(repoName, issueBody, workflowID string) (*Issue, error) {
	query := `
		INSERT INTO issues (repo_name, issue_body, status, workflow_id)
		VALUES ($1, $2, 'pending_approval', $3)
		RETURNING id, repo_name, issue_body, status, workflow_id, created_at`

	var issue Issue
	err := GetDB().QueryRow(query, repoName, issueBody, workflowID).Scan(
		&issue.ID,
		&issue.RepoName,
		&issue.IssueBody,
		&issue.Status,
		&issue.WorkflowID,
		&issue.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create issue: %w", err)
	}

	return &issue, nil
}

// GetPendingIssues retrieves all pending issues
func GetPendingIssues() ([]*Issue, error) {
	query := `
		SELECT id, repo_name, issue_body, status, workflow_id, created_at
		FROM issues
		WHERE status = 'pending_approval'
		ORDER BY created_at DESC`

	rows, err := GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending issues: %w", err)
	}
	defer rows.Close()

	var issues []*Issue
	for rows.Next() {
		var issue Issue
		if err := rows.Scan(
			&issue.ID,
			&issue.RepoName,
			&issue.IssueBody,
			&issue.Status,
			&issue.WorkflowID,
			&issue.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan issue: %w", err)
		}
		issues = append(issues, &issue)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating issues: %w", err)
	}

	return issues, nil
}

// GetIssueByID retrieves an issue by its ID
func GetIssueByID(id int) (*Issue, error) {
	query := `
		SELECT id, repo_name, issue_body, status, workflow_id, created_at
		FROM issues
		WHERE id = $1`

	var issue Issue
	err := GetDB().QueryRow(query, id).Scan(
		&issue.ID,
		&issue.RepoName,
		&issue.IssueBody,
		&issue.Status,
		&issue.WorkflowID,
		&issue.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("issue not found")
		}
		return nil, fmt.Errorf("failed to get issue: %w", err)
	}

	return &issue, nil
}

// UpdateIssueStatus updates the status of an issue
func UpdateIssueStatus(id int, status string) error {
	query := `
		UPDATE issues
		SET status = $1
		WHERE id = $2`

	result, err := GetDB().Exec(query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update issue status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("issue not found")
	}

	return nil
}

// GetIssueByWorkflowID retrieves an issue by its workflow ID
func GetIssueByWorkflowID(workflowID string) (*Issue, error) {
	query := `
		SELECT id, repo_name, issue_body, status, workflow_id, created_at
		FROM issues
		WHERE workflow_id = $1`

	var issue Issue
	err := GetDB().QueryRow(query, workflowID).Scan(
		&issue.ID,
		&issue.RepoName,
		&issue.IssueBody,
		&issue.Status,
		&issue.WorkflowID,
		&issue.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("issue not found")
		}
		return nil, fmt.Errorf("failed to get issue: %w", err)
	}

	return &issue, nil
}

// GetAllIssues retrieves all issues from the database
func GetAllIssues() ([]*Issue, error) {
	query := `
		SELECT id, repo_name, issue_body, status, workflow_id, created_at
		FROM issues
		ORDER BY created_at DESC`

	rows, err := GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query issues: %w", err)
	}
	defer rows.Close()

	var issues []*Issue
	for rows.Next() {
		var issue Issue
		if err := rows.Scan(
			&issue.ID,
			&issue.RepoName,
			&issue.IssueBody,
			&issue.Status,
			&issue.WorkflowID,
			&issue.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan issue: %w", err)
		}
		issues = append(issues, &issue)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating issues: %w", err)
	}

	return issues, nil
}

// DeleteIssue deletes an issue from the database by its ID
func DeleteIssue(id int) error {
	query := `DELETE FROM issues WHERE id = $1`

	result, err := GetDB().Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete issue: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("issue not found")
	}

	return nil
}
