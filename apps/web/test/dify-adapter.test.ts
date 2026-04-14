import assert from "node:assert/strict";
import {
  normalizeDifyWorkflowOutputs,
  normalizeDifyContractShape
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
