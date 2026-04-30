import assert from "node:assert/strict";
import { AssessmentStatus, ReportStatus } from "@evolve-edge/db";
import { buildReportExportPayload } from "../lib/report-export";

function createReport(overrides?: Record<string, unknown>) {
  return {
    id: "rpt_123",
    organizationId: "org_123",
    title: "Acme Health Executive Audit Report",
    versionLabel: "v1",
    createdAt: new Date("2026-04-24T12:00:00.000Z"),
    publishedAt: new Date("2026-04-24T13:00:00.000Z"),
    status: ReportStatus.PENDING_REVIEW,
    executiveSummary: "Durable executive summary.",
    overallRiskPostureJson: {
      score: 61,
      level: "Moderate",
      summary: "Moderate posture."
    },
    artifactMetadataJson: {
      downloadStatus: "not_ready"
    },
    reportJson: {
      executiveSummary: "Durable executive summary.",
      findings: [{ title: "Access review gap", severity: "HIGH", summary: "Summary" }],
      roadmap: [{ title: "Close access review gap", priority: "HIGH", description: "Fix it" }]
    },
    assessment: {
      id: "asm_123",
      name: "Acme Health Assessment",
      status: AssessmentStatus.REPORT_DRAFT_READY
    },
    ...overrides
  } as any;
}

function createFailedSnapshot() {
  return {
    state: "failed" as const,
    result: null,
    safeError: "node_execution_failed",
    progress: null
  };
}

function runReportExportTests() {
  const success = buildReportExportPayload({
    report: createReport(),
    workflowSnapshot: createFailedSnapshot()
  });

  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.status, 200);
    assert.match(success.html, /Executive Summary/);
    assert.doesNotMatch(success.html, /Last safe error/i);
    assert.equal(success.reportViewModel.state, "ready");
  }

  const failed = buildReportExportPayload({
    report: createReport({
      status: ReportStatus.FAILED,
      executiveSummary: null,
      overallRiskPostureJson: null,
      reportJson: {},
      artifactMetadataJson: {
        downloadStatus: "failed"
      }
    }),
    workflowSnapshot: createFailedSnapshot()
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.status, 422);
    assert.match(failed.message, /retry generation/i);
  }

  console.log("report-export tests passed");
}

runReportExportTests();
