package app

import (
	"context"
	"embed"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

// Find more sample reports there https://github.com/aquasecurity/trivy/tree/main/integration/testdata

//go:embed reports/*
var reports embed.FS

// ScanWorkflow processes reports from the specified reports folder
func ScanWorkflow(ctx dbos.DBOSContext, _ string) ([]string, error) {
	// Step 1: Read all report files from reports folder
	reportFiles, err := dbos.RunAsStep(ctx, func(ctx context.Context) ([]string, error) {
		return ReadReportFiles()
	}, dbos.WithStepName("readReportFiles"))
	if err != nil {
		return nil, fmt.Errorf("failed to read report files: %w", err)
	}

	// Step 2: Process each report with OpenAI
	openAIClient := NewOpenAIClient()
	scannedRepos := []string{}
	vulnerableCount := 0

	for _, reportPath := range reportFiles {
		repoName := strings.TrimSuffix(filepath.Base(reportPath), filepath.Ext(reportPath))

		// Step 2a: Read the report file
		rawReport, err := dbos.RunAsStep(ctx, func(ctx context.Context) (string, error) {
			return readReportFile(reportPath)
		}, dbos.WithStepName(fmt.Sprintf("readReport-%s", repoName)))
		if err != nil {
			continue
		}

		// Step 2b: Use OpenAI to detect vulnerabilities
		hasVuln, err := dbos.RunAsStep(ctx, func(ctx context.Context) (bool, error) {
			return openAIClient.DetectVulnerability(rawReport)
		}, dbos.WithStepName(fmt.Sprintf("detectVuln-%s", repoName)))
		if err != nil {
			hasVuln = false
		}

		if hasVuln {
			vulnerableCount++
		}

		// Step 2c: Store report in database
		_, err = dbos.RunAsStep(ctx, func(ctx context.Context) (*Report, error) {
			return CreateReport(repoName, hasVuln, rawReport)
		}, dbos.WithStepName(fmt.Sprintf("storeReport-%s", repoName)))
		if err != nil {
			continue
		}

		scannedRepos = append(scannedRepos, fmt.Sprintf("Processed %s: vulnerabilities=%v\n\n", repoName, hasVuln))
	}

	scannedRepos = append(scannedRepos, fmt.Sprintf("Scan completed: %d total reports, %d vulnerable reports found", len(scannedRepos), vulnerableCount))
	return scannedRepos, nil
}

// ReadReportFiles reads all report files from the reports folder
func ReadReportFiles() ([]string, error) {
	var reportFiles []string

	entries, err := reports.ReadDir("reports")
	if err != nil {
		return nil, fmt.Errorf("failed to read reports directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			reportFiles = append(reportFiles, filepath.Join("reports", entry.Name()))
		}
	}

	return reportFiles, nil
}

func readReportFile(path string) (string, error) {
	content, err := reports.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to read report file: %w", err)
	}
	return string(content), nil
}
