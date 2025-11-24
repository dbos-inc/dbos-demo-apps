package tui

import (
	"fmt"
	"strings"

	"sec-agent/internal/app"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

func (m App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Handle WindowSizeMsg globally to store window dimensions
	if ws, ok := msg.(tea.WindowSizeMsg); ok {
		m.windowWidth = ws.Width
		m.windowHeight = ws.Height
	}

	// Handle messages that apply to all views
	switch msg := msg.(type) {
	case pendingScanWorkflowMsg:
		// Check for pending scan workflow (on startup or menu selection)
		if msg.err != nil {
			// On error, just proceed to base view
			m.checkingPendingScan = false
			return m, nil
		}
		if msg.workflowID != "" {
			// Found a pending workflow - resume it
			m.scanWorkflowID = msg.workflowID
			m.isResumedWorkflow = true
			// Get total report count
			reportFiles, err := app.ReadReportFiles()
			if err != nil {
				// If we can't read report files, still show scanning view but without progress
				m.scanTotalReports = 0
			} else {
				m.scanTotalReports = len(reportFiles)
			}
			m.scanCompletedReports = 0
			m.scanCompletedReportNames = []string{}
			m.scanProgressPercent = 0.0
			m.viewState = ViewScanning
			m.checkingPendingScan = false
			// Start polling for progress
			return m, m.tickScanProgress()
		}
		// No pending workflow found
		// If checkingPendingScan is true, this means user selected "Start vulnerability scan" menu option
		// So we should start a new workflow
		if m.checkingPendingScan {
			m.checkingPendingScan = false
			m.isResumedWorkflow = false
			m.viewState = ViewScanning
			return m, tea.Batch(tea.ClearScreen, m.startScanWorkflow())
		}
		// Otherwise, just proceed normally (startup check with no pending workflow)
		return m, nil
	case []dbos.WorkflowStatus:
		// Received workflows list
		m.workflows = msg
		m.viewState = ViewWorkflowsList
		m.workflowsTable = m.buildWorkflowsTable()
		return m, tea.ClearScreen
	case scanWorkflowStartedMsg:
		// Scan workflow started - initialize progress tracking
		if msg.err != nil {
			m.scanError = msg.err
			m.scanResult = ""
			m.viewState = ViewScanResults
			return m, tea.ClearScreen
		}
		m.scanWorkflowID = msg.workflowID
		m.scanTotalReports = msg.totalReports
		m.scanCompletedReports = 0
		m.scanCompletedReportNames = []string{}
		m.scanProgressPercent = 0.0
		m.isResumedWorkflow = false // New workflow, not resumed
		// Start polling for progress (tickScanProgress will call pollScanProgress after delay)
		return m, m.tickScanProgress()
	case scanProgressMsg:
		// Received progress update
		if msg.err != nil {
			// On error, continue polling but don't update progress
			return m, m.tickScanProgress()
		}
		m.scanCompletedReports = msg.completed
		m.scanCompletedReportNames = msg.completedNames
		if msg.total > 0 {
			m.scanProgressPercent = float64(msg.completed) / float64(msg.total)
		}
		if msg.done {
			// All reports are done, stop progress polling and wait for final result
			return m, m.tickWaitForResult()
		}
		// Continue polling
		return m, m.tickScanProgress()
	case scanResultNotReadyMsg:
		// Result not ready yet, continue waiting
		return m, m.tickWaitForResult()
	case scanResultMsg:
		// Received scan result
		if msg.err != nil {
			m.scanError = msg.err
			m.scanResult = ""
		} else {
			m.scanError = nil
			// Convert []string result to a single string for display
			resultStr := ""
			if msg.result != nil {
				for i, line := range msg.result {
					if i > 0 {
						resultStr += "\n"
					}
					resultStr += line
				}
			}
			m.scanResult = resultStr
		}
		m.viewState = ViewScanResults
		return m, tea.ClearScreen
	case []dbos.StepInfo:
		// Received workflow steps
		m.workflowSteps = msg
		m.viewState = ViewWorkflowSteps
		m.workflowStepsTable = m.buildWorkflowStepsTable()
		// Clear fork success message when steps are refreshed
		m.forkSuccessMessage = ""
		return m, tea.ClearScreen
	case errorMsg:
		// Handle errors - display error message
		m, cmd := handleError(m, msg.err)
		return m, cmd
	case reportsMsg:
		// Received reports list
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		m.reports = msg.reports
		m.viewState = ViewReportsList
		m.reportsTable = m.buildReportsTable()
		return m, tea.ClearScreen
	case issuesMsg:
		// Received issues list
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		m.issues = msg.issues
		m.viewState = ViewIssuesList
		m.issuesTable = m.buildIssuesTable()
		return m, tea.ClearScreen
	case issueWorkflowStartedMsg:
		// Issue workflow started - check if event was received
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		// Event received - issue generation is complete, go back to base view
		m.issueWorkflowID = msg.workflowID
		m.viewState = ViewBase
		return m, tea.ClearScreen
	case issueApprovalReadyMsg:
		// Issue is ready for approval
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		m.currentIssue = msg.issue
		m.viewState = ViewIssueApproval
		return m, tea.ClearScreen
	case issueResultMsg:
		// Issue approval/rejection sent
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		// Successfully sent approval/rejection
		// Update issue status in the database and go back to main view
		if m.currentIssue != nil {
			status := "rejected"
			if strings.Contains(msg.result, "approved") {
				status = "approved"
			}
			// Update issue status in background (non-blocking)
			_ = app.UpdateIssueStatus(m.currentIssue.ID, status)
		}
		// Go back to main/base view
		m.viewState = ViewBase
		m.currentIssue = nil
		m.issueDetailReady = false
		m.renderedIssueBody = ""
		return m, tea.ClearScreen
	case issueLoadedMsg:
		// Issue loaded by ID - navigate to detail view
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		m.currentIssue = msg.issue
		m.viewState = ViewIssueDetail
		// Render markdown content
		renderedContent, err := renderMarkdown(m.currentIssue.IssueBody, m.windowWidth)
		if err != nil {
			// Fallback to plain text if rendering fails
			m.renderedIssueBody = m.currentIssue.IssueBody
		} else {
			m.renderedIssueBody = renderedContent
		}
		// Initialize viewport if we have window dimensions
		if m.windowWidth > 0 && m.windowHeight > 0 {
			// Calculate header and footer heights
			headerText := fmt.Sprintf("Issue #%d - %s", m.currentIssue.ID, m.currentIssue.RepoName)
			headerStyle := lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("62")).
				Padding(0, 1).
				Bold(true)
			headerHeight := lipgloss.Height(headerStyle.Render(headerText))

			footerText := "  0%"
			footerStyle := lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("62")).
				Padding(0, 1)
			footerHeight := lipgloss.Height(footerStyle.Render(footerText))

			verticalMarginHeight := headerHeight + footerHeight
			m.issueDetailViewport = viewport.New(m.windowWidth, m.windowHeight-verticalMarginHeight)
			m.issueDetailViewport.YPosition = headerHeight
			m.issueDetailViewport.SetContent(m.renderedIssueBody)
			m.issueDetailReady = true
		} else {
			m.issueDetailReady = false
		}
		return m, tea.ClearScreen
	case resetAppMsg:
		// Reset app completed
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		// Successfully reset - stay on base view
		return m, tea.ClearScreen
	case forkWorkflowMsg:
		// Fork workflow completed
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		// Successfully forked - show success message
		m.forkSuccessMessage = fmt.Sprintf("Workflow forked successfully! New workflow ID: %s", msg.newWorkflowID)
		m.lastError = nil
		// Refresh steps to show updated state
		return m, m.getWorkflowSteps()
	case deleteIssueMsg:
		// Issue deletion completed
		if msg.err != nil {
			m, cmd := handleError(m, msg.err)
			return m, cmd
		}
		// Successfully deleted - refresh the issues list
		return m, m.listAllIssues()
	}

	// Route to view-specific update handlers
	switch m.viewState {
	case ViewBase:
		return m.updateBaseView(msg)
	case ViewWorkflowsList:
		return m.updateWorkflowsView(msg)
	case ViewWorkflowSteps:
		return m.updateWorkflowStepsView(msg)
	case ViewScanning:
		return m.updateScanningView(msg)
	case ViewScanResults:
		return m.updateScanResultsView(msg)
	case ViewReportsList:
		return m.updateReportsView(msg)
	case ViewIssuesList:
		return m.updateIssuesView(msg)
	case ViewIssueDetail:
		return m.updateIssueDetailView(msg)
	case ViewIssueApproval:
		return m.updateIssueApprovalView(msg)
	case ViewIssueResult:
		return m.updateIssueResultView(msg)
	case ViewIssueGenerating:
		return m.updateIssueGeneratingView(msg)
	case ViewError:
		return m.updateErrorView(msg)
	default:
		return m, nil
	}
}

