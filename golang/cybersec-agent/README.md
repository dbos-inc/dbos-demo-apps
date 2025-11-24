# DBOS Security Agent - Sample Application

A **DBOS Transact** sample application demonstrating durable workflows, workflow signaling, and human-in-the-loop interactions in the context of AI-powered security analysis.

This application showcases how DBOS Transact enables developers to build resilient, long-running workflows that can:
- Automatically resume from the last completed step after failures
- Wait indefinitely for human approval (human-in-the-loop)
- Use events and messaging for workflow coordination
- Fork workflows at specific steps to retry with updated context (especially useful for AI applications)

![Durable Workflow and Human-in-the-Loop Demonstration](durableworkflow.gif)

*This GIF demonstrates a scan workflow being interrupted mid-execution and automatically resuming after restart, as well as the issue validation workflow waiting for human approval using workflow signaling.*

## What is DBOS Transact?

[DBOS Transact](https://github.com/dbos-inc/dbos-transact-golang) is a lightweight durable workflow orchestration framework built on PostgreSQL. It provides:

- **Durable execution**: Workflows automatically resume from the last completed step after crashes or restarts
- **Exactly-once guarantees**: All workflow state is persisted in PostgreSQL
- **Workflow signaling**: Built-in support for events and messaging between workflows
- **Workflow forking**: Create new workflows from specific steps of existing workflows

## Key DBOS Features Demonstrated

### 1. Durable Workflows with Automatic Recovery

Workflows in this application are built using DBOS steps (`dbos.RunAsStep`). Each step is automatically persisted, so if the application crashes or is restarted, workflows resume exactly where they left off.

**Example from `ScanWorkflow`:**
```go
// Each report processing is a separate step
rawReport, err := dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
    return readReportFile(reportPath)
}, dbos.WithStepName(fmt.Sprintf("readReport-%s", repoName)))

hasVuln, err := dbos.RunAsStep(ctx, func(ctx context.Context) (bool, error) {
    return openAIClient.DetectVulnerability(rawReport)
}, dbos.WithStepName(fmt.Sprintf("detectVuln-%s", repoName)))
```

If the workflow is interrupted after processing 3 out of 10 reports, it will automatically resume and continue from report 4 when restarted.

### 2. Long-Lived Workflows with Human-in-the-Loop

The `IssueWorkflow` demonstrates how workflows can wait indefinitely for human interaction using DBOS's `Recv` pattern:

```go
// Step 1: Generate issue content using AI
issueBody, err = dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
    openAIClient := NewOpenAIClient()
    return openAIClient.GenerateIssueContent(report.RepoName, report.RawReport)
}, dbos.WithStepName("generateIssueContent"))

// Step 2: Wait for human approval (can wait up to 48 hours)
approvalStatus, err = dbos.Recv[string](dbosCtx, "ISSUE_APPROVAL", 48*time.Hour)
```

The workflow can be paused for hours or days while waiting for human approval. If the application restarts during this time, the workflow will resume and continue waiting for the approval message.

### 3. Workflow Signaling with Events and Messages

This application demonstrates two signaling patterns:

#### SetEvent / GetEvent Pattern

Workflows can emit events that other parts of the application can listen for:

```go
// In IssueWorkflow: Emit event when issue generation is complete
err = dbos.SetEvent(ctx, "ISSUE_GENERATED", fmt.Sprintf("Issue %d generated for %s", issue.ID, report.RepoName))

// In TUI handler: Wait for the event
eventData, err := dbos.GetEvent[string](noCancelCtx, workflowID, "ISSUE_GENERATED", 5*time.Minute)
```

#### Recv / Send Pattern

Workflows can receive messages on topics, enabling coordination between workflows and external systems:

```go
// In IssueWorkflow: Wait for approval message
approvalStatus, err = dbos.Recv[string](dbosCtx, "ISSUE_APPROVAL", 48*time.Hour)

// In TUI handler: Send approval message
err := dbos.Send(m.dbosCtx, workflowID, status, "ISSUE_APPROVAL")
```

### 4. Workflow Forking for AI Applications

A powerful feature for AI applications is the ability to **fork workflows at specific steps**. This is particularly useful when:

- An LLM call produces unsatisfactory results
- You need to fix a prompt and retry
- You want to experiment with different prompts without losing previous work

**How it works:**

1. Each LLM call is wrapped in a DBOS step with a descriptive name:
   ```go
   issueBody, err = dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
       openAIClient := NewOpenAIClient()
       return openAIClient.GenerateIssueContent(report.RepoName, report.RawReport)
   }, dbos.WithStepName("generateIssueContent"))
   ```

2. If the generated issue content is unsatisfactory, you can fork the workflow from the step before the LLM call:
   ```go
   input := dbos.ForkWorkflowInput{
       OriginalWorkflowID: workflowID,
       StartStep:          stepNumber, // Step before the LLM call
   }
   handle, err := dbos.ForkWorkflow[any](ctx, input)
   ```

3. The new workflow starts from that step with the same context, but you can modify the prompt in the LLM client before the step runs.

**Why this is powerful for AI apps:**

- **No lost work**: Previous steps (reading the report, detecting vulnerabilities) are preserved
- **Fast iteration**: Only re-run the expensive LLM call, not the entire workflow
- **Experiment safely**: Try different prompts without affecting the original workflow
- **Context preservation**: All previous workflow state is available

The TUI in this application allows you to view workflow steps and fork from any step by pressing `f`.

## Application Overview

This security agent application:

1. **Scans security reports** from the `reports/` folder. These have been generated with [trivy](http://trivy.dev/)
2. **Uses AI** (OpenAI GPT-4o-mini) to detect vulnerabilities and generate GitHub issue content
3. **Waits for human approval** before finalizing issues
4. **Provides a TUI** for workflow management and issue review

### Workflows

- **`ScanWorkflow`**: Processes multiple security scan reports, each as a separate step
- **`IssueWorkflow`**: Generates a GitHub issue for a vulnerability report and waits for approval

## Prerequisites

- Go 1.21 or later
- Docker and Docker Compose
- OpenAI API key (set `OPENAI_API_KEY` environment variable)

## Setup

1. **Start services (PostgreSQL):**
   ```bash
   docker-compose up -d
   ```

2. **Set environment variables:**
   ```bash
   export DBOS_SYSTEM_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sec_agent?sslmode=disable"
   export OPENAI_API_KEY="your-api-key-here"
   export OPENAI_MODEL="gpt-4o-mini"  # Optional, defaults to gpt-4o-mini
   ```

3. **Build and run:**
   ```bash
   go build -o sec-agent ./cmd/sec-agent
   ./sec-agent
   ```

## Usage

### TUI Navigation

- **Arrow keys**: Navigate lists
- **Enter**: Select/start workflows
- **m**: Show menu to start workflows
- **i**: Show pending issues
- **a**: Approve selected issue
- **r**: Reject selected issue
- **f**: Fork workflow at selected step (when viewing workflow steps)
- **q**: Quit or go back

### Workflow Management

1. **Start a scan workflow**: Processes all reports in the `reports/` folder
2. **Generate an issue**: Select a report with vulnerabilities and generate a GitHub issue
3. **Review and approve**: View generated issues and approve or reject them
4. **View workflows**: See all workflows and their execution status
5. **Fork workflows**: View workflow steps and fork from any step to retry with updated context

## Project Structure

```
sec-agent/
├── cmd/sec-agent/          # Main application entry point
├── internal/
│   ├── app/                # Core application logic
│   │   ├── scan_workflow.go    # Scan workflow implementation
│   │   ├── issue_workflow.go   # Issue workflow with human-in-the-loop
│   │   ├── openai.go           # OpenAI client for LLM calls
│   │   └── ...
│   └── tui/                # Terminal user interface
│       ├── handlers.go         # Workflow management handlers
│       ├── views.go            # TUI views
│       └── ...
├── internal/app/reports/   # Sample security scan reports
├── docker-compose.yml      # PostgreSQL setup
└── README.md
```

## Database Schema

- **reports**: Stores security scan results
- **issues**: Stores generated GitHub issues with approval status and workflow IDs

## Learn More

- [DBOS Transact Documentation](https://docs.dbos.dev/golang/programming-guide)
- [DBOS Transact GitHub](https://github.com/dbos-inc/dbos-transact-golang)
- [DBOS.md](./DBOS.md) - Package documentation for DBOS Transact

## License

MIT
