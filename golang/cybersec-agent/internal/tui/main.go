package tui

import (
	"database/sql"
	"fmt"

	"sec-agent/internal/app"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

// Run starts the TUI
func Run(dbosCtx dbos.DBOSContext, db *sql.DB) error {
	model := initialModel(dbosCtx, db)
	p := tea.NewProgram(model)
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}
	return nil
}

// ViewState represents the current view state
type ViewState int

const (
	ViewBase ViewState = iota
	ViewWorkflowsList
	ViewWorkflowSteps
	ViewScanning
	ViewScanResults
	ViewReportsList
	ViewIssuesList
	ViewIssueDetail
	ViewIssueApproval
	ViewIssueResult
	ViewIssueGenerating
	ViewError
)

// App holds the TUI application state
type App struct {
	dbosCtx                  dbos.DBOSContext
	db                       *sql.DB
	selectedMenuOption       int
	menuOptions              []string
	viewState                ViewState
	workflows                []dbos.WorkflowStatus
	workflowsTable           table.Model
	selectedWorkflowID       string
	workflowSteps            []dbos.StepInfo
	workflowStepsTable       table.Model
	scanResult               string
	scanError                error
	reports                  []*app.Report
	reportsTable             table.Model
	selectedReportID         int
	issues                   []*app.Issue
	issuesTable              table.Model
	issueWorkflowID          string
	currentIssue             *app.Issue
	issueDetailViewport      viewport.Model
	issueDetailReady         bool
	renderedIssueBody        string // Cached rendered markdown content
	windowWidth              int
	windowHeight             int
	issueResult              string
	issueError               error
	lastError                error
	errorSourceView          ViewState // Tracks which view redirected to the error view
	scanProgress             progress.Model
	scanProgressPercent      float64
	scanTotalReports         int
	scanCompletedReports     int
	scanCompletedReportNames []string // Names of completed reports
	scanWorkflowID           string
	checkingPendingScan      bool   // Flag to track if we're checking for pending scan from menu
	isResumedWorkflow        bool   // Flag to track if the current workflow was resumed
	forkSuccessMessage       string // Message to show when fork is successful
	issueGeneratingSpinner   spinner.Model
}

// initialModel returns the initial model

var baseViewOptions = []string{
	" List workflows",
	" Start vulnerability scan",
	" Generate an issue",
	" Manage issues",
	" Reset issues and reports database",
}

func initialModel(dbosCtx dbos.DBOSContext, db *sql.DB) App {
	const defaultWidth = 40

	prog := progress.New(progress.WithDefaultGradient())
	prog.Width = defaultWidth

	sp := spinner.New()
	sp.Spinner = spinner.Dot
	sp.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("62"))

	return App{
		dbosCtx:                  dbosCtx,
		db:                       db,
		selectedMenuOption:       0,
		menuOptions:              baseViewOptions,
		viewState:                ViewBase,
		workflows:                []dbos.WorkflowStatus{},
		selectedWorkflowID:       "",
		workflowSteps:            []dbos.StepInfo{},
		reports:                  []*app.Report{},
		scanProgress:             prog,
		scanProgressPercent:      0.0,
		scanTotalReports:         0,
		scanCompletedReports:     0,
		scanCompletedReportNames: []string{},
		scanWorkflowID:           "",
		checkingPendingScan:      false,
		isResumedWorkflow:        false,
		issueGeneratingSpinner:   sp,
	}
}

// Init is called when the program starts
func (m App) Init() tea.Cmd {
	// Check for pending scan workflow on startup
	return m.checkPendingScanWorkflow()
}