func (m App) updateBaseView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			return m, tea.Quit
		case "down":
			m.selectedMenuOption = (m.selectedMenuOption + 1) % len(m.menuOptions)
			return m, nil
		case "up":
			m.selectedMenuOption = (m.selectedMenuOption - 1 + len(m.menuOptions)) % len(m.menuOptions)
			return m, nil
		case "enter", " ":
			switch m.selectedMenuOption {
			case 0:
				//return m, tea.Batch(tea.ClearScreen, m.listWorkflows())
				return m, m.listWorkflows()
			case 1:
				// Check if there's already a pending scan workflow
				// If so, redirect to scanning view instead of starting a new one
				m.checkingPendingScan = true
				return m, m.checkPendingScanWorkflow()
			case 2:
				// Generate an Issue - list reports pending for approval
				return m, tea.Batch(tea.ClearScreen, m.listReportsPendingForApproval())
			case 3:
				// Validate issues - list all issues
				return m, tea.Batch(tea.ClearScreen, m.listAllIssues())
			case 4:
				// Reset app - clear all issues and reports
				return m, m.resetApp()
			}
		}
	}
	return m, nil
}

func (m App) updateWorkflowsView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear workflows
			m.viewState = ViewBase
			m.workflows = []dbos.WorkflowStatus{}
			return m, nil
		case "enter":
			// Get selected workflow ID directly from the workflows slice
			selectedIndex := m.workflowsTable.Cursor()
			if selectedIndex >= 0 && selectedIndex < len(m.workflows) {
				m.selectedWorkflowID = m.workflows[selectedIndex].ID
				return m, m.getWorkflowSteps()
			}
		}
	}
	// Update table
	m.workflowsTable, cmd = m.workflowsTable.Update(msg)
	return m, cmd
}

