import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AssessmentStatus, JobStatus } from "@evolve-edge/db";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  exports: {}
} as NodeJS.Module;

async function runAiExecutionWorkerTests() {
  const { isAnalysisJobReadyForRetry, runOpenAiAnalysisJob } = await import("../lib/ai-execution");
  const assessmentUpdates: Array<Record<string, unknown>> = [];
  const analysisUpdates: Array<Record<string, unknown>> = [];

  const db = {
    analysisJob: {
      async updateMany() {
        return { count: 1 };
      },
      async update(input: Record<string, unknown>) {
        analysisUpdates.push(input);
        return {
          id: "job_123",
          assessmentId: "asm_123",
          provider: "openai_langgraph",
          workflowVersion: "langgraph-audit.v1",
          attemptCount: 1,
          assessment: {
            organizationId: "org_123",
            name: "Assessment 123",
          },
        };
      },
    },
    assessment: {
      async update(input: Record<string, unknown>) {
        assessmentUpdates.push(input);
        return input;
      },
    },
    async $transaction<T>(callback: (tx: any) => Promise<T>) {
      return callback({
        analysisJob: {
          update: async (input: Record<string, unknown>) => {
            analysisUpdates.push(input);
            return input;
          },
        },
        report: {
          findFirst: async () => null,
          count: async () => 0,
          create: async (input: Record<string, unknown>) => ({
            id: "report_123",
            ...(input.data as Record<string, unknown>)
          }),
          findUnique: async () => ({
            reportJson: {}
          }),
          update: async (input: Record<string, unknown>) => ({
            id: "report_123",
            ...(input.data as Record<string, unknown>)
          })
        },
        reportPackage: {
          findUnique: async () => null,
          create: async (input: Record<string, unknown>) => ({
            id: "pkg_123",
            ...(input.data as Record<string, unknown>)
          }),
          update: async (input: Record<string, unknown>) => ({
            id: "pkg_123",
            ...(input.data as Record<string, unknown>)
          })
        },
        reportPackageVersion: {
          create: async (input: Record<string, unknown>) => ({
            id: "pkgv_123",
            ...(input.data as Record<string, unknown>)
          })
        },
        domainEvent: {
          create: async () => ({ id: "evt_123" })
        },
        assessment: {
          update: async (input: Record<string, unknown>) => {
            assessmentUpdates.push(input);
            return input;
          },
        },
      });
    },
  };

  const job = {
    id: "job_123",
    assessmentId: "asm_123",
    provider: "openai_langgraph",
    status: JobStatus.QUEUED,
    workflowVersion: "langgraph-audit.v1",
    attemptCount: 0,
    inputPayload: {},
    assessment: {
      organizationId: "org_123",
      name: "Assessment 123",
    },
  };

  const payload = {
    orgId: "org_123",
    assessmentId: "asm_123",
    workflowDispatchId: "wd_123",
    dispatchId: "disp_123",
    customerEmail: "buyer@example.com",
    companyName: "Acme",
    industry: "Healthcare",
    companySize: "51-200",
    selectedFrameworks: ["SOC 2"],
    assessmentAnswers: [
      {
        question: "Do you have formal policies?",
        answer: "No",
      },
    ],
    evidenceSummary: "No evidence supplied.",
    planTier: "scale" as const,
  };

  const completedResult = await runOpenAiAnalysisJob(job, {
    db: db as never,
    payload,
    provider: {
      provider: "openai_langgraph",
      async executeAuditWorkflow() {
        return {
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
                title: "Policy gap",
                severity: "High",
                summary: "Gap",
                businessImpact: "Impact",
                controlDomain: "governance",
                impactedFrameworks: ["SOC 2"],
                evidence: ["None"],
                tags: ["policy"],
              },
            ],
            systemicThemes: ["Governance"],
            notableStrengths: [],
            riskFlags: {
              noFormalSecurityPolicies: true,
              noAiGovernance: false,
              vendorRiskPresent: false,
              sensitiveDataExposure: false,
            },
          },
          riskScoring: {
            complianceScore: 75,
            riskLevel: "Moderate",
            highCount: 1,
            moderateCount: 0,
            lowCount: 0,
            keyDrivers: ["Policy gap"],
          },
          remediationRoadmap: {
            roadmapSummary: "Roadmap",
            immediateActions: [
              {
                title: "Create policies",
                description: "Create policies",
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
          postureScore: 75,
          riskLevel: "Moderate",
          topConcerns: ["Policy gap"],
          findings: [
            {
              title: "Policy gap",
              summary: "Gap",
              severity: "HIGH",
              riskDomain: "governance",
              impactedFrameworks: ["SOC 2"],
              score: 35,
            },
          ],
          recommendations: [
            {
              title: "Create policies",
              description: "Create policies",
              priority: "HIGH",
              ownerRole: "Security Lead",
              effort: "Medium",
              targetTimeline: "30 days",
            },
          ],
          roadmap: [
            {
              title: "Create policies",
              description: "Create policies",
              priority: "HIGH",
              ownerRole: "Security Lead",
              effort: "Medium",
              targetTimeline: "30 days",
            },
          ],
          finalReportText: "Detailed report",
        };
      },
    } as never,
    publishDomainEventsFn: (async () => []) as never,
    markCustomerRunAnalysisCompletedFn: async () => null,
    markCustomerRunAnalysisFailedFn: async () => null,
    markCustomerRunReportGeneratedFn: async () => null,
    ensurePendingAssessmentReportFn: (async () => ({
      id: "report_123",
      assessmentId: "asm_123"
    })) as never,
    persistValidatedWorkflowReportFn: (async () => ({
      id: "report_123",
      assessmentId: "asm_123",
      status: "GENERATED"
    })) as never,
    recordOperationalFindingFn: (async () => ({ id: "finding_1" })) as never,
    upsertExecutiveDeliveryPackageForReportFn: (async () => null) as never,
    logServerEventFn: () => undefined,
    sendOperationalAlertFn: async () => undefined,
  });

  assert.equal(completedResult.status, "completed");
  assert.equal(
    (assessmentUpdates[assessmentUpdates.length - 1]?.data as Record<string, unknown>).status,
    AssessmentStatus.REPORT_DRAFT_READY
  );
  assert.equal(analysisUpdates.length >= 1, true);

  const failedResult = await runOpenAiAnalysisJob(
    {
      ...job,
      id: "job_failed",
    },
    {
      db: db as never,
      payload: {
        ...payload,
        workflowDispatchId: "wd_failed",
      },
      provider: {
        provider: "openai_langgraph",
        async executeAuditWorkflow() {
          throw new Error("OpenAI exploded with secret sk-test-123");
        },
      } as never,
      publishDomainEventsFn: (async () => []) as never,
      markCustomerRunAnalysisCompletedFn: async () => null,
      markCustomerRunAnalysisFailedFn: async () => null,
      markCustomerRunReportGeneratedFn: async () => null,
      recordOperationalFindingFn: (async () => ({ id: "finding_2" })) as never,
      logServerEventFn: () => undefined,
      sendOperationalAlertFn: async () => undefined,
    }
  );

  assert.equal(failedResult.status, "failed");
  assert.doesNotMatch(failedResult.safeError, /sk-test-123/);

  assert.equal(
    isAnalysisJobReadyForRetry(
      {
        status: JobStatus.FAILED,
        attemptCount: 1,
        lastAttemptAt: new Date(Date.now() - 61_000),
      },
      new Date()
    ),
    true
  );
  assert.equal(
    isAnalysisJobReadyForRetry(
      {
        status: JobStatus.FAILED,
        attemptCount: 2,
        lastAttemptAt: new Date(),
      },
      new Date()
    ),
    false
  );

  console.log("ai-execution-worker tests passed");
}

void runAiExecutionWorkerTests();
