package app

import (
	"database/sql"
	"fmt"
)

// CreateReport inserts a new report into the database, or replaces an existing one if repo_name conflicts
func CreateReport(repoName string, hasVuln bool, rawReport string) (*Report, error) {
	query := `
		INSERT INTO reports (repo_name, has_vuln, raw_report)
		VALUES ($1, $2, $3)
		ON CONFLICT (repo_name) 
		DO UPDATE SET 
			has_vuln = EXCLUDED.has_vuln,
			raw_report = EXCLUDED.raw_report,
			created_at = CURRENT_TIMESTAMP
		RETURNING id, repo_name, has_vuln, raw_report, created_at`

	var report Report
	err := GetDB().QueryRow(query, repoName, hasVuln, rawReport).Scan(
		&report.ID,
		&report.RepoName,
		&report.HasVuln,
		&report.RawReport,
		&report.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create report: %w", err)
	}

	return &report, nil
}

// GetReportByID retrieves a report by its ID
func GetReportByID(id int) (*Report, error) {
	query := `
		SELECT id, repo_name, has_vuln, raw_report, created_at
		FROM reports
		WHERE id = $1`

	var report Report
	err := GetDB().QueryRow(query, id).Scan(
		&report.ID,
		&report.RepoName,
		&report.HasVuln,
		&report.RawReport,
		&report.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("report not found")
		}
		return nil, fmt.Errorf("failed to get report: %w", err)
	}

	return &report, nil
}

// GetAllReports retrieves all reports from the database
func GetAllReports() ([]*Report, error) {
	query := `
		SELECT id, repo_name, has_vuln, raw_report, created_at
		FROM reports
		ORDER BY created_at DESC`

	rows, err := GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query reports: %w", err)
	}
	defer rows.Close()

	var reports []*Report
	for rows.Next() {
		var report Report
		if err := rows.Scan(
			&report.ID,
			&report.RepoName,
			&report.HasVuln,
			&report.RawReport,
			&report.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan report: %w", err)
		}
		reports = append(reports, &report)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating reports: %w", err)
	}

	return reports, nil
}

// GetReportsPendingForApproval retrieves reports that have vulnerabilities
// and don't have an approved issue yet
func GetReportsPendingForApproval() ([]*Report, error) {
	query := `
		SELECT r.id, r.repo_name, r.has_vuln, r.raw_report, r.created_at
		FROM reports r
		WHERE r.has_vuln = true
		AND NOT EXISTS (
			SELECT 1 FROM issues i
			WHERE i.repo_name = r.repo_name
			AND (i.status = 'approved' OR i.status = 'rejected')
		)
		ORDER BY r.created_at DESC`

	rows, err := GetDB().Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query reports pending for approval: %w", err)
	}
	defer rows.Close()

	var reports []*Report
	for rows.Next() {
		var report Report
		if err := rows.Scan(
			&report.ID,
			&report.RepoName,
			&report.HasVuln,
			&report.RawReport,
			&report.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan report: %w", err)
		}
		reports = append(reports, &report)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating reports: %w", err)
	}

	return reports, nil
}