func (m App) updateWorkflowStepsView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to workflows list view and clear steps
			m.viewState = ViewWorkflowsList
			m.workflowSteps = []dbos.StepInfo{}
			m.selectedWorkflowID = ""
			return m, nil
		case "f", "F":
			// Fork workflow at selected step
			if m.selectedWorkflowID == "" {
				return m, nil
			}
			selectedIndex := m.workflowStepsTable.Cursor()
			if selectedIndex >= 0 && selectedIndex < len(m.workflowSteps) {
				selectedStep := m.workflowSteps[selectedIndex]
				stepNumber := selectedStep.StepID
				return m, m.forkWorkflow(m.selectedWorkflowID, stepNumber)
			}
		}
	}
	// Update table
	m.workflowStepsTable, cmd = m.workflowStepsTable.Update(msg)
	return m, cmd
}

// handleError sets error state and transitions to error view
func handleError(m App, err error) (App, tea.Cmd) {
	m.lastError = err
	m.errorSourceView = m.viewState
	m.viewState = ViewError
	return m, tea.ClearScreen
}

// buildTable creates a styled table with the given columns and rows
func buildTable(columns []table.Column, rows []table.Row) table.Model {
	// Calculate height: show all rows up to a maximum of 10
	// Height includes the header row, so we add 1
	height := len(rows) + 1
	if height > 11 {
		height = 11
	}
	// Ensure minimum height of at least 2 (1 header + 1 empty row) to show something
	if height < 2 {
		height = 2
	}
	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(true),
		table.WithHeight(height),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(true)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("229")).
		Background(lipgloss.Color("57")).
		Bold(false)
	t.SetStyles(s)

	return t
}

func (m App) buildWorkflowsTable() table.Model {
	columns := []table.Column{
		{Title: "ID", Width: 20},
		{Title: "Name", Width: 25},
		{Title: "Status", Width: 15},
		{Title: "Created At", Width: 19},
		{Title: "Error", Width: 30},
		{Title: "Output", Width: 30},
	}

	rows := []table.Row{}
	for _, workflow := range m.workflows {
		createdAtStr := "N/A"
		if !workflow.CreatedAt.IsZero() {
			createdAtStr = workflow.CreatedAt.Format("2006-01-02 15:04:05")
		}
		errorStr := ""
		if workflow.Error != nil {
			errorStr = workflow.Error.Error()
		}
		outputStr := ""
		if workflow.Output != nil {
			outputStr = fmt.Sprintf("%v", workflow.Output)
		}
		rows = append(rows, table.Row{
			workflow.ID,
			workflow.Name,
			string(workflow.Status),
			createdAtStr,
			errorStr,
			outputStr,
		})
	}

	return buildTable(columns, rows)
}

