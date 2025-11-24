# DBOS Security Agent - Sample Application

A **DBOS Transact** sample application demonstrating durable workflows, workflow signaling, and human-in-the-loop interactions in the context of AI-powered security analysis:
- **Automatic recovery**: Workflows resume from the last completed step after crashes or restarts
- **Human-in-the-loop**: Workflows can wait indefinitely for human approval
- **Workflow signaling**: Events and messaging for coordination
- **Workflow forking**: Retry from specific steps with updated LLM context

## What This Demo Does

This security agent scans security reports, uses AI to detect vulnerabilities and generate GitHub issues, and waits for human approval before finalizing. It demonstrates how DBOS Transact handles long-running, resilient workflows.

![Durable Workflow and Human-in-the-Loop Demonstration](durableworkflow.gif)

### Durable Workflows with Automatic Recovery

Each step is persisted, so workflows resume exactly where they left off:

```go
// Each report processing is a separate step
rawReport, err := dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
    return readReportFile(reportPath)
}, dbos.WithStepName(fmt.Sprintf("readReport-%s", repoName)))

hasVuln, err := dbos.RunAsStep(ctx, func(ctx context.Context) (bool, error) {
    return openAIClient.DetectVulnerability(rawReport)
}, dbos.WithStepName(fmt.Sprintf("detectVuln-%s", repoName)))
```

If interrupted after processing 3 out of 10 reports, it automatically resumes from report 4.

### Human-in-the-Loop with Workflow Signaling

Workflows can wait indefinitely for human interaction:

```go
// Generate issue content using AI
issueBody, err = dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
    openAIClient := NewOpenAIClient()
    return openAIClient.GenerateIssueContent(report.RepoName, report.RawReport)
}, dbos.WithStepName("generateIssueContent"))

// Wait for human approval (can wait up to 48 hours)
approvalStatus, err = dbos.Recv[string](dbosCtx, "ISSUE_APPROVAL", 48*time.Hour)
```

The workflow pauses for hours or days. If the application restarts, it resumes waiting.

**Sending approval from TUI:**
```go
err := dbos.Send(m.dbosCtx, workflowID, status, "ISSUE_APPROVAL")
```

### Workflow Forking for AI Applications

Fork workflows at specific steps to retry with updated context—powerful for AI apps when LLM results are unsatisfactory:

```go
// Each LLM call is wrapped in a DBOS step
issueBody, err = dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
    openAIClient := NewOpenAIClient()
    return openAIClient.GenerateIssueContent(report.RepoName, report.RawReport)
}, dbos.WithStepName("generateIssueContent"))

// Fork from a specific step to retry
input := dbos.ForkWorkflowInput{
    OriginalWorkflowID: workflowID,
    StartStep:          stepNumber, // Step before the LLM call
}
handle, err := dbos.ForkWorkflow[any](ctx, input)
```

**Benefits:**
- **No lost work**: Previous steps are preserved
- **Fast iteration**: Only re-run the expensive LLM call
- **Experiment safely**: Try different prompts without affecting the original workflow

## Setup

1. **Start a postgres container:**
   ```bash
   docker-compose up -d
   ```

2. **Set environment variables:**
   ```bash
   export DBOS_SYSTEM_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sec_agent?sslmode=disable"
   export OPENAI_API_KEY="your-api-key-here"
   ```

3. **Build and run:**
   ```bash
   go build -o sec-agent ./cmd/sec-agent
   ./sec-agent
   ```

## Learn More

- [DBOS Transact Documentation](https://docs.dbos.dev/golang/programming-guide)
- [DBOS Transact GitHub](https://github.com/dbos-inc/dbos-transact-golang)