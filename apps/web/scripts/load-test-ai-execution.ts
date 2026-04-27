import { performance } from "node:perf_hooks";
import { AssessmentStatus, JobStatus } from "@evolve-edge/db";
import { handleAiExecutionDispatch } from "../lib/ai-execution-route";
import {
  buildAnalysisDispatchPlan,
  runOpenAiAnalysisJob,
} from "../lib/ai-execution";

type PlanTier = "starter" | "scale" | "enterprise";

type InMemoryAssessment = {
  id: string;
  organizationId: string;
  status: AssessmentStatus;
  postureScore: number | null;
  riskLevel: string | null;
  name: string;
};

type InMemoryJob = {
  id: string;
  assessmentId: string;
  provider: string;
  status: JobStatus;
  jobType: string;
  workflowVersion: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  createdAt: Date;
  assessment: {
    organizationId: string;
    name: string;
  };
};

type PlannedInMemoryJob = InMemoryJob & {
  inputPayload: Record<string, unknown> & {
    workflowDispatchId: string;
    assessmentId: string;
    orgId: string;
    dispatchId: string;
  };
};

type ScenarioConfig = {
  label: string;
  concurrency: number;
  perOrgConcurrency: number;
  planTier: PlanTier;
  openAiMs: number;
  langGraphMs: number;
  dbWriteMs: number;
  failureEvery: number;
};

type Metrics = {
  apiAcceptanceMs: number[];
  queueLatencyMs: number[];
  executionMs: number[];
  openAiMs: number[];
  langGraphMs: number[];
  dbWriteMs: number[];
  failures: number;
  duplicatesPrevented: number;
  peakRunning: number;
};

