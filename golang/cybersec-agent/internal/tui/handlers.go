package tui

import (
	"fmt"
	"strings"
	"time"

	"sec-agent/internal/app"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

// listWorkflows returns a command that lists all workflows
func (m App) listWorkflows() tea.Cmd {
	return func() tea.Msg {
		fmt.Println("listing workflows")
		workflows, err := dbos.ListWorkflows(m.dbosCtx)
		if err != nil {
			fmt.Printf("error listing workflows: %v\n", err)
			return errorMsg{err: fmt.Errorf("error listing workflows: %w", err)}
		}

		fmt.Printf("workflows: %v\n", workflows)
		return workflows
	}
}

// checkPendingScanWorkflow checks if there's a pending scan workflow
func (m App) checkPendingScanWorkflow() tea.Cmd {
	return func() tea.Msg {
		workflows, err := dbos.ListWorkflows(m.dbosCtx)
		if err != nil {
			return pendingScanWorkflowMsg{err: fmt.Errorf("failed to list workflows: %w", err)}
		}

		// Look for a pending "scan_workflow" workflow
		for _, workflow := range workflows {
			if workflow.Name == "scan_workflow" && string(workflow.Status) == "PENDING" {
				return pendingScanWorkflowMsg{workflowID: workflow.ID, err: nil}
			}
		}

		// No pending workflow found
		return pendingScanWorkflowMsg{workflowID: "", err: nil}
	}
}

// startScanWorkflow returns a command that starts the scan workflow
func (m App) startScanWorkflow() tea.Cmd {
	return func() tea.Msg {
		// First, get total report count
		reportFiles, err := app.ReadReportFiles()
		if err != nil {
			return scanResultMsg{err: fmt.Errorf("failed to read report files: %w", err)}
		}

		totalReports := len(reportFiles)
		if totalReports == 0 {
			return scanResultMsg{err: fmt.Errorf("no report files found")}
		}

		// Start workflow asynchronously with fixed workflow ID for determinism
		handle, err := dbos.RunWorkflow(m.dbosCtx, app.ScanWorkflow, "")
		if err != nil {
			return scanResultMsg{err: fmt.Errorf("failed to start scan workflow: %w", err)}
		}

		workflowID := handle.GetWorkflowID()

		// Return a message with workflow ID and total count to start polling
		return scanWorkflowStartedMsg{
			workflowID:   workflowID,
			totalReports: totalReports,
			err:          nil,
		}
	}
}

// scanWorkflowStartedMsg is sent when the scan workflow starts
type scanWorkflowStartedMsg struct {
	workflowID   string
	totalReports int
	err          error
}

// pendingScanWorkflowMsg is sent when checking for pending scan workflows
type pendingScanWorkflowMsg struct {
	workflowID string
	err        error
}

// pollScanProgress polls the workflow steps to get progress
func (m App) pollScanProgress() tea.Cmd {
	return func() tea.Msg {
		if m.scanWorkflowID == "" {
			return scanProgressMsg{completed: 0, total: 0, done: false, completedNames: []string{}}
		}

		steps, err := dbos.GetWorkflowSteps(m.dbosCtx, m.scanWorkflowID)
		if err != nil {
			return scanProgressMsg{completed: 0, total: 0, done: false, err: err, completedNames: []string{}}
		}

		// Count completed "storeReport-*" steps and extract report names
		completed := 0
		completedNames := []string{}
		for _, step := range steps {
			if strings.HasPrefix(step.StepName, "storeReport-") && step.Error == nil {
				completed++
				// Extract report name from step name (format: "storeReport-{repoName}")
				reportName := strings.TrimPrefix(step.StepName, "storeReport-")
				if reportName != "" {
					completedNames = append(completedNames, reportName)
				}
			}
		}

		// Check if workflow is done by checking if all reports are completed
		done := false
		if m.scanTotalReports > 0 && completed >= m.scanTotalReports {
			done = true
		}

		return scanProgressMsg{
			completed:      completed,
			total:          m.scanTotalReports,
			done:           done,
			completedNames: completedNames,
			err:            nil,
		}
	}
}

// scanProgressMsg is sent when progress is updated
type scanProgressMsg struct {
	completed      int
	total          int
	done           bool
	completedNames []string // Names of completed reports
	err            error
}

// Message types
type errorMsg struct {
	err error
}

type scanResultMsg struct {
	result []string
	err    error
}

// waitForScanResult checks if the scan workflow result is ready
func (m App) waitForScanResult() tea.Cmd {
	return func() tea.Msg {
		if m.scanWorkflowID == "" {
			return scanResultMsg{err: fmt.Errorf("no workflow ID")}
		}

		// Retrieve the workflow handle
		handle, err := dbos.RetrieveWorkflow[[]string](m.dbosCtx, m.scanWorkflowID)
		if err != nil {
			// If we can't retrieve the workflow, return error
			return scanResultMsg{err: fmt.Errorf("failed to retrieve workflow: %w", err)}
		}

		// Try to get the result (non-blocking check)
		result, err := handle.GetResult()
		if err != nil {
			// Result not ready yet, return a message to retry
			return scanResultNotReadyMsg{}
		}

		// Result is ready
		return scanResultMsg{result: result, err: nil}
	}
}

// scanResultNotReadyMsg indicates the result is not ready yet and we should retry
type scanResultNotReadyMsg struct{}

// tickScanProgress returns a command that polls progress after a delay
func (m App) tickScanProgress() tea.Cmd {
	return tea.Tick(300*time.Millisecond, func(time.Time) tea.Msg {
		return m.pollScanProgress()()
	})
}

// tickWaitForResult returns a command that checks for result after a delay
func (m App) tickWaitForResult() tea.Cmd {
	return tea.Tick(300*time.Millisecond, func(time.Time) tea.Msg {
		return m.waitForScanResult()()
	})
}

// getWorkflowSteps returns a command that gets workflow steps
func (m App) getWorkflowSteps() tea.Cmd {
	return func() tea.Msg {
		steps, err := dbos.GetWorkflowSteps(m.dbosCtx, m.selectedWorkflowID)
		if err != nil {
			return errorMsg{err: fmt.Errorf("error getting workflow steps: %w", err)}
		}

		return steps
	}
}

// reportsMsg is a message type for reports list
type reportsMsg struct {
	reports []*app.Report
	err     error
}

// listReportsPendingForApproval returns a command that lists reports pending for approval
func (m App) listReportsPendingForApproval() tea.Cmd {
	return func() tea.Msg {
		reports, err := app.GetReportsPendingForApproval()
		if err != nil {
			return errorMsg{err: fmt.Errorf("error listing reports pending for approval: %w", err)}
		}

		return reportsMsg{reports: reports, err: nil}
	}
}

// startIssueWorkflow returns a command that starts the issue workflow for a report
// The workflow will create the issue and wait for approval
func (m App) startIssueWorkflow(reportID int) tea.Cmd {
	return func() tea.Msg {
		input := app.IssueWorkflowInput{ReportID: reportID}
		noCancelCtx := dbos.WithoutCancel(m.dbosCtx)
		handle, err := dbos.RunWorkflow(noCancelCtx, app.IssueWorkflow, input)
		if err != nil {
			return issueWorkflowStartedMsg{err: fmt.Errorf("failed to start issue workflow: %w", err)}
		}

		// Get workflow ID immediately
		workflowID := handle.GetWorkflowID()

		// Wait for the workflow to publish the ISSUE_GENERATED event
		eventData, err := dbos.GetEvent[string](noCancelCtx, workflowID, "ISSUE_GENERATED", 5*time.Minute)
		if err != nil {
			return issueWorkflowStartedMsg{err: fmt.Errorf("failed to wait for issue generation event: %w", err)}
		}

		// Event received - issue generation is complete
		return issueWorkflowStartedMsg{workflowID: workflowID, eventData: eventData, err: nil}
	}
}

// sendIssueApproval sends an approval/rejection message to the workflow
func (m App) sendIssueApproval(workflowID string, approved bool) tea.Cmd {
	return func() tea.Msg {
		status := "rejected"
		if approved {
			status = "approved"
		}

		err := dbos.Send(m.dbosCtx, workflowID, status, "ISSUE_APPROVAL")
		if err != nil {
			return issueResultMsg{err: fmt.Errorf("failed to send approval: %w", err)}
		}

		return issueResultMsg{result: fmt.Sprintf("Issue %s", status), err: nil}
	}
}

// issueWorkflowStartedMsg is sent when the workflow starts
type issueWorkflowStartedMsg struct {
	workflowID string
	eventData  string
	err        error
}

// issueApprovalReadyMsg is sent when the issue is ready for approval
type issueApprovalReadyMsg struct {
	issue *app.Issue
	err   error
}

// issueResultMsg is a message type for issue workflow result
type issueResultMsg struct {
	result string
	err    error
}

// listAllIssues returns a command that lists all issues from the database
func (m App) listAllIssues() tea.Cmd {
	return func() tea.Msg {
		issues, err := app.GetAllIssues()
		if err != nil {
			return errorMsg{err: fmt.Errorf("error listing issues: %w", err)}
		}

		return issuesMsg{issues: issues, err: nil}
	}
}

// issuesMsg is a message type for issues list
type issuesMsg struct {
	issues []*app.Issue
	err    error
}

// issueLoadedMsg is a message type for when an issue is loaded by ID
type issueLoadedMsg struct {
	issue *app.Issue
	err   error
}

// loadIssueByID returns a command that loads an issue by its ID
func (m App) loadIssueByID(issueID int) tea.Cmd {
	return func() tea.Msg {
		issue, err := app.GetIssueByID(issueID)
		if err != nil {
			return issueLoadedMsg{err: fmt.Errorf("error loading issue: %w", err)}
		}
		return issueLoadedMsg{issue: issue, err: nil}
	}
}

// renderMarkdown renders markdown content to ANSI-colored text for terminal display
func renderMarkdown(markdown string, width int) (string, error) {
	// Create a renderer with auto-detected style based on terminal
	renderer, err := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(width),
	)
	if err != nil {
		return "", fmt.Errorf("failed to create markdown renderer: %w", err)
	}

	// Render the markdown to ANSI-colored text
	out, err := renderer.Render(markdown)
	if err != nil {
		return "", fmt.Errorf("failed to render markdown: %w", err)
	}

	return out, nil
}

