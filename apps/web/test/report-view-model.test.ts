import assert from "node:assert/strict";
import { AssessmentStatus, ReportStatus } from "@evolve-edge/db";
import {
  buildExecutiveReportHtml,
  buildExecutiveReportViewModel,
  getLatestAssessmentWorkflowSnapshot
} from "../lib/report-view-model";

function createReportRecord(overrides?: Partial<Parameters<typeof buildExecutiveReportViewModel>[0]["report"]>) {
  return {
    id: "report_123",
    title: "Acme Health Executive Audit Report",
    versionLabel: "v1",
    createdAt: new Date("2026-04-24T12:00:00.000Z"),
    publishedAt: new Date("2026-04-24T13:00:00.000Z"),
    status: ReportStatus.READY,
    executiveSummary: "Legacy executive summary.",
    reportJson: {
      executiveSummary: "Legacy executive summary.",
      gaps: ["Legacy governance gap"],
      topConcerns: ["Legacy concern"]
    },
    assessment: {
      id: "asm_123",
      name: "Acme Health Assessment",
      status: AssessmentStatus.REPORT_DRAFT_READY
    },
    ...overrides
  };
}

function createCompletedSnapshot() {
  return {
    state: "completed" as const,
    safeError: null,
    progress: null,
    result: {
      provider: "openai_langgraph" as const,
      workflowDispatchId: "wd_123",
      status: "completed" as const,
      businessContext: {
        companyName: "Acme Health",
        industry: "Healthtech",
        companySize: "51-200",
        summary: "Acme Health operates in a regulated environment.",
        operatingModel: "B2B SaaS",
        businessPriorities: ["Customer trust", "Audit readiness"],
        securityMaturitySignals: ["Leadership support"]
      },
      frameworkMapping: {
        selectedFrameworks: ["SOC 2", "HIPAA"],
        prioritizedFrameworks: ["SOC 2", "HIPAA"],
        coverageSummary: "SOC 2 and HIPAA are the primary reference points.",
        mappings: [
          {
            framework: "SOC 2",
            rationale: "Customer assurance baseline.",
            applicableAreas: ["Access control"]
          }
        ]
      },
      riskAnalysis: {
        summary: "Governance and vendor oversight need executive attention.",
        findings: [
          {
            title: "Security policy governance gap",
            severity: "High" as const,
            summary: "Formal policies are incomplete and inconsistently enforced.",
            businessImpact: "Customer diligence and audit readiness are weakened.",
            controlDomain: "Governance",
            impactedFrameworks: ["SOC 2"],
            evidence: ["Policy library is incomplete."],
            tags: ["policy"]
          }
        ],
        systemicThemes: ["Governance operating model needs formal ownership."],
        notableStrengths: ["Leadership engagement is present."],
        riskFlags: {
          noFormalSecurityPolicies: true,
          noAiGovernance: true,
          vendorRiskPresent: true,
          sensitiveDataExposure: false
        }
      },
      riskScoring: {
        complianceScore: 62,
        riskLevel: "Moderate" as const,
        highCount: 1,
        moderateCount: 0,
        lowCount: 0,
        keyDrivers: ["Incomplete security policies", "Missing AI governance"]
      },
      remediationRoadmap: {
        roadmapSummary: "Start with policy and governance controls.",
        immediateActions: [
          {
            title: "Approve baseline security policies",
            description: "Publish and assign ownership for core policy artifacts.",
            priority: "HIGH" as const,
            ownerRole: "Security Lead",
            targetTimeline: "30 days"
          }
        ],
        nearTermActions: [
          {
            title: "Stand up AI governance review",
            description: "Create review criteria for AI-enabled workflows.",
            priority: "HIGH" as const,
            ownerRole: "CTO",
            targetTimeline: "60 days"
          }
        ],
        strategicActions: [
          {
            title: "Formalize vendor oversight cadence",
            description: "Adopt a recurring third-party review process.",
            priority: "MEDIUM" as const,
            ownerRole: "Operations",
            targetTimeline: "90 days"
          }
        ]
      },
      finalReport: {
        reportTitle: "Acme Health Executive Audit Report",
        reportSubtitle: "Validated AI security and compliance assessment",
        executiveSummary:
          "Acme Health should treat governance formalization as the fastest path to lowering audit friction and strengthening customer trust.",
        detailedReport: "Detailed report body.",
        conclusion:
          "Close the governance gap first, then sequence AI oversight and vendor review into the next operating cycle."
      },
      metadata: {
        model: "gpt-4.1",
        reasoningModel: null,
        timeoutMs: 20000,
        executionMs: 2500,
        nodeTimingsMs: {},
        contractVersion: "langgraph-audit.v1"
      },
      executiveSummary:
        "Acme Health should treat governance formalization as the fastest path to lowering audit friction and strengthening customer trust.",
      postureScore: 62,
      riskLevel: "Moderate",
      topConcerns: ["Policy governance", "AI governance", "Vendor oversight"],
      findings: [
        {
          title: "Security policy governance gap",
          summary: "Formal policies are incomplete and inconsistently enforced.",
          severity: "HIGH" as const,
          riskDomain: "Governance",
          impactedFrameworks: ["SOC 2"],
          score: 38
        }
      ],
      recommendations: [
        {
          title: "Approve baseline security policies",
          description: "Publish and assign ownership for core policy artifacts.",
          priority: "HIGH" as const,
          ownerRole: "Security Lead",
          effort: "Medium",
          targetTimeline: "30 days"
        }
      ],
      roadmap: [
        {
          title: "Approve baseline security policies",
          description: "Publish and assign ownership for core policy artifacts.",
          priority: "HIGH" as const,
          ownerRole: "Security Lead",
          effort: "Medium",
          targetTimeline: "30 days"
        }
      ],
      finalReportText: "Detailed report body."
    }
  };
}

