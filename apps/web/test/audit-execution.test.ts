import assert from "node:assert/strict";
import { AssessmentStatus, JobStatus, RoutingSnapshotStatus } from "@evolve-edge/db";

async function runAuditExecutionTests() {
  const { runAuditExecution } = await import("../lib/ai-execution");
  const { getAiExecutionProvider } = await import("../lib/runtime-config");
  const routingUpdates: Array<Record<string, unknown>> = [];
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const createdJobs: Array<Record<string, unknown>> = [];
  let providerCalled = false;

  const completeIntake = {
    companyName: "Acme",
    industry: "Healthcare",
    companySize: "51-200",
    usesAiTools: true,
    toolsPlatforms: ["ChatGPT"],
    topConcerns: ["AI governance"],
    dataSensitivity: "confidential",
    optionalNotes: "Uses AI for operations summaries."
  };

  const workflowResult = {
    provider: "openai_langgraph",
    workflowDispatchId: "wd_123",
    status: "completed",
    businessContext: {
      companyName: "Acme",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Summary",
      operatingModel: "B2B",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Policies missing"],
    },
    frameworkMapping: {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "Coverage",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Rationale",
          applicableAreas: ["Access control"],
        },
      ],
    },
    riskAnalysis: {
      summary: "Summary",
      findings: [
        {
          title: "AI governance gap",
          severity: "High",
          summary: "Gap",
          businessImpact: "Impact",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["Intake"],
          tags: ["ai"],
        },
      ],
      systemicThemes: ["AI governance"],
      notableStrengths: [],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: true,
        vendorRiskPresent: false,
        sensitiveDataExposure: false,
      },
    },
    riskScoring: {
      complianceScore: 72,
      riskLevel: "Moderate",
      highCount: 1,
      moderateCount: 0,
      lowCount: 0,
      keyDrivers: ["AI governance gap"],
    },
    remediationRoadmap: {
      roadmapSummary: "Roadmap",
      immediateActions: [
        {
          title: "Define AI policy",
          description: "Create an AI use policy.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days",
        },
      ],
      nearTermActions: [],
      strategicActions: [],
    },
    finalReport: {
      reportTitle: "Report",
      reportSubtitle: null,
      executiveSummary: "Executive summary",
      detailedReport: "Detailed report",
      conclusion: "Conclusion",
    },
    metadata: {
      model: "gpt-4o-2024-08-06",
      reasoningModel: null,
      timeoutMs: 20000,
      executionMs: 123,
      nodeTimingsMs: {},
      contractVersion: "langgraph-audit.v1",
    },
    executiveSummary: "Executive summary",
    postureScore: 72,
    riskLevel: "Moderate",
    topConcerns: ["AI governance gap"],
    findings: [
      {
        title: "AI governance gap",
        summary: "Gap",
        severity: "HIGH",
        riskDomain: "governance",
        impactedFrameworks: ["SOC 2"],
        score: 35,
      },
    ],
    recommendations: [
      {
        title: "Define AI policy",
        description: "Create an AI use policy.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days",
      },
    ],
    roadmap: [
      {
        title: "Define AI policy",
        description: "Create an AI use policy.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days",
      },
    ],
    finalReportText: "Detailed report",
  };

  const db = {
    routingSnapshot: {
      async findUnique(input: Record<string, unknown>) {
        if (JSON.stringify(input).includes("missing_snapshot")) {
          return null;
        }

        return {
          id: "rs_123",
          organizationId: "org_123",
          workflowCode: "AUDIT_SCALE",
          status: RoutingSnapshotStatus.DISPATCHED,
          normalizedHintsJson: {
            workflow_code: "audit_scale",
            entitlement_source: "subscription",
            capability_profile: {
              report_depth: "enhanced",
              max_findings: 10,
              roadmap_detail: "detailed",
              executive_briefing_eligible: true,
              monitoring_add_on_eligible: true,
              add_on_eligible: true
            }
          },
          workflowDispatches: [{ id: "wd_123" }],
          organization: {
            id: "org_123",
            name: "Acme",
            industry: "Healthcare",
            sizeBand: "51-200",
            frameworkSelections: []
          }
        };
      },
      async update(input: Record<string, unknown>) {
        routingUpdates.push(input);
        return input;
      }
    },
    organization: {
      async findUnique() {
        return {
          id: "org_123",
          onboardingCompletedAt: new Date(),
          regulatoryProfile: {
            auditIntake: {
              intakeCompleted: true,
              readyForAudit: true,
              status: "ready_for_audit",
              intakeCompletedAt: new Date().toISOString(),
              readyForAuditAt: new Date().toISOString()
            }
          }
        };
      }
    },
    assessment: {
      async findFirst() {
        return {
          id: "asm_123",
          organizationId: "org_123",
          name: "Audit readiness",
          status: AssessmentStatus.INTAKE_SUBMITTED,
          submittedAt: new Date()
        };
      }
    },
    analysisJob: {
      async findFirst() {
        return null;
      },
      async create(input: Record<string, unknown>) {
        createdJobs.push(input);
        return {
          id: "job_123",
          assessmentId: "asm_123",
          provider: "openai_langgraph",
          status: JobStatus.QUEUED,
          workflowVersion: "langgraph-audit.v1",
          attemptCount: 0,
          inputPayload: input.data
            ? (input.data as Record<string, unknown>).inputPayload
            : {},
          assessment: {
            organizationId: "org_123",
            name: "Audit readiness"
          }
        };
      }
    },
    deliveryStateRecord: {
      async updateMany(input: Record<string, unknown>) {
        deliveryUpdates.push(input);
        return { count: 1 };
      }
    }
  };

  await assert.rejects(
    () =>
      runAuditExecution(
        {
          snapshot_id: "",
          workflow_code: "audit_scale",
          organization_id: "org_123",
          intake_data: completeIntake
        },
        { db: db as never }
      ),
    /snapshot_id/
  );

  await assert.rejects(
    () =>
      runAuditExecution(
        {
          snapshot_id: "rs_123",
          workflow_code: "audit_scale",
          organization_id: "org_123",
          intake_data: { companyName: "Acme" }
        },
        { db: db as never }
      ),
    /Completed intake_data/
  );

  await assert.rejects(
    () =>
      runAuditExecution(
        {
          snapshot_id: "missing_snapshot",
          workflow_code: "audit_scale",
          organization_id: "org_123",
          intake_data: completeIntake
        },
        { db: db as never }
      ),
    /Routing snapshot not found/
  );

  const result = await runAuditExecution(
    {
      snapshot_id: "rs_123",
      workflow_code: "audit_scale",
      organization_id: "org_123",
      intake_data: completeIntake
    },
    {
      db: db as never,
      enforcePlanAccessFn: (async () => ({
        entitlements: {},
        strictPlan: { plan: "scale" }
      })) as never,
      runAnalysisJobFn: (async (_job: unknown, options: Record<string, any> | undefined) => {
        providerCalled = true;
        assert.equal(options?.payload?.routingSnapshotId, "rs_123");
        assert.equal(options?.payload?.workflowDispatchId, "wd_123");

        return {
          status: "completed",
          requestHash: "hash_123",
          result: workflowResult
        };
      }) as never
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(providerCalled, true);
  assert.equal(createdJobs.length, 1);
  assert.equal(routingUpdates.some((update) => JSON.stringify(update).includes("REPORT_READY")), true);
  assert.equal(
    deliveryUpdates.some((update) => JSON.stringify(update).includes("analysis_complete")),
    true
  );

  delete process.env.AI_EXECUTION_PROVIDER;
  assert.equal(getAiExecutionProvider(), "openai_langgraph");

  console.log("audit-execution tests passed");
}

void runAuditExecutionTests();