// resetAppMsg is a message type for reset app result
type resetAppMsg struct {
	err error
}

// resetApp returns a command that clears all issues and reports
func (m App) resetApp() tea.Cmd {
	return func() tea.Msg {
		err := app.ClearAllData()
		if err != nil {
			return resetAppMsg{err: fmt.Errorf("failed to reset app: %w", err)}
		}
		return resetAppMsg{err: nil}
	}
}

// forkWorkflowMsg is a message type for fork workflow result
type forkWorkflowMsg struct {
	newWorkflowID string
	err           error
}

// forkWorkflow returns a command that forks a workflow from a specific step
func (m App) forkWorkflow(workflowID string, stepNumber int) tea.Cmd {
	return func() tea.Msg {
		input := dbos.ForkWorkflowInput{
			OriginalWorkflowID: workflowID,
			StartStep:          uint(stepNumber),
		}
		handle, err := dbos.ForkWorkflow[any](m.dbosCtx, input)
		if err != nil {
			return forkWorkflowMsg{err: fmt.Errorf("failed to fork workflow: %w", err)}
		}
		newID := handle.GetWorkflowID()
		return forkWorkflowMsg{newWorkflowID: newID, err: nil}
	}
}

// deleteIssueMsg is a message type for delete issue result
type deleteIssueMsg struct {
	issueID int
	err     error
}

// deleteIssue returns a command that deletes an issue by its ID
func (m App) deleteIssue(issueID int) tea.Cmd {
	return func() tea.Msg {
		err := app.DeleteIssue(issueID)
		if err != nil {
			return deleteIssueMsg{issueID: issueID, err: fmt.Errorf("failed to delete issue: %w", err)}
		}
		return deleteIssueMsg{issueID: issueID, err: nil}
	}
}