async function runReportViewModelTests() {
  const completedModel = buildExecutiveReportViewModel({
    report: createReportRecord(),
    overallRiskPosture: {
      score: 62,
      level: "Moderate",
      summary: "Moderate posture."
    },
    workflowSnapshot: createCompletedSnapshot()
  });

  const html = buildExecutiveReportHtml(completedModel);
  assert.equal(completedModel.state, "ready");
  assert.match(
    completedModel.trustSignals.howGenerated,
    /submitted assessment and reviewed evidence/i
  );
  assert.match(
    completedModel.trustSignals.dataUsed,
    /selected frameworks, evidence summaries, and validated workflow analysis/i
  );
  assert.match(completedModel.trustSignals.confidenceLevel, /high confidence/i);
  assert.match(
    completedModel.disclaimers.advisoryOnly,
    /advisory guidance designed to support planning and decision-making/i
  );
  assert.match(
    completedModel.disclaimers.noGuarantee,
    /does not guarantee compliance, certification, or a specific regulatory outcome/i
  );
  assert.match(html, /Executive Summary/);
  assert.match(html, /How This Report Was Generated/);
  assert.match(html, /What Data Was Used/);
  assert.match(html, /Confidence level:/);
  assert.match(html, /Last updated:/);
  assert.match(html, /advisory guidance designed to support planning and decision-making/i);
  assert.match(
    html,
    /does not guarantee compliance, certification, or a specific regulatory outcome/i
  );
  assert.match(html, /Overall Risk Posture/);
  assert.match(html, /Compliance Score/);
  assert.match(html, /Top Findings/);
  assert.match(html, /30\/60\/90 Day Roadmap/);
  assert.match(html, /Executive Briefing Talking Points/);
  assert.match(html, /Closing Advisory Note/);
  assert.equal(completedModel.workflowProgress?.status, "completed");

  const unavailableModel = buildExecutiveReportViewModel({
    report: createReportRecord({
      executiveSummary: null,
      reportJson: {},
      assessment: {
        id: "asm_123",
        name: "Acme Health Assessment",
        status: AssessmentStatus.ANALYSIS_QUEUED
      }
    }),
    overallRiskPosture: {
      score: null,
      level: null,
      summary: null
    },
    workflowSnapshot: {
      state: "unavailable",
      result: null,
      safeError: null,
      progress: {
        status: "queued",
        workflowDispatchId: "wd_queued",
        dispatchId: "disp_queued",
        label: "Queued",
        description: "Queued for processing.",
        progressPercent: 5,
        updatedAt: "2026-04-24T12:01:00.000Z"
      }
    }
  });

  const unavailableHtml = buildExecutiveReportHtml(unavailableModel);
  assert.equal(unavailableModel.state, "queued");
  assert.equal(unavailableModel.workflowProgress?.status, "queued");
  assert.match(unavailableHtml, /Report queued for generation/);
  assert.match(unavailableHtml, /No validated findings are available yet/);

  let findFirstCall = 0;
  const failedSnapshot = await getLatestAssessmentWorkflowSnapshot("asm_123", {
    customerRun: {
      async findFirst() {
        return {
          contextJson: {
            workflowProgress: {
              status: "analyzing_risks",
              label: "Analyzing Risks",
              description: "Risk review in progress.",
              progressPercent: 52,
              updatedAt: "2026-04-24T12:05:00.000Z"
            }
          }
        };
      }
    },
    analysisJob: {
      async findFirst() {
        findFirstCall += 1;
        if (findFirstCall === 1) {
          return null;
        }

        return {
          outputPayload: {
            failure: {
              reason: "node_execution_failed",
              node: "risk_analysis"
            }
          },
          errorMessage: "OpenAI failure sk-test-123 buyer@example.com"
        };
      }
    }
  } as never);

  assert.equal(failedSnapshot.state, "failed");
  assert.equal(failedSnapshot.progress?.status, "analyzing_risks");
  assert.doesNotMatch(failedSnapshot.safeError ?? "", /sk-test-123|buyer@example\.com/i);

  const failedModel = buildExecutiveReportViewModel({
    report: createReportRecord({
      executiveSummary: null,
      reportJson: {},
      assessment: {
        id: "asm_123",
        name: "Acme Health Assessment",
        status: AssessmentStatus.ANALYSIS_QUEUED
      }
    }),
    overallRiskPosture: {
      score: null,
      level: null,
      summary: null
    },
    workflowSnapshot: failedSnapshot
  });

  const failedHtml = buildExecutiveReportHtml(failedModel);
  assert.equal(failedModel.state, "failed");
  assert.equal(failedModel.workflowProgress?.status, "analyzing_risks");
  assert.match(failedHtml, /Report generation needs review/);
  assert.doesNotMatch(failedHtml, /sk-test-123|buyer@example\.com/i);

  const contentfulFailedModel = buildExecutiveReportViewModel({
    report: createReportRecord({
      status: ReportStatus.PENDING_REVIEW,
      assessment: {
        id: "asm_123",
        name: "Acme Health Assessment",
        status: AssessmentStatus.ANALYSIS_QUEUED
      }
    }),
    overallRiskPosture: {
      score: 62,
      level: "Moderate",
      summary: "Moderate posture."
    },
    workflowSnapshot: failedSnapshot
  });

  const contentfulFailedHtml = buildExecutiveReportHtml(contentfulFailedModel);
  assert.equal(contentfulFailedModel.state, "ready");
  assert.equal(contentfulFailedModel.workflowProgress?.status, "pending_review");
  assert.equal(contentfulFailedModel.emptyState, null);
  assert.doesNotMatch(contentfulFailedHtml, /Last safe error/i);

  const pendingWithoutContentModel = buildExecutiveReportViewModel({
    report: createReportRecord({
      status: ReportStatus.PENDING,
      executiveSummary: null,
      reportJson: {},
      publishedAt: null,
      assessment: {
        id: "asm_123",
        name: "Acme Health Assessment",
        status: AssessmentStatus.ANALYSIS_RUNNING
      }
    }),
    overallRiskPosture: {
      score: null,
      level: null,
      summary: null
    },
    workflowSnapshot: {
      state: "running",
      result: null,
      safeError: null,
      progress: null
    }
  });

  assert.equal(pendingWithoutContentModel.state, "running");
  assert.match(
    pendingWithoutContentModel.emptyState?.title ?? "",
    /being prepared/i
  );

  console.log("report-view-model tests passed");
}

void runReportViewModelTests();
