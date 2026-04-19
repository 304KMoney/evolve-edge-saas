import assert from "node:assert/strict";
import {
  normalizeDifyWorkflowOutputs,
  normalizeDifyContractShape,
  normalizeDifyReportSections
} from "../lib/dify-adapter";

function runDifyAdapterTests() {
  {
    const normalized = normalizeDifyWorkflowOutputs({
      final_report: "Board-ready summary",
      executive_summary: "Executive summary",
      postureScore: 72,
      risk_level: "Moderate",
      top_concerns: ["Identity gaps", "Missing vendor review workflow"],
      findings: [
        {
          title: "Access review gaps",
          summary: "Joiner-mover-leaver process is inconsistent.",
          severity: "HIGH",
          riskDomain: "access-control",
          impactedFrameworks: ["SOC 2"],
          score: 64
        }
      ],
      roadmap: [
        {
          title: "Formalize access reviews",
          description: "Run quarterly access reviews and retain evidence.",
          priority: "HIGH",
          ownerRole: "IT",
          effort: "Medium",
          targetTimeline: "30 days"
        }
      ]
    });

    assert.equal(normalized.finalReport, "Board-ready summary");
    assert.equal(normalized.executiveSummary, "Executive summary");
    assert.equal(normalized.riskLevel, "Moderate");
    assert.equal(normalized.topConcerns[0], "Identity gaps");
    assert.equal(normalized.roadmap.length, 1);
    assert.equal(normalized.recommendations.length, 1);
  }

  {
    const normalized = normalizeDifyContractShape({
      executiveSummary: "Summary",
      postureScore: 80,
      riskLevel: "Low",
      findings: [
        {
          title: "Logging coverage",
          summary: "Telemetry exists but alert routing is incomplete.",
          severity: "MEDIUM",
          riskDomain: "observability",
          impactedFrameworks: ["ISO 27001"]
        }
      ],
      recommendations: [
        {
          title: "Complete alert routing",
          description: "Ensure payment and report failures page the operator.",
          priority: "MEDIUM"
        }
      ]
    });

    assert.equal(normalized.topConcerns.length, 1);
    assert.match(normalized.topConcerns[0], /Logging coverage/);
  }


  {
    const normalizedSections = normalizeDifyReportSections({
      executive_summary: "Exec summary",
      postureScore: 65,
      risk_level: "Elevated",
      findings: [
        {
          title: "Vendor due diligence gap",
          summary: "Critical vendor reviews are not consistently tracked.",
          severity: "HIGH",
          riskDomain: "third-party",
          impactedFrameworks: ["SOC 2"]
        }
      ],
      roadmap: [
        {
          title: "Launch vendor review runbook",
          description: "Document and enforce quarterly vendor reassessment.",
          priority: "HIGH"
        }
      ]
    });

    assert.equal(normalizedSections.executive_summary, "Exec summary");
    assert.equal(normalizedSections.risk_scoring.posture_score, 65);
    assert.equal(normalizedSections.risk_analysis.length, 1);
    assert.equal(normalizedSections.remediation_roadmap.length, 1);
  }

  assert.throws(
    () =>
      normalizeDifyWorkflowOutputs({
        executive_summary: "",
        postureScore: 72,
        risk_level: "Moderate",
        findings: [],
        roadmap: []
      }),
    /executiveSummary/
  );

  console.log("dify-adapter tests passed");
}

runDifyAdapterTests();
