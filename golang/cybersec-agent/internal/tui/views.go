package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func (m App) View() string {
	switch m.viewState {
	case ViewBase:
		return m.viewBase()
	case ViewWorkflowsList:
		return m.viewWorkflowsList()
	case ViewWorkflowSteps:
		return m.viewWorkflowSteps()
	case ViewScanning:
		return m.viewScanning()
	case ViewScanResults:
		return m.viewScanResults()
	case ViewReportsList:
		return m.viewReportsList()
	case ViewIssuesList:
		return m.viewIssuesList()
	case ViewIssueDetail:
		return m.viewIssueDetail()
	case ViewIssueApproval:
		return m.viewIssueApproval()
	case ViewIssueResult:
		return m.viewIssueResult()
	case ViewIssueGenerating:
		return m.viewIssueGenerating()
	case ViewError:
		return m.viewError()
	default:
		return m.viewBase()
	}
}

func (m App) viewBase() string {
	// The header
	s := "DBOS Cybersecurity Durable Agent\n\n"
	s += "This durable agent can analyze security scans and generate issues for them.\n\n"
	s += "Durable agents resume where they left off and can be forked with updated instructions.\n\n"
	s += "Start by scanning reports, then generate an issue, and finally approve/reject the issue.\n\n"

	// Iterate over our choices
	for i, choice := range m.menuOptions {

		// Is the cursor pointing at this choice?
		cursor := " " // no cursor
		if m.selectedMenuOption == i {
			cursor = ">" // cursor!
		}

		// Is this choice selected?
		checked := " " // not selected
		if m.selectedMenuOption == i {
			checked = "x" // selected!
		}

		// Render the row
		s += fmt.Sprintf("%s [%s] %s\n", cursor, checked, choice)
	}

	// The footer
	s += "\nPress q to quit.\n"

	// Send the UI for rendering
	return s
}

func (m App) viewWorkflowsList() string {
	if len(m.workflows) == 0 {
		return "No workflows found.\n\nPress q to go back.\n"
	}

	tableStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240"))

	return fmt.Sprintf("Workflows\n\n%s\n\nPress Enter to view steps, q to go back.\n", tableStyle.Render(m.workflowsTable.View()))
}

func (m App) viewWorkflowSteps() string {
	if len(m.workflowSteps) == 0 {
		return fmt.Sprintf("Workflow Steps: %s\n\nNo steps found.\n\nPress q to go back.\n", m.selectedWorkflowID)
	}

	tableStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240"))

	helpText := "Press [f] to fork at selected step, q to go back."
	if m.forkSuccessMessage != "" {
		successStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("2")).
			Bold(true)
		helpText = successStyle.Render(m.forkSuccessMessage) + "\n\n" + helpText
	}

	return fmt.Sprintf("Workflow Steps: %s\n\n%s\n\n%s\n", m.selectedWorkflowID, tableStyle.Render(m.workflowStepsTable.View()), helpText)
}

func (m App) viewScanning() string {
	const padding = 2
	pad := strings.Repeat(" ", padding)

	var s string
	// Show different message based on whether workflow was resumed or newly started
	if m.isResumedWorkflow {
		s = "\nResuming vulnerability scan workflow...\n"
		s += pad + "(Workflow resumed from previous session)\n\n"
	} else {
		s = "\nRunning vulnerability scan...\n\n"
	}

	// Show progress bar if we have a total count
	if m.scanTotalReports > 0 {
		// Show completed report names before the progress bar if any
		if len(m.scanCompletedReportNames) > 0 {
			s += pad + "Completed reports:\n"
			for _, name := range m.scanCompletedReportNames {
				s += pad + "  ✓ " + name + "\n"
			}
			s += "\n"
		}

		progressBar := m.scanProgress.ViewAs(m.scanProgressPercent)
		s += pad + progressBar + "\n"
		s += fmt.Sprintf("%s%d/%d scans completed\n", pad, m.scanCompletedReports, m.scanTotalReports)
	} else {
		s += pad + "Initializing...\n"
	}

	s += "\n" + pad + "Press Ctrl+C to quit.\n"

	return s
}

func (m App) viewScanResults() string {
	s := "Vulnerability Scan Results\n\n"

	if m.scanError != nil {
		s += fmt.Sprintf("Error: %v\n", m.scanError)
	} else {
		if m.scanResult != "" {
			s += m.scanResult + "\n"
		} else {
			s += "No results.\n"
		}
	}

	s += "\nPress q to go back.\n"
	return s
}

func (m App) viewReportsList() string {
	if len(m.reports) == 0 {
		return "No reports pending for approval.\n\nPress q to go back.\n"
	}

	tableStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240"))

	return fmt.Sprintf("Reports Pending for Approval\n\n%s\n\nPress Enter to select a report, q to go back.\n", tableStyle.Render(m.reportsTable.View()))
}