const scenarios: ScenarioConfig[] = [
  {
    label: "10 concurrent workflows",
    concurrency: 10,
    perOrgConcurrency: 3,
    planTier: "starter",
    openAiMs: 80,
    langGraphMs: 15,
    dbWriteMs: 10,
    failureEvery: 0
  },
  {
    label: "50 concurrent workflows",
    concurrency: 50,
    perOrgConcurrency: 4,
    planTier: "scale",
    openAiMs: 110,
    langGraphMs: 20,
    dbWriteMs: 12,
    failureEvery: 17
  },
  {
    label: "100 concurrent workflows",
    concurrency: 100,
    perOrgConcurrency: 5,
    planTier: "enterprise",
    openAiMs: 150,
    langGraphMs: 25,
    dbWriteMs: 16,
    failureEvery: 23
  }
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

function buildPayload(index: number, planTier: PlanTier) {
  const orgOrdinal = (index % 8) + 1;
  return {
    orgId: `org_${orgOrdinal}`,
    assessmentId: `asm_${index}`,
    workflowDispatchId: `wd_${index}`,
    dispatchId: `disp_${index}`,
    customerEmail: `buyer${index}@example.com`,
    companyName: `Synthetic Customer ${index}`,
    industry: index % 3 === 0 ? "Legal" : index % 3 === 1 ? "Fintech" : "Healthtech",
    companySize: index % 2 === 0 ? "11-50" : "51-200",
    selectedFrameworks:
      index % 3 === 0 ? ["SOC 2"] : index % 3 === 1 ? ["SOC 2", "GLBA"] : ["SOC 2", "HIPAA"],
    assessmentAnswers: [
      {
        question: "Do you have formal security policies?",
        answer: index % 2 === 0 ? "No" : "Yes"
      },
      {
        question: "Do you use third-party AI tooling?",
        answer: "Yes"
      }
    ],
    evidenceSummary: `Synthetic evidence summary ${index}`,
    planTier
  };
}

function buildProviderResult(input: ReturnType<typeof buildPayload>) {
  return {
    provider: "openai_langgraph",
    workflowDispatchId: input.workflowDispatchId,
    status: "completed" as const,
    businessContext: {
      companyName: input.companyName,
      industry: input.industry,
      companySize: input.companySize,
      summary: "Synthetic business context.",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Customer trust"],
      securityMaturitySignals: ["Synthetic assessment input"]
    },
    frameworkMapping: {
      selectedFrameworks: input.selectedFrameworks,
      prioritizedFrameworks: input.selectedFrameworks,
      coverageSummary: "Synthetic framework coverage summary.",
      mappings: input.selectedFrameworks.map((framework) => ({
        framework,
        rationale: `Applies to ${input.industry}`,
        applicableAreas: ["Access control"]
      }))
    },
    riskAnalysis: {
      summary: "Synthetic risk summary.",
      findings: [
        {
          title: "Policy gap",
          severity: "Moderate",
          summary: "Policies are incomplete.",
          businessImpact: "Higher operational risk.",
          controlDomain: "governance",
          impactedFrameworks: input.selectedFrameworks,
          evidence: ["Synthetic evidence"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership engagement"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    riskScoring: {
      complianceScore: 77,
      riskLevel: "Moderate",
      highCount: 0,
      moderateCount: 1,
      lowCount: 0,
      keyDrivers: ["Policies incomplete"]
    },
    remediationRoadmap: {
      roadmapSummary: "Synthetic roadmap summary.",
      immediateActions: [
        {
          title: "Document policies",
          description: "Publish core policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    finalReport: {
      reportTitle: "Synthetic Executive Report",
      reportSubtitle: null,
      executiveSummary: "Synthetic executive summary.",
      detailedReport: "Synthetic detailed report.",
      conclusion: "Synthetic conclusion."
    },
    metadata: {
      model: "synthetic-load-model",
      reasoningModel: null,
      timeoutMs: 20_000,
      executionMs: 0,
      nodeTimingsMs: {},
      contractVersion: "langgraph-audit.v1"
    },
    executiveSummary: "Synthetic executive summary.",
    postureScore: 77,
    riskLevel: "Moderate",
    topConcerns: ["Policies incomplete"],
    findings: [
      {
        title: "Policy gap",
        summary: "Policies are incomplete.",
        severity: "MEDIUM",
        riskDomain: "governance",
        impactedFrameworks: input.selectedFrameworks,
        score: 23
      }
    ],
    recommendations: [
      {
        title: "Document policies",
        description: "Publish core policies.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days"
      }
    ],
    roadmap: [
      {
        title: "Document policies",
        description: "Publish core policies.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days"
      }
    ],
    finalReportText: "Synthetic detailed report."
  };
}

async function runScenario(workflows: number, scenario: ScenarioConfig) {
  const metrics: Metrics = {
    apiAcceptanceMs: [],
    queueLatencyMs: [],
    executionMs: [],
    openAiMs: [],
    langGraphMs: [],
    dbWriteMs: [],
    failures: 0,
    duplicatesPrevented: 0,
    peakRunning: 0
  };
  const assessments = new Map<string, InMemoryAssessment>();
  const jobs = new Map<string, InMemoryJob>();
  const reports = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  const db = {
    assessment: {
      async findUnique(input: { where: { id: string } }) {
        return assessments.get(input.where.id) ?? null;
      },
      async update(input: { where: { id: string }; data: Partial<InMemoryAssessment> }) {
        const existing = assessments.get(input.where.id);
        if (!existing) {
          throw new Error(`Missing assessment ${input.where.id}`);
        }

        const updated = {
          ...existing,
          ...input.data
        };
        assessments.set(input.where.id, updated);
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return updated;
      }
    },
    analysisJob: {
      async findFirst(input?: Record<string, unknown>) {
        const where = (input?.where as Record<string, unknown> | undefined) ?? {};
        const inputPayload = where.inputPayload as Record<string, unknown> | undefined;
        if (inputPayload?.path && JSON.stringify(inputPayload.path) === JSON.stringify(["workflowDispatchId"])) {
          const workflowDispatchId = inputPayload.equals as string;
          return [...jobs.values()]
            .filter((job) => job.inputPayload.workflowDispatchId === workflowDispatchId)
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
        }

        const assessmentId = where.assessmentId as string | undefined;
        return [...jobs.values()]
          .filter((job) => (!assessmentId || job.assessmentId === assessmentId) && job.jobType === "assessment_analysis")
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      },
      async create(input: { data: Record<string, unknown> }) {
        const job: InMemoryJob = {
          id: `job_${++idCounter}`,
          assessmentId: input.data.assessmentId as string,
          provider: input.data.provider as string,
          status: input.data.status as JobStatus,
          jobType: input.data.jobType as string,
          workflowVersion: (input.data.workflowVersion as string | null) ?? null,
          attemptCount: (input.data.attemptCount as number) ?? 0,
          lastAttemptAt: null,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          inputPayload: input.data.inputPayload as Record<string, unknown>,
          createdAt: new Date(),
          assessment: {
            organizationId: assessments.get(input.data.assessmentId as string)?.organizationId ?? "org_missing",
            name: assessments.get(input.data.assessmentId as string)?.name ?? "Synthetic Assessment"
          }
        };
        jobs.set(job.id, job);
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return job;
      },
      async update(input: { where: { id: string }; data: Record<string, unknown> }) {
        const existing = jobs.get(input.where.id);
        if (!existing) {
          throw new Error(`Missing job ${input.where.id}`);
        }

        const updated: InMemoryJob = {
          ...existing,
          ...input.data,
          assessment: existing.assessment
        };
        jobs.set(input.where.id, updated);
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return updated;
      },
      async updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const existing = jobs.get(input.where.id as string);
        if (!existing) {
          return { count: 0 };
        }

        const allowedStatuses = ((input.where.status as Record<string, unknown>)?.in as JobStatus[]) ?? [];
        if (!allowedStatuses.includes(existing.status)) {
          metrics.duplicatesPrevented += 1;
          return { count: 0 };
        }

        jobs.set(existing.id, {
          ...existing,
          ...input.data,
          attemptCount:
            typeof input.data.attemptCount === "object" &&
            input.data.attemptCount &&
            "increment" in (input.data.attemptCount as Record<string, unknown>)
              ? existing.attemptCount + Number((input.data.attemptCount as Record<string, unknown>).increment ?? 0)
              : (input.data.attemptCount as number | undefined) ?? existing.attemptCount,
          assessment: existing.assessment
        });

        const claimed = jobs.get(existing.id)!;
        if (claimed.startedAt) {
          metrics.queueLatencyMs.push(claimed.startedAt.getTime() - claimed.createdAt.getTime());
        }
        metrics.peakRunning = Math.max(
          metrics.peakRunning,
          [...jobs.values()].filter((job) => job.status === JobStatus.RUNNING).length
        );
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return { count: 1 };
      },
      async findMany(input: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number }) {
        let results = [...jobs.values()];
        const status = input.where.status;
        if (status && typeof status === "object" && "in" in (status as Record<string, unknown>)) {
          const statuses = (status as Record<string, unknown>).in as JobStatus[];
          results = results.filter((job) => statuses.includes(job.status));
        } else if (typeof status === "string") {
          results = results.filter((job) => job.status === status);
        }

        if (typeof input.where.provider === "string") {
          results = results.filter((job) => job.provider === input.where.provider);
        }

        if (typeof input.where.jobType === "string") {
          results = results.filter((job) => job.jobType === input.where.jobType);
        }

        results.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        return results.slice(0, input.take ?? results.length);
      }
    },
    workflowDispatch: {
      async findUnique() {
        return null;
      }
    }
  };

  const transactionDb = {
    analysisJob: db.analysisJob,
    assessment: db.assessment,
    report: {
      findFirst: async () => null,
      count: async () => 0,
      create: async (input: { data: Record<string, unknown> }) => {
        const record = {
          id: `report_${++idCounter}`,
          ...input.data
        };
        reports.set(record.id, record);
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return record;
      },
      findUnique: async (input: { where: { id: string } }) => reports.get(input.where.id) ?? null,
      update: async (input: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = reports.get(input.where.id) ?? { id: input.where.id };
        const updated = { ...existing, ...input.data };
        reports.set(input.where.id, updated);
        await wait(scenario.dbWriteMs);
        metrics.dbWriteMs.push(scenario.dbWriteMs);
        return updated;
      }
    },
    reportPackage: {
      findUnique: async () => null,
      create: async (input: { data: Record<string, unknown> }) => ({ id: `pkg_${++idCounter}`, ...input.data }),
      update: async (input: { where: { id: string }; data: Record<string, unknown> }) => ({ id: input.where.id, ...input.data })
    },
    reportPackageVersion: {
      create: async (input: { data: Record<string, unknown> }) => ({ id: `pkgv_${++idCounter}`, ...input.data })
    },
    domainEvent: {
      create: async () => ({ id: `evt_${++idCounter}` })
    }
  };

  const workerDb = {
    ...db,
    async $transaction<T>(callback: (tx: typeof transactionDb) => Promise<T>) {
      return callback({
        ...transactionDb
      });
    },
  };

  const payloads = Array.from({ length: workflows }, (_, index) => buildPayload(index + 1, scenario.planTier));

  for (const payload of payloads) {
    assessments.set(payload.assessmentId, {
      id: payload.assessmentId,
      organizationId: payload.orgId,
      status: AssessmentStatus.ANALYSIS_QUEUED,
      postureScore: null,
      riskLevel: null,
      name: `Assessment ${payload.assessmentId}`
    });
  }

  await Promise.all(
    payloads.map(async (payload) => {
      const acceptedStartedAt = performance.now();
      await handleAiExecutionDispatch(payload, {
        db: db as never
      });
      metrics.apiAcceptanceMs.push(performance.now() - acceptedStartedAt);
    })
  );

  const providerCallCounts = new Map<string, number>();
  const activeExecutions = new Set<Promise<void>>();

  const provider = {
    provider: "openai_langgraph" as const,
    async executeAuditWorkflow(input: ReturnType<typeof buildPayload>) {
      providerCallCounts.set(
        input.workflowDispatchId,
        (providerCallCounts.get(input.workflowDispatchId) ?? 0) + 1
      );

      const langGraphStartedAt = performance.now();
      await wait(scenario.langGraphMs);
      metrics.langGraphMs.push(performance.now() - langGraphStartedAt);

      const openAiStartedAt = performance.now();
      await wait(scenario.openAiMs);
      metrics.openAiMs.push(performance.now() - openAiStartedAt);

      const workflowIndex = Number(input.workflowDispatchId.split("_").at(-1) ?? "0");
      if (scenario.failureEvery > 0 && workflowIndex > 0 && workflowIndex % scenario.failureEvery === 0) {
        throw new Error("Synthetic provider failure for load test.");
      }

      return buildProviderResult(input);
    }
  };

  while (true) {
    const queuedJobs = [...jobs.values()].filter(
      (job): job is PlannedInMemoryJob & { status: "QUEUED" | "FAILED" } =>
        job.provider === "openai_langgraph" &&
        job.jobType === "assessment_analysis" &&
        (job.status === JobStatus.QUEUED || job.status === JobStatus.FAILED)
    );
    const runningJobs = [...jobs.values()]
      .filter((job) => job.status === JobStatus.RUNNING)
      .map((job) => ({
        id: job.id,
        assessment: {
          organizationId: job.assessment.organizationId
        }
      }));

    const plan = buildAnalysisDispatchPlan(queuedJobs as never, runningJobs, {
      globalLimit: scenario.concurrency,
      perOrgLimit: scenario.perOrgConcurrency
    });

    for (const job of plan.selected) {
      const startedAt = performance.now();
      const execution = runOpenAiAnalysisJob(job, {
        db: workerDb as never,
        payload: job.inputPayload as never,
        provider: provider as never,
        publishDomainEventsFn: (async () => []) as never,
        markCustomerRunAnalysisCompletedFn: async () => null,
        markCustomerRunAnalysisFailedFn: async () => null,
        markCustomerRunReportGeneratedFn: async () => null,
        markCustomerRunWorkflowProgressFn: async () => null,
        upsertExecutiveDeliveryPackageForReportFn: async () => null,
        recordOperationalFindingFn: async () => null,
        logServerEventFn: () => undefined,
        sendOperationalAlertFn: async () => null,
        ensurePendingAssessmentReportFn: async () => ({ id: `report_${++idCounter}` }),
        persistValidatedWorkflowReportFn: async ({ reportId }: { reportId: string }) => ({ id: reportId })
      } as never)
        .then((result) => {
          metrics.executionMs.push(performance.now() - startedAt);
          if (result.status === "failed") {
            metrics.failures += 1;
          }
        })
        .finally(() => {
          activeExecutions.delete(execution);
        });
      activeExecutions.add(execution);
    }

    if (activeExecutions.size === 0) {
      break;
    }

    await Promise.race(activeExecutions);
  }

  return {
    workflows,
    scenario,
    metrics,
    bottlenecks: [
      { label: "OpenAI latency", avgMs: average(metrics.openAiMs) },
      { label: "LangGraph orchestration", avgMs: average(metrics.langGraphMs) },
      { label: "DB writes", avgMs: average(metrics.dbWriteMs) },
      { label: "API acceptance", avgMs: average(metrics.apiAcceptanceMs) }
    ].sort((left, right) => right.avgMs - left.avgMs),
    providerCallCounts
  };
}

async function main() {
  for (const scenario of scenarios) {
    const result = await runScenario(
      Number(scenario.label.split(" ").at(0) ?? "10"),
      scenario
    );
    const successCount = result.workflows - result.metrics.failures;

    console.log(`\n=== ${scenario.label} ===`);
    console.log(
      JSON.stringify(
        {
          workflows: result.workflows,
          concurrency: scenario.concurrency,
          perOrgConcurrency: scenario.perOrgConcurrency,
          apiAcceptanceAvgMs: average(result.metrics.apiAcceptanceMs),
          queueLatencyAvgMs: average(result.metrics.queueLatencyMs),
          queueLatencyP95Ms: percentile(result.metrics.queueLatencyMs, 95),
          executionAvgMs: average(result.metrics.executionMs),
          executionP95Ms: percentile(result.metrics.executionMs, 95),
          failureRatePct:
            result.workflows === 0
              ? 0
              : Math.round((result.metrics.failures / result.workflows) * 10_000) / 100,
          successCount,
          peakRunning: result.metrics.peakRunning,
          duplicatesPrevented: result.metrics.duplicatesPrevented,
          topBottleneck: result.bottlenecks[0]?.label ?? "n/a"
        },
        null,
        2
      )
    );
    console.log("Bottleneck report:");
    for (const bottleneck of result.bottlenecks) {
      console.log(`- ${bottleneck.label}: ${bottleneck.avgMs}ms avg`);
    }
  }

  console.log("\nRecommendations:");
  console.log("- Keep global AI concurrency bounded; raising it above provider and DB capacity will inflate queue latency and retries.");
  console.log("- Tune per-org concurrency separately so one large customer cannot starve the rest of the queue.");
  console.log("- Watch OpenAI latency first; it is typically the dominant per-workflow cost under load.");
  console.log("- If DB write time rises materially, batch or streamline report/status writes before increasing concurrency further.");
}

void main();
