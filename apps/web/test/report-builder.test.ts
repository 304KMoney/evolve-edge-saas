import assert from "node:assert/strict";
import { buildAuditReport } from "../lib/report-builder";
import { getCanonicalReportFinalizationState } from "../lib/report-artifacts";

function runReportBuilderTests() {
  const normalizedOutput = {
    executive_summary: "Acme has moderate AI governance risk and should prioritize policy ownership.",
    risk_level: "Moderate",
    compliance_score: 74,
    top_risks: [
      {
        title: "AI policy gap",
        summary: "AI usage is active but governance ownership is informal.",
        severity: "HIGH",
        frameworks: ["SOC 2"]
      }
    ],
    governance_gaps: ["AI governance policy is not formally approved."],
    priority_actions: [
      {
        title: "Approve AI acceptable use policy",
        summary: "Define allowed tools, data restrictions, and review cadence.",
        priority: "HIGH",
        owner: "Security Lead",
        timeline: "30 days"
      }
    ],
    roadmap_30_60_90: {
      days_30: [
        {
          title: "Approve AI acceptable use policy",
          summary: "Define allowed tools and data restrictions.",
          priority: "HIGH",
          owner: "Security Lead",
          timeline: "30 days"
        }
      ],
      days_60: [],
      days_90: []
    },
    assumptions: ["Based on completed intake."],
    limitations: ["Advisory only."]
  };

  const report = buildAuditReport(normalizedOutput, {
    snapshotId: "rs_123",
    workflowCode: "audit_scale",
    organizationId: "org_123",
    organizationName: "Acme",
    assessmentId: "asm_123",
    assessmentName: "AI Audit",
    generatedAt: new Date("2026-04-29T12:00:00.000Z"),
    selectedPlan: "scale"
  });

  assert.equal(report.status, "ready");
  assert.equal(report.riskLevel, "Moderate");
  assert.equal(report.complianceScore, 74);
  assert.equal(report.topRisks.length, 1);
  assert.equal((report.reportJson as Record<string, unknown>).snapshotId, "rs_123");
  assert.equal((report.reportJson as Record<string, unknown>).schemaVersion, "evolve-edge.audit-report.v1");
  assert.equal(
    ((report.artifactMetadataJson as Record<string, unknown>).pdfStatus),
    "deferred"
  );
  assert.deepEqual((report.reportJson as Record<string, unknown>).sections, [
    "Executive Summary",
    "Overall Risk Posture",
    "Top Risks",
    "Governance & Compliance Gaps",
    "Priority Actions",
    "30-90 Day Roadmap",
    "Advisory Note"
  ]);

  const finalization = getCanonicalReportFinalizationState({
    reportId: "report_123",
    status: "GENERATED" as never,
    artifactMetadata: report.artifactMetadataJson as Record<string, unknown>,
    executiveSummary: report.executiveSummary,
    overallRiskPosture: {
      score: report.complianceScore,
      level: report.riskLevel,
      summary: "Moderate posture."
    },
    reportJson: report.reportJson as never
  });

  assert.equal(finalization.state, "exportable");
  assert.equal(finalization.canDownload, true);

  assert.throws(
    () =>
      buildAuditReport(
        {
          ...normalizedOutput,
          executive_summary:
            "Do not expose sk-prod-abcdefghijkl in customer reports."
        },
        {
          snapshotId: "rs_123",
          workflowCode: "audit_scale",
          organizationId: "org_123",
          organizationName: "Acme",
          assessmentId: "asm_123",
          assessmentName: "AI Audit",
          generatedAt: new Date("2026-04-29T12:00:00.000Z")
        }
      ),
    /secret-like content/
  );

  assert.throws(
    () =>
      buildAuditReport(
        {
          ...normalizedOutput,
          executive_summary: ""
        },
        {
          snapshotId: "rs_123",
          workflowCode: "audit_scale",
          organizationId: "org_123",
          organizationName: "Acme",
          assessmentId: "asm_123",
          assessmentName: "AI Audit",
          generatedAt: new Date("2026-04-29T12:00:00.000Z")
        }
      ),
    /String must contain at least 1 character/
  );

  console.log("report-builder tests passed");
}

runReportBuilderTests();
