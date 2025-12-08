package app

import (
	"context"
	"fmt"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

// IssueWorkflowInput is the input for the issue workflow
type IssueWorkflowInput struct {
	ReportID int
}

// IssueWorkflow generates an issue for a report and waits for approval
func IssueWorkflow(ctx dbos.DBOSContext, input IssueWorkflowInput) (string, error) {
	// Step 0: Read report from database
	var report *Report
	var err error

	report, err = dbos.RunAsStep(ctx, func(ctx context.Context) (*Report, error) {
		return GetReportByID(input.ReportID)
	}, dbos.WithStepName("readReport"))
	if err != nil {
		return "", fmt.Errorf("failed to read report: %w", err)
	}

	// Step 1: Generate issue content
	var issueBody string
	issueBody, err = dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
		openAIClient := NewOpenAIClient()
		return openAIClient.GenerateIssueContent(report.RepoName, report.RawReport)
	}, dbos.WithStepName("generateIssueContent"))
	if err != nil {
		return "", fmt.Errorf("failed to generate issue content: %w", err)
	}

	// Get workflow ID for tracking
	workflowID, err := dbos.GetWorkflowID(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get workflow ID: %w", err)
	}

	// Store issue in database with pending_approval status
	issue, err := CreateIssue(report.RepoName, issueBody, workflowID)
	if err != nil {
		return "", fmt.Errorf("failed to create issue: %w", err)
	}

	// Publish event to notify that issue generation is complete
	err = dbos.SetEvent(ctx, "ISSUE_GENERATED", fmt.Sprintf("Issue %d generated for %s", issue.ID, report.RepoName))
	if err != nil {
		return "", fmt.Errorf("failed to publish issue generated event: %w", err)
	}

	// Step 2: Wait for approval/rejection using DBOS.Recv
	// Receive message on topic "ISSUE_APPROVAL"
	topic := "ISSUE_APPROVAL"
	var approvalStatus string
	// Capture DBOSContext from outer scope for Recv
	dbosCtx := ctx
	approvalStatus, err = dbos.Recv[string](dbosCtx, topic, 48*time.Hour)
	if err != nil {
		return "", fmt.Errorf("failed to wait for approval: %w", err)
	}

	if approvalStatus == "" { // timeout
		return "", fmt.Errorf("timeout waiting for approval")
	}

	// Step 4: Update issue status based on received message
	_, err = dbos.RunAsStep(ctx, func(ctx context.Context) (bool, error) {
		err := UpdateIssueStatus(issue.ID, approvalStatus)
		return err == nil, err
	}, dbos.WithStepName("updateIssueStatus"))
	if err != nil {
		return "", fmt.Errorf("failed to update issue status: %w", err)
	}

	return fmt.Sprintf("Issue %d status: %s", issue.ID, approvalStatus), nil
}