func (m App) updateIssuesView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear issues
			m.viewState = ViewBase
			m.issues = []*app.Issue{}
			return m, nil
		case "enter":
			// Select an issue and load it
			if len(m.issues) == 0 {
				// Update table and return if no issues
				m.issuesTable, cmd = m.issuesTable.Update(msg)
				return m, cmd
			}
			selectedIndex := m.issuesTable.Cursor()
			if selectedIndex >= 0 && selectedIndex < len(m.issues) {
				selectedIssueID := m.issues[selectedIndex].ID
				return m, m.loadIssueByID(selectedIssueID)
			}
		case "d", "D":
			// Delete the selected issue
			if len(m.issues) == 0 {
				// Update table and return if no issues
				m.issuesTable, cmd = m.issuesTable.Update(msg)
				return m, cmd
			}
			selectedIndex := m.issuesTable.Cursor()
			if selectedIndex >= 0 && selectedIndex < len(m.issues) {
				selectedIssueID := m.issues[selectedIndex].ID
				return m, m.deleteIssue(selectedIssueID)
			}
		}
	}
	// Update table
	m.issuesTable, cmd = m.issuesTable.Update(msg)
	return m, cmd
}

func (m App) updateIssueDetailView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var (
		cmd  tea.Cmd
		cmds []tea.Cmd
	)

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to issues list
			m.viewState = ViewIssuesList
			m.currentIssue = nil
			m.issueDetailReady = false
			m.renderedIssueBody = ""
			return m, nil
		case "a", "A":
			// Approve the issue
			if m.currentIssue != nil && m.currentIssue.WorkflowID != "" {
				return m, m.sendIssueApproval(m.currentIssue.WorkflowID, true)
			}
		case "r", "R":
			// Reject the issue
			if m.currentIssue != nil && m.currentIssue.WorkflowID != "" {
				return m, m.sendIssueApproval(m.currentIssue.WorkflowID, false)
			}
		}
	case tea.WindowSizeMsg:
		if m.currentIssue == nil {
			// Issue not loaded yet, skip viewport initialization
			return m, nil
		}
		headerHeight := lipgloss.Height(m.issueDetailHeaderView())
		footerHeight := lipgloss.Height(m.issueDetailFooterView())
		verticalMarginHeight := headerHeight + footerHeight

		if !m.issueDetailReady {
			// Initialize viewport with window dimensions
			// Re-render markdown if window width changed (for word wrapping)
			if m.renderedIssueBody == "" || m.windowWidth != msg.Width {
				renderedContent, err := renderMarkdown(m.currentIssue.IssueBody, msg.Width)
				if err != nil {
					// Fallback to plain text if rendering fails
					m.renderedIssueBody = m.currentIssue.IssueBody
				} else {
					m.renderedIssueBody = renderedContent
				}
			}
			m.issueDetailViewport = viewport.New(msg.Width, msg.Height-verticalMarginHeight)
			m.issueDetailViewport.YPosition = headerHeight
			m.issueDetailViewport.SetContent(m.renderedIssueBody)
			m.issueDetailReady = true
		} else {
			// Update existing viewport dimensions
			// Re-render markdown if window width changed significantly (for word wrapping)
			if m.windowWidth != msg.Width {
				renderedContent, err := renderMarkdown(m.currentIssue.IssueBody, msg.Width)
				if err != nil {
					// Keep existing rendered content if re-rendering fails
				} else {
					m.renderedIssueBody = renderedContent
					m.issueDetailViewport.SetContent(m.renderedIssueBody)
				}
			}
			m.issueDetailViewport.Width = msg.Width
			m.issueDetailViewport.Height = msg.Height - verticalMarginHeight
		}
		return m, nil
	}

	// Handle keyboard and mouse events in the viewport (only if ready)
	if m.issueDetailReady {
		m.issueDetailViewport, cmd = m.issueDetailViewport.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m App) buildIssuesTable() table.Model {
	columns := []table.Column{
		{Title: "ID", Width: 8},
		{Title: "Repo Name", Width: 30},
		{Title: "Status", Width: 20},
		{Title: "Created At", Width: 19},
	}

	rows := []table.Row{}
	for _, issue := range m.issues {
		createdAtStr := issue.CreatedAt.Format("2006-01-02 15:04:05")
		rows = append(rows, table.Row{
			fmt.Sprintf("%d", issue.ID),
			issue.RepoName,
			issue.Status,
			createdAtStr,
		})
	}

	return buildTable(columns, rows)
}

