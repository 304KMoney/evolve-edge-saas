import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AssessmentStatus, JobStatus } from "@evolve-edge/db";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  exports: {}
} as NodeJS.Module;

function buildPayload(index: number) {
  return {
    orgId: `org_${index}`,
    assessmentId: `asm_${index}`,
    routingSnapshotId: `rs_${index}`,
    workflowDispatchId: `wd_${index}`,
    dispatchId: `disp_${index}`,
    customerEmail: `buyer${index}@example.com`,
    companyName: `Acme ${index}`,
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
}

function buildWorkflowResult(payload: ReturnType<typeof buildPayload>) {
  return {
    provider: "openai_langgraph",
    workflowDispatchId: payload.workflowDispatchId,
    status: "completed" as const,
    businessContext: {
      companyName: payload.companyName,
      industry: payload.industry,
      companySize: payload.companySize,
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
}

async function runAiLoadScalingTests() {
  const { buildAnalysisDispatchPlan, runOpenAiAnalysisJob } = await import("../lib/ai-execution");

  const dispatchPlan = buildAnalysisDispatchPlan(
    [
      {
        id: "job_1",
        assessmentId: "asm_1",
        provider: "openai_langgraph",
        workflowVersion: "langgraph-audit.v1",
        status: JobStatus.QUEUED,
        attemptCount: 0,
        lastAttemptAt: null,
        inputPayload: {},
        assessment: { organizationId: "org_a", name: "A" },
      },
      {
        id: "job_2",
        assessmentId: "asm_2",
        provider: "openai_langgraph",
        workflowVersion: "langgraph-audit.v1",
        status: JobStatus.QUEUED,
        attemptCount: 0,
        lastAttemptAt: null,
        inputPayload: {},
        assessment: { organizationId: "org_a", name: "B" },
      },
      {
        id: "job_3",
        assessmentId: "asm_3",
        provider: "openai_langgraph",
        workflowVersion: "langgraph-audit.v1",
        status: JobStatus.QUEUED,
        attemptCount: 0,
        lastAttemptAt: null,
        inputPayload: {},
        assessment: { organizationId: "org_b", name: "C" },
      },
    ],
    [],
    {
      globalLimit: 2,
      perOrgLimit: 1,
      now: new Date(),
    }
  );

  assert.equal(dispatchPlan.selected.length, 2);
  assert.deepEqual(
    dispatchPlan.selected.map((job) => job.id),
    ["job_1", "job_3"]
  );

  const jobState = new Map<string, any>([
    [
      "job_1",
      {
        id: "job_1",
        assessmentId: "asm_1",
        provider: "openai_langgraph",
        workflowVersion: "langgraph-audit.v1",
        status: JobStatus.QUEUED,
        attemptCount: 0,
        inputPayload: {},
        startedAt: null,
        completedAt: null,
        outputPayload: null,
        assessment: {
          organizationId: "org_1",
          name: "Assessment 1",
        },
      },
    ],
    [
      "job_2",
      {
        id: "job_2",
        assessmentId: "asm_2",
        provider: "openai_langgraph",
        workflowVersion: "langgraph-audit.v1",
        status: JobStatus.QUEUED,
        attemptCount: 0,
        inputPayload: {},
        startedAt: null,
        completedAt: null,
        outputPayload: null,
        assessment: {
          organizationId: "org_2",
          name: "Assessment 2",
        },
      },
    ],
  ]);

  const assessmentState = new Map<string, any>([
    ["asm_1", { id: "asm_1", status: AssessmentStatus.ANALYSIS_QUEUED }],
    ["asm_2", { id: "asm_2", status: AssessmentStatus.ANALYSIS_QUEUED }],
  ]);

  const db = {
    analysisJob: {
      async updateMany(input: Record<string, any>) {
        const existing = jobState.get(input.where.id);
        if (!existing) {
          return { count: 0 };
        }

        const allowed = input.where.status.in as JobStatus[];
        if (!allowed.includes(existing.status)) {
          return { count: 0 };
        }

        existing.status = JobStatus.RUNNING;
        existing.attemptCount += 1;
        existing.startedAt = input.data.startedAt;
        return { count: 1 };
      },
      async update(input: Record<string, any>) {
        const existing = jobState.get(input.where.id);
        if (!existing) {
          throw new Error("Missing job");
        }
        Object.assign(existing, input.data);
        return {
          ...existing,
          assessment: existing.assessment,
        };
      },
    },
    assessment: {
      async update(input: Record<string, any>) {
        const existing = assessmentState.get(input.where.id);
        if (!existing) {
          throw new Error("Missing assessment");
        }
        Object.assign(existing, input.data);
        return existing;
      },
    },
    async $transaction<T>(callback: (tx: any) => Promise<T>) {
      return callback({
        analysisJob: {
          update: async (input: Record<string, any>) => {
            const existing = jobState.get(input.where.id);
            if (!existing) {
              throw new Error("Missing job");
            }
            Object.assign(existing, input.data);
            return existing;
          },
        },
        report: {
          findFirst: async () => null,
          count: async () => 0,
          create: async (input: Record<string, any>) => ({
            id: `report_${input.data.assessmentId}`,
            ...(input.data as Record<string, unknown>),
          }),
          findUnique: async () => ({
            reportJson: {},
          }),
          update: async (input: Record<string, any>) => ({
            id: input.where.id,
            ...(input.data as Record<string, unknown>),
          }),
        },
        reportPackage: {
          findUnique: async () => null,
          create: async (input: Record<string, any>) => ({
            id: `pkg_${input.data.reportId ?? "1"}`,
            ...(input.data as Record<string, unknown>),
          }),
          update: async (input: Record<string, any>) => ({
            id: input.where.id,
            ...(input.data as Record<string, unknown>),
          }),
        },
        reportPackageVersion: {
          create: async (input: Record<string, any>) => ({
            id: `pkgv_${input.data.reportPackageId ?? "1"}`,
            ...(input.data as Record<string, unknown>),
          }),
        },
        deliveryStateRecord: {
          updateMany: async () => ({ count: 1 })
        },
        domainEvent: {
          create: async () => ({ id: "evt_123" }),
        },
        assessment: {
          update: async (input: Record<string, any>) => {
            const existing = assessmentState.get(input.where.id);
            if (!existing) {
              throw new Error("Missing assessment");
            }
            Object.assign(existing, input.data);
            return existing;
          },
        },
      });
    },
  };

  const jobOne = jobState.get("job_1")!;
  const jobTwo = jobState.get("job_2")!;
  const payloadOne = buildPayload(1);
  const payloadTwo = buildPayload(2);

  await Promise.all([
    runOpenAiAnalysisJob(jobOne as never, {
      db: db as never,
      payload: payloadOne,
      provider: {
        provider: "openai_langgraph",
        async executeAuditWorkflow() {
          return buildWorkflowResult(payloadOne);
        },
      } as never,
      publishDomainEventsFn: (async () => []) as never,
      markCustomerRunAnalysisCompletedFn: async () => null,
      markCustomerRunAnalysisFailedFn: async () => null,
      markCustomerRunReportGeneratedFn: async () => null,
      markCustomerRunWorkflowProgressFn: async () => null,
      upsertExecutiveDeliveryPackageForReportFn: async () => null,
      recordOperationalFindingFn: async () => null,
      logServerEventFn: () => undefined,
      sendOperationalAlertFn: async () => null,
      ensurePendingAssessmentReportFn: async () => ({ id: "report_1" }),
      persistValidatedWorkflowReportFn: async ({ reportId }: { reportId: string }) => ({ id: reportId }),
      auditReadinessOverride: true,
      enforcePlanAccessFn: async () => ({ entitlements: {}, strictPlan: { plan: "scale" } }),
    } as never),
    runOpenAiAnalysisJob(jobTwo as never, {
      db: db as never,
      payload: payloadTwo,
      provider: {
        provider: "openai_langgraph",
        async executeAuditWorkflow() {
          return buildWorkflowResult(payloadTwo);
        },
      } as never,
      publishDomainEventsFn: (async () => []) as never,
      markCustomerRunAnalysisCompletedFn: async () => null,
      markCustomerRunAnalysisFailedFn: async () => null,
      markCustomerRunReportGeneratedFn: async () => null,
      markCustomerRunWorkflowProgressFn: async () => null,
      upsertExecutiveDeliveryPackageForReportFn: async () => null,
      recordOperationalFindingFn: async () => null,
      logServerEventFn: () => undefined,
      sendOperationalAlertFn: async () => null,
      ensurePendingAssessmentReportFn: async () => ({ id: "report_2" }),
      persistValidatedWorkflowReportFn: async ({ reportId }: { reportId: string }) => ({ id: reportId }),
      auditReadinessOverride: true,
      enforcePlanAccessFn: async () => ({ entitlements: {}, strictPlan: { plan: "scale" } }),
    } as never),
  ]);

  assert.equal(jobState.get("job_1")?.status, JobStatus.SUCCEEDED);
  assert.equal(jobState.get("job_2")?.status, JobStatus.SUCCEEDED);
  assert.equal(assessmentState.get("asm_1")?.status, AssessmentStatus.REPORT_DRAFT_READY);
  assert.equal(assessmentState.get("asm_2")?.status, AssessmentStatus.REPORT_DRAFT_READY);

  assessmentState.set("asm_dup", { id: "asm_dup", status: AssessmentStatus.ANALYSIS_QUEUED });

  const duplicateState: any = {
    id: "job_dup",
    assessmentId: "asm_dup",
    provider: "openai_langgraph",
    workflowVersion: "langgraph-audit.v1",
    status: JobStatus.QUEUED,
    attemptCount: 0,
    inputPayload: {},
    assessment: {
      organizationId: "org_dup",
      name: "Duplicate Assessment",
    },
  };
  let claimCount = 0;

  const duplicateDb = {
    ...db,
    analysisJob: {
      ...db.analysisJob,
      async updateMany() {
        claimCount += 1;
        if (claimCount === 1) {
          duplicateState.status = JobStatus.RUNNING;
          return { count: 1 };
        }
        return { count: 0 };
      },
      async update(input: Record<string, any>) {
        Object.assign(duplicateState, input.data);
        return {
          ...duplicateState,
          assessment: duplicateState.assessment,
        };
      },
    },
  };

  const duplicatePayload = buildPayload(99);
  const [firstDuplicate, secondDuplicate] = await Promise.all([
    runOpenAiAnalysisJob(duplicateState as never, {
      db: duplicateDb as never,
      payload: duplicatePayload,
      provider: {
        provider: "openai_langgraph",
        async executeAuditWorkflow() {
          return buildWorkflowResult(duplicatePayload);
        },
      } as never,
      publishDomainEventsFn: (async () => []) as never,
      markCustomerRunAnalysisCompletedFn: async () => null,
      markCustomerRunAnalysisFailedFn: async () => null,
      markCustomerRunReportGeneratedFn: async () => null,
      markCustomerRunWorkflowProgressFn: async () => null,
      upsertExecutiveDeliveryPackageForReportFn: async () => null,
      recordOperationalFindingFn: async () => null,
      logServerEventFn: () => undefined,
      sendOperationalAlertFn: async () => null,
      ensurePendingAssessmentReportFn: async () => ({ id: "report_dup" }),
      persistValidatedWorkflowReportFn: async ({ reportId }: { reportId: string }) => ({ id: reportId }),
      auditReadinessOverride: true,
      enforcePlanAccessFn: async () => ({ entitlements: {}, strictPlan: { plan: "scale" } }),
    } as never),
    runOpenAiAnalysisJob(duplicateState as never, {
      db: duplicateDb as never,
      payload: duplicatePayload,
      provider: {
        provider: "openai_langgraph",
        async executeAuditWorkflow() {
          return buildWorkflowResult(duplicatePayload);
        },
      } as never,
      publishDomainEventsFn: (async () => []) as never,
      markCustomerRunAnalysisCompletedFn: async () => null,
      markCustomerRunAnalysisFailedFn: async () => null,
      markCustomerRunReportGeneratedFn: async () => null,
      markCustomerRunWorkflowProgressFn: async () => null,
      upsertExecutiveDeliveryPackageForReportFn: async () => null,
      recordOperationalFindingFn: async () => null,
      logServerEventFn: () => undefined,
      sendOperationalAlertFn: async () => null,
      ensurePendingAssessmentReportFn: async () => ({ id: "report_dup" }),
      persistValidatedWorkflowReportFn: async ({ reportId }: { reportId: string }) => ({ id: reportId }),
      auditReadinessOverride: true,
      enforcePlanAccessFn: async () => ({ entitlements: {}, strictPlan: { plan: "scale" } }),
    } as never),
  ]);

  assert.notEqual(firstDuplicate.status, "skipped");
  assert.equal(secondDuplicate.status, "skipped");

  console.log("ai-load-scaling tests passed");
}

void runAiLoadScalingTests();