func (m App) viewIssuesList() string {
	if len(m.issues) == 0 {
		return "No issues found.\n\nPress q to go back.\n"
	}

	tableStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240"))

	return fmt.Sprintf("Issues\n\n%s\n\nPress Enter to view issue, [d] to delete selected issue, q to go back.\n", tableStyle.Render(m.issuesTable.View()))
}

func (m App) viewIssueDetail() string {
	if !m.issueDetailReady {
		return "\n  Initializing..."
	}
	if m.currentIssue == nil {
		return "Loading issue...\n\nPlease wait...\n"
	}
	return fmt.Sprintf("%s\n%s\n%s", m.issueDetailHeaderView(), m.issueDetailViewport.View(), m.issueDetailFooterView())
}

func (m App) issueDetailHeaderView() string {
	title := fmt.Sprintf("Issue #%d - %s", m.currentIssue.ID, m.currentIssue.RepoName)
	titleStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("62")).
		Padding(0, 1).
		Bold(true)

	styledTitle := titleStyle.Render(title)
	width := m.issueDetailViewport.Width - lipgloss.Width(styledTitle)
	if width < 0 {
		width = 0
	}
	line := strings.Repeat("─", width)
	return lipgloss.JoinHorizontal(lipgloss.Center, styledTitle, line)
}

func (m App) issueDetailFooterView() string {
	// Show scroll percentage and action hints
	scrollInfo := fmt.Sprintf("%3.f%%", m.issueDetailViewport.ScrollPercent()*100)

	// Only show approve/reject hints if issue is pending approval and has a workflow ID
	actionHints := ""
	if m.currentIssue != nil && m.currentIssue.Status == "pending_approval" && m.currentIssue.WorkflowID != "" {
		actionHints = " [a]pprove [r]eject"
	}

	info := scrollInfo + actionHints
	infoStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("62")).
		Padding(0, 1)

	styledInfo := infoStyle.Render(info)
	width := m.issueDetailViewport.Width - lipgloss.Width(styledInfo)
	if width < 0 {
		width = 0
	}
	line := strings.Repeat("─", width)
	return lipgloss.JoinHorizontal(lipgloss.Center, line, styledInfo)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (m App) viewIssueApproval() string {
	if m.currentIssue == nil {
		return "Loading issue...\n\nPlease wait...\n"
	}

	s := "Issue Approval\n\n"
	s += fmt.Sprintf("Repository: %s\n\n", m.currentIssue.RepoName)
	s += "Issue Content:\n"
	s += "────────────────────────────────────────\n"
	s += m.currentIssue.IssueBody
	s += "\n────────────────────────────────────────\n\n"
	s += "Approve this issue? (y/n)\n"
	s += "\nPress y to approve, n to reject, q to cancel.\n"
	return s
}

func (m App) viewIssueResult() string {
	s := "Issue Workflow Result\n\n"

	if m.issueError != nil {
		s += fmt.Sprintf("Error: %v\n", m.issueError)
	} else {
		if m.issueResult != "" {
			s += m.issueResult + "\n"
		} else {
			s += "No result.\n"
		}
	}

	s += "\nPress q to go back.\n"
	return s
}

func (m App) viewIssueGenerating() string {
	const padding = 2
	pad := strings.Repeat(" ", padding)

	s := "\nGenerating issue...\n\n"
	s += pad + m.issueGeneratingSpinner.View() + " Please wait while the issue is being generated.\n"
	s += pad + "This may take a few moments...\n"
	s += "\n" + pad + "Press Ctrl+C to quit.\n"

	return s
}

func (m App) viewError() string {
	s := "Error\n\n"

	// Show which view redirected to the error
	s += fmt.Sprintf("Source View: %s\n\n", getViewName(m.errorSourceView))

	// Show error details
	if m.lastError != nil {
		s += fmt.Sprintf("Error Details:\n%v\n", m.lastError)
	} else {
		s += "Error Details:\nUnknown error occurred.\n"
	}

	s += "\nPress q to go back.\n"
	return s
}

// getViewName returns a human-readable name for a ViewState
func getViewName(view ViewState) string {
	switch view {
	case ViewBase:
		return "Base Menu"
	case ViewWorkflowsList:
		return "Workflows List"
	case ViewWorkflowSteps:
		return "Workflow Steps"
	case ViewScanning:
		return "Scanning"
	case ViewScanResults:
		return "Scan Results"
	case ViewReportsList:
		return "Reports List"
	case ViewIssuesList:
		return "Issues List"
	case ViewIssueDetail:
		return "Issue Detail"
	case ViewIssueApproval:
		return "Issue Approval"
	case ViewIssueResult:
		return "Issue Result"
	case ViewIssueGenerating:
		return "Issue Generating"
	case ViewError:
		return "Error View"
	default:
		return "Unknown View"
	}
}