func (m App) updateIssueApprovalView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "y", "Y":
			// Approve the issue
			return m, m.sendIssueApproval(m.issueWorkflowID, true)
		case "n", "N":
			// Reject the issue
			return m, m.sendIssueApproval(m.issueWorkflowID, false)
		case "q", "esc":
			// Go back (but workflow is still waiting, so this might not be ideal)
			// For now, allow going back
			m.viewState = ViewBase
			m.currentIssue = nil
			m.issueWorkflowID = ""
			return m, nil
		}
	}
	return m, nil
}

func (m App) updateIssueResultView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear issue result
			m.viewState = ViewBase
			m.issueResult = ""
			m.issueError = nil
			m.currentIssue = nil
			m.issueWorkflowID = ""
			return m, nil
		}
	}
	return m, nil
}

func (m App) buildWorkflowStepsTable() table.Model {
	columns := []table.Column{
		{Title: "Step #", Width: 8},
		{Title: "Name", Width: 30},
		{Title: "Status", Width: 20},
		{Title: "Error", Width: 30},
	}

	rows := []table.Row{}
	for _, step := range m.workflowSteps {
		statusStr := "Success"
		if step.Error != nil {
			statusStr = "Error"
		}

		errorStr := ""
		if step.Error != nil {
			errorStr = step.Error.Error()
		}

		rows = append(rows, table.Row{
			fmt.Sprintf("%d", step.StepID),
			step.StepName,
			statusStr,
			errorStr,
		})
	}

	return buildTable(columns, rows)
}

func (m App) updateScanningView(msg tea.Msg) (tea.Model, tea.Cmd) {
	// While scanning, only allow Ctrl+C to quit
	// The scan result will be handled in the main Update function
	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Allow Ctrl+C to quit even during scan
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		// Update progress bar width on window resize
		const padding = 2
		const maxWidth = 80
		m.scanProgress.Width = msg.Width - padding*2 - 4
		if m.scanProgress.Width > maxWidth {
			m.scanProgress.Width = maxWidth
		}
		return m, nil
	}
	return m, nil
}

func (m App) updateScanResultsView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear scan results
			m.viewState = ViewBase
			m.scanResult = ""
			m.scanError = nil
			return m, nil
		}
	}
	return m, nil
}

func (m App) updateIssueGeneratingView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	// While generating, only allow Ctrl+C to quit
	// The issueWorkflowStartedMsg will be handled in the main Update function
	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Allow Ctrl+C to quit even during generation
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
	}
	// Update spinner to animate
	m.issueGeneratingSpinner, cmd = m.issueGeneratingSpinner.Update(msg)
	return m, cmd
}

func (m App) updateErrorView(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear error
			m.viewState = ViewBase
			m.lastError = nil
			m.errorSourceView = ViewBase
			return m, nil
		}
	}
	return m, nil
}

func (m App) updateReportsView(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q", "esc":
			// Go back to base view and clear reports
			m.viewState = ViewBase
			m.reports = []*app.Report{}
			return m, nil
		case "enter":
			// Select a report and start the issue workflow
			selectedIndex := m.reportsTable.Cursor()
			if selectedIndex >= 0 && selectedIndex < len(m.reports) {
				m.selectedReportID = m.reports[selectedIndex].ID
				// Switch to generating view and start workflow
				m.viewState = ViewIssueGenerating
				// Start the spinner
				spinnerCmd := m.issueGeneratingSpinner.Tick
				return m, tea.Batch(tea.ClearScreen, spinnerCmd, m.startIssueWorkflow(m.selectedReportID))
			}
		}
	}
	// Update table
	m.reportsTable, cmd = m.reportsTable.Update(msg)
	return m, cmd
}

func (m App) buildReportsTable() table.Model {
	columns := []table.Column{
		{Title: "ID", Width: 8},
		{Title: "Repo Name", Width: 30},
		{Title: "Has Vuln", Width: 12},
		{Title: "Created At", Width: 19},
	}

	rows := []table.Row{}
	for _, report := range m.reports {
		hasVulnStr := "No"
		if report.HasVuln {
			hasVulnStr = "Yes"
		}
		createdAtStr := report.CreatedAt.Format("2006-01-02 15:04:05")
		rows = append(rows, table.Row{
			fmt.Sprintf("%d", report.ID),
			report.RepoName,
			hasVulnStr,
			createdAtStr,
		})
	}

	return buildTable(columns, rows)
}
