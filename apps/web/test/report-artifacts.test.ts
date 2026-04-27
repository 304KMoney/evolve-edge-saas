import assert from "node:assert/strict";
import { ReportStatus } from "@evolve-edge/db";
import {
  getCanonicalReportFinalizationState,
  getReportArtifactAvailability
} from "../lib/report-artifacts";

function runReportArtifactTests() {
  const exportable = getCanonicalReportFinalizationState({
    reportId: "rpt_ready",
    status: ReportStatus.PENDING_REVIEW,
    artifactMetadata: {
      downloadStatus: "not_ready"
    },
    executiveSummary: "Leadership should prioritize governance remediation.",
    overallRiskPosture: {
      score: 64,
      level: "Moderate",
      summary: "Moderate posture with governance gaps."
    },
    reportJson: {
      findings: [{ title: "Access review gap" }]
    },
    workflowState: "failed"
  });

  assert.equal(exportable.state, "exportable");
  assert.equal(exportable.canDownload, true);

  const failed = getCanonicalReportFinalizationState({
    reportId: "rpt_failed",
    status: ReportStatus.FAILED,
    artifactMetadata: {
      downloadStatus: "failed"
    },
    executiveSummary: null,
    overallRiskPosture: {
      score: null,
      level: null,
      summary: null
    },
    reportJson: {},
    workflowState: "failed"
  });

  assert.equal(failed.state, "failed");
  assert.equal(failed.isRetryable, true);

  const pending = getCanonicalReportFinalizationState({
    reportId: "rpt_pending",
    status: ReportStatus.PROCESSING,
    artifactMetadata: {
      downloadStatus: "not_ready"
    },
    executiveSummary: null,
    overallRiskPosture: {
      score: null,
      level: null,
      summary: null
    },
    reportJson: {},
    workflowState: "running"
  });

  assert.equal(pending.state, "pending");
  assert.equal(pending.canDownload, false);

  const availability = getReportArtifactAvailability({
    reportId: "rpt_ready",
    status: ReportStatus.PENDING_REVIEW,
    artifactMetadata: {
      downloadStatus: "not_ready"
    },
    executiveSummary: "Durable summary exists.",
    overallRiskPosture: {
      score: null,
      level: "Moderate",
      summary: null
    },
    reportJson: {}
  });

  assert.equal(availability.state, "ready");
  assert.equal(availability.canDownload, true);

  console.log("report-artifacts tests passed");
}

runReportArtifactTests();
