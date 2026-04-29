import assert from "node:assert/strict";
import {
  briefingToMarkdown,
  generateExecutiveBriefing
} from "../lib/executive-briefing";
import type { ExecutiveReportViewModel } from "../lib/report-view-model";

function createReadyReport(
  overrides: Partial<ExecutiveReportViewModel> = {}
): ExecutiveReportViewModel {
  return {
    state: "ready",
    workflowProgress: null,
    title: "Acme Executive Audit Report",
    subtitle: null,
    assessmentName: "Acme AI Security Assessment",
    versionLabel: "v1",
    publishedAt: new Date("2026-04-29T12:00:00.000Z"),
    executiveSummary:
      "Acme should prioritize governance ownership and remediation cadence before expanding AI usage.",
    overallRiskPosture: {
      riskLevel: "Moderate",
      summary:
        "Acme has moderate risk due to informal AI governance and inconsistent policy ownership."
    },
    complianceScore: 72,
    topFindings: [
      {
        title: "AI governance ownership gap",
        severity: "High",
        summary: "AI usage is active but review ownership is informal.",
        businessImpact:
          "Customer diligence and internal accountability may weaken without defined ownership.",
        affectedArea: "Governance"
      },
      {
        title: "Vendor review cadence gap",
        severity: "Medium",
        summary: "Third-party AI tools are not reviewed on a recurring cadence.",
        businessImpact: null,
        affectedArea: "Vendor risk"
      }
    ],
    complianceAndGovernanceGaps: [
      "AI governance policy is not formally approved.",
      "Vendor review cadence is inconsistent."
    ],
    roadmap: {
      days30: [
        {
          title: "Assign AI governance owner",
          description: "Name an accountable owner for AI review and exception handling.",
          priority: "HIGH",
          ownerRole: "CTO",
          timeline: "30 days"
        }
      ],
      days60: [
        {
          title: "Publish AI use policy",
          description: "Define approved tools, restricted data, and review cadence.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          timeline: "60 days"
        }
      ],
      days90: [
        {
          title: "Operationalize vendor review",
          description: "Add AI vendors to recurring third-party review.",
          priority: "MEDIUM",
          ownerRole: "Operations",
          timeline: "90 days"
        }
      ]
    },
    executiveBriefingTalkingPoints: [
      "Overall posture is Moderate at 72/100.",
      "Leadership attention should start with AI governance ownership."
    ],
    closingAdvisoryNote:
      "Close governance ownership first, then make review cadence measurable.",
    topConcerns: ["AI governance", "Vendor oversight"],
    trustSignals: {
      howGenerated: "Generated from validated report data.",
      dataUsed: "Report sections and roadmap.",
      confidenceLevel: "High confidence",
      lastUpdatedLabel: "Apr 29, 2026"
    },
    disclaimers: {
      advisoryOnly: "This briefing is advisory guidance.",
      noGuarantee:
        "It does not guarantee compliance, certification, or a specific regulatory outcome."
    },
    emptyState: null,
    ...overrides
  };
}

function runExecutiveBriefingTests() {
  const briefing = generateExecutiveBriefing(createReadyReport());

  assert.equal(briefing.structuredSections.length, 8);
  assert.deepEqual(
    briefing.structuredSections.map((section) => section.title),
    [
      "Context Overview",
      "Current Risk Posture",
      "Top 3-5 Findings",
      "Business Impact",
      "Immediate Actions (0-30 days)",
      "Stabilization Plan (30-90 days)",
      "Strategic Recommendations",
      "Closing Advisory Note"
    ]
  );
  assert.match(briefing.summary, /governance ownership/i);
  assert.match(
    briefing.structuredSections.find((section) => section.key === "business_impact")
      ?.bullets.join(" ") ?? "",
    /Customer diligence and internal accountability/i
  );
  assert.doesNotMatch(JSON.stringify(briefing), /raw AI|placeholder report/i);

  const markdown = briefingToMarkdown({
    reportTitle: "Acme Executive Audit Report",
    assessmentName: "Acme AI Security Assessment",
    summary: briefing.summary,
    structuredSections: briefing.structuredSections
  });
  assert.match(markdown, /# Executive Briefing: Acme Executive Audit Report/);
  assert.match(markdown, /## Immediate Actions \(0-30 days\)/);

  assert.throws(
    () =>
      generateExecutiveBriefing(
        createReadyReport({
          state: "running"
        })
      ),
    /finalized report/
  );

  console.log("executive briefing tests passed");
}

runExecutiveBriefingTests();
