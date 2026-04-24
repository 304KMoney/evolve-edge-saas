import { createHash } from "node:crypto";
import {
  AssessmentStatus,
  JobStatus,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  prisma
} from "@evolve-edge/db";
import {
  markCustomerRunAnalysisCompleted,
  markCustomerRunAnalysisFailed,
  markCustomerRunReportGenerated,
  markCustomerRunWorkflowProgress
} from "./customer-runs";
import { publishDomainEvents } from "./domain-events";
import { upsertExecutiveDeliveryPackageForReport } from "./executive-delivery";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { recordOperationalFinding } from "./operations-queues";
import {
  buildCorrelationId,
  isProcessingClaimStale,
  normalizeExternalError
} from "./reliability";
import { getAuditAiExecutionProvider } from "./ai-provider";
import {
  getAiExecutionMaxConcurrency,
  getAiExecutionMaxConcurrentPerOrg,
  getOptionalEnv
} from "./runtime-config";
import { isAuthorizedRequestWithSecrets } from "./security-auth";
import {
  auditWorkflowOutputSchema,
  executeAuditWorkflowInputSchema,
  planTierSchema,
  type AuditWorkflowOutput,
  type ExecuteAuditWorkflowInput
} from "../src/server/ai/providers/types";
import {
  buildSafeWorkflowFailure,
  sanitizeWorkflowErrorMessage,
  type WorkflowTrace,
} from "../src/server/ai/observability/trace";
import {
  getWorkflowTraceByDispatchId,
  getWorkflowTraceSnapshot,
  replayWorkflow,
} from "../src/server/ai/observability/workflow-tracker";

const AI_ANALYSIS_CONTRACT_VERSION = "langgraph-audit.v1";
const MAX_ANALYSIS_RETRIES = 2;
const MAX_ANALYSIS_ATTEMPTS = MAX_ANALYSIS_RETRIES + 1;
const DEFAULT_ANALYSIS_STALE_MINUTES = 30;

type AiExecutionDbClient = Prisma.TransactionClient | typeof prisma;
type AiExecutionWorkerDbClient = Pick<
  typeof prisma,
  "$transaction" | "analysisJob" | "assessment"
>;
type AnalysisJobExecutionRecord = {
  id: string;
  assessmentId: string;
  provider: string;
  status: JobStatus;
  workflowVersion: string | null;
  attemptCount: number;
  lastAttemptAt?: Date | null;
  inputPayload: Prisma.JsonValue;
  assessment: {
    organizationId: string;
    name: string;
  };
};

type MinimalAnalysisDispatchRecord = Pick<
  AnalysisJobExecutionRecord,
  | "id"
  | "assessmentId"
  | "provider"
  | "workflowVersion"
  | "status"
  | "attemptCount"
  | "lastAttemptAt"
  | "inputPayload"
> & {
  assessment: {
    organizationId: string;
    name: string;
  };
};

type EnsurePendingAssessmentReportFn = (input: {
  db?: AiExecutionDbClient;
  organizationId: string;
  assessmentId: string;
  assessmentName: string;
  createdByUserId?: string | null;
  title?: string | null;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
  engagementProgramId?: string | null;
}) => Promise<{ id: string }>;

type PersistValidatedWorkflowReportFn = (input: {
  db?: AiExecutionDbClient;
  reportId: string;
  result: AuditWorkflowOutput;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
}) => Promise<{ id: string }>;

async function loadReportRecordHelpers() {
  return import("./report-records");
}

export function getAiExecutionWorkflowVersion() {
  return AI_ANALYSIS_CONTRACT_VERSION;
}

export function getAiExecutionDispatchSecrets() {
  return [
    getOptionalEnv("AI_EXECUTION_DISPATCH_SECRET"),
    getOptionalEnv("AI_EXECUTION_SERVICE_TOKEN"),
    getOptionalEnv("DIFY_DISPATCH_SECRET"),
    getOptionalEnv("N8N_CALLBACK_SHARED_SECRET"),
    getOptionalEnv("N8N_CALLBACK_SECRET")
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));
}

export function getAiExecutionDispatchSecret() {
  return getAiExecutionDispatchSecrets()[0] ?? null;
}

export function requireAiExecutionDispatchSecret() {
  const secret = getAiExecutionDispatchSecret();
  if (!secret) {
    throw new Error(
      "Missing required environment variable: AI_EXECUTION_DISPATCH_SECRET or compatible fallback secret."
    );
  }

  return secret;
}

export function isAuthorizedAiExecutionDispatchRequest(request: Request) {
  return isAuthorizedRequestWithSecrets(request, getAiExecutionDispatchSecrets());
}

function getAiExecutionStaleMinutes() {
  const parsed = Number(
    getOptionalEnv("AI_EXECUTION_STALE_MINUTES") ?? DEFAULT_ANALYSIS_STALE_MINUTES
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ANALYSIS_STALE_MINUTES;
}

function getRetryBackoffMs(attemptCount: number) {
  if (attemptCount <= 0) {
    return 0;
  }

  return Math.min(2 ** (attemptCount - 1) * 60_000, 10 * 60_000);
}

export function getAiExecutionConcurrencyLimits() {
  const globalLimit = Math.max(1, getAiExecutionMaxConcurrency());
  const perOrgLimit = Math.max(1, Math.min(getAiExecutionMaxConcurrentPerOrg(), globalLimit));

  return {
    globalLimit,
    perOrgLimit
  };
}

export function isAnalysisJobReadyForRetry(
  job: Pick<AnalysisJobExecutionRecord, "status" | "attemptCount" | "lastAttemptAt">,
  now = new Date()
) {
  if (job.status === JobStatus.QUEUED) {
    return true;
  }

  if (job.status !== JobStatus.FAILED || job.attemptCount >= MAX_ANALYSIS_ATTEMPTS) {
    return false;
  }

  if (!job.lastAttemptAt) {
    return true;
  }

  return now.getTime() - job.lastAttemptAt.getTime() >= getRetryBackoffMs(job.attemptCount);
}

export function buildAnalysisDispatchPlan(
  jobs: MinimalAnalysisDispatchRecord[],
  runningJobs: Array<{ assessment: { organizationId: string } }>,
  options?: {
    now?: Date;
    globalLimit?: number;
    perOrgLimit?: number;
  }
) {
  const now = options?.now ?? new Date();
  const configuredLimits = getAiExecutionConcurrencyLimits();
  const globalLimit = Math.max(1, options?.globalLimit ?? configuredLimits.globalLimit);
  const perOrgLimit = Math.max(1, options?.perOrgLimit ?? configuredLimits.perOrgLimit);
  const runningPerOrg = new Map<string, number>();

  for (const runningJob of runningJobs) {
    const orgId = runningJob.assessment.organizationId;
    runningPerOrg.set(orgId, (runningPerOrg.get(orgId) ?? 0) + 1);
  }

  const availableGlobalSlots = Math.max(0, globalLimit - runningJobs.length);
  const selected: MinimalAnalysisDispatchRecord[] = [];

  for (const job of jobs) {
    if (selected.length >= availableGlobalSlots) {
      break;
    }

    if (!isAnalysisJobReadyForRetry(job, now)) {
      continue;
    }

    const orgId = job.assessment.organizationId;
    const orgSlotsUsed = runningPerOrg.get(orgId) ?? 0;

    if (orgSlotsUsed >= perOrgLimit) {
      continue;
    }

    runningPerOrg.set(orgId, orgSlotsUsed + 1);
    selected.push(job);
  }

  return {
    selected,
    availableGlobalSlots,
    globalLimit,
    perOrgLimit,
    runningCount: runningJobs.length
  };
}

function hashPayload(payload: ExecuteAuditWorkflowInput) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toJsonValue(value: ExecuteAuditWorkflowInput): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toGenericJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function applyCommercialRoutingPolicy(
  result: AuditWorkflowOutput,
  payload: ExecuteAuditWorkflowInput
) {
  const maxFindings = payload.commercialRouting?.maxFindings;
  if (typeof maxFindings !== "number") {
    return result;
  }

  const truncatedFindings = result.findings.slice(0, maxFindings);
  const truncatedRiskFindings = result.riskAnalysis.findings.slice(0, maxFindings);
  const truncatedTopConcerns = result.topConcerns.slice(0, maxFindings);

  return {
    ...result,
    findings: truncatedFindings,
    riskAnalysis: {
      ...result.riskAnalysis,
      findings: truncatedRiskFindings
    },
    topConcerns: truncatedTopConcerns
  } satisfies AuditWorkflowOutput;
}

function extractWorkflowTrace(workflowDispatchId: string) {
  return getWorkflowTraceSnapshot(workflowDispatchId, {
    includeDebug: true,
    includeInternal: true,
  });
}

function summarizeAssessmentSectionResponses(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const notes = (value as Record<string, unknown>).notes;
  return typeof notes === "string" ? notes.trim() : "";
}

async function buildExecutionInputFromAssessment(
  assessmentId: string,
  jobInputPayload?: Prisma.JsonValue | null,
  db: Pick<typeof prisma, "assessment"> = prisma
): Promise<ExecuteAuditWorkflowInput> {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      organization: {
        include: {
          frameworkSelections: true
        }
      },
      sections: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });

  if (!assessment) {
    throw new Error("Assessment not found for AI execution.");
  }

  const payloadRecord =
    jobInputPayload && typeof jobInputPayload === "object" && !Array.isArray(jobInputPayload)
      ? (jobInputPayload as Record<string, unknown>)
      : null;

  const frameworks = assessment.organization.frameworkSelections.map(
    (selection) => selection.frameworkId
  );
  const planTier = planTierSchema.catch("scale").parse(
    typeof payloadRecord?.planTier === "string"
      ? payloadRecord.planTier
      : typeof payloadRecord?.tier === "string"
        ? payloadRecord.tier
        : typeof payloadRecord?.plan === "string"
          ? payloadRecord.plan
          : "scale"
  );

  return executeAuditWorkflowInputSchema.parse({
    orgId: assessment.organizationId,
    assessmentId: assessment.id,
    workflowDispatchId:
      typeof payloadRecord?.workflowDispatchId === "string"
        ? payloadRecord.workflowDispatchId
        : assessment.id,
    dispatchId:
      typeof payloadRecord?.dispatchId === "string"
        ? payloadRecord.dispatchId
        : typeof payloadRecord?.workflowDispatchId === "string"
          ? payloadRecord.workflowDispatchId
          : assessment.id,
    customerEmail:
      typeof payloadRecord?.customerEmail === "string" ? payloadRecord.customerEmail : null,
    companyName:
      typeof payloadRecord?.companyName === "string"
        ? payloadRecord.companyName
        : assessment.organization.name,
    industry:
      typeof payloadRecord?.industry === "string"
        ? payloadRecord.industry
        : assessment.organization.industry ?? "Unspecified",
    companySize:
      typeof payloadRecord?.companySize === "string"
        ? payloadRecord.companySize
        : assessment.organization.sizeBand ?? "Unspecified",
    selectedFrameworks:
      Array.isArray(payloadRecord?.selectedFrameworks) &&
      payloadRecord.selectedFrameworks.every((value) => typeof value === "string")
        ? (payloadRecord.selectedFrameworks as string[])
        : frameworks.length > 0
          ? frameworks
          : ["SOC 2"],
    assessmentAnswers:
      Array.isArray(payloadRecord?.assessmentAnswers) &&
      payloadRecord.assessmentAnswers.length > 0
        ? payloadRecord.assessmentAnswers
        : assessment.sections.map((section) => ({
            key: section.key,
            question: section.title,
            answer: summarizeAssessmentSectionResponses(section.responses),
            notes: section.status
          })),
    evidenceSummary:
      typeof payloadRecord?.evidenceSummary === "string"
        ? payloadRecord.evidenceSummary
        : assessment.sections
            .map((section) => summarizeAssessmentSectionResponses(section.responses))
            .filter((value) => value.length > 0)
            .join("\n\n") || null,
    planTier
  });
}

async function recoverStaleOpenAiAnalysisJobs(limit: number) {
  const staleBefore = new Date(Date.now() - getAiExecutionStaleMinutes() * 60 * 1000);
  const staleJobs = await prisma.analysisJob.findMany({
    where: {
      provider: "openai_langgraph",
      jobType: "assessment_analysis",
      status: JobStatus.RUNNING,
      OR: [{ lastAttemptAt: { lt: staleBefore } }, { startedAt: { lt: staleBefore } }]
    },
    orderBy: { startedAt: "asc" },
    take: limit
  });

  let requeued = 0;
  let deadLetters = 0;

  for (const job of staleJobs) {
    if (
      !isProcessingClaimStale({
        processingStartedAt: job.startedAt,
        lastAttemptAt: job.lastAttemptAt,
        staleAfterMs: getAiExecutionStaleMinutes() * 60 * 1000
      })
    ) {
      continue;
    }

    if (job.attemptCount >= MAX_ANALYSIS_ATTEMPTS) {
      await prisma.$transaction(async (tx) => {
        await tx.analysisJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.FAILED,
            completedAt: new Date(),
            errorMessage:
              "OpenAI/LangGraph analysis exceeded the running timeout and exhausted retries."
          }
        });
        await tx.assessment.update({
          where: { id: job.assessmentId },
          data: {
            status: AssessmentStatus.ANALYSIS_QUEUED
          }
        });
      });

      deadLetters += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.analysisJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.QUEUED,
          startedAt: null,
          errorMessage:
            "OpenAI/LangGraph analysis exceeded the running timeout and was re-queued automatically."
        }
      });
      await tx.assessment.update({
        where: { id: job.assessmentId },
        data: {
          status: AssessmentStatus.ANALYSIS_QUEUED
        }
      });
    });

    requeued += 1;
  }

  return { requeued, deadLetters };
}

async function markOpenAiJobFailed(
  db: AiExecutionDbClient,
  jobId: string,
  error: unknown,
  trace?: WorkflowTrace | null,
  publishDomainEventsFn: typeof publishDomainEvents = publishDomainEvents
) {
  const message = error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error";
  const job = await db.analysisJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.FAILED,
      errorMessage: message,
      completedAt: new Date(),
      outputPayload: trace
        ? toGenericJsonValue({
            trace,
            failure: buildSafeWorkflowFailure(trace),
          })
        : Prisma.JsonNull
    },
    include: {
      assessment: true
    }
  });

  await db.assessment.update({
    where: { id: job.assessmentId },
    data: {
      status: AssessmentStatus.ANALYSIS_QUEUED
    }
  });

  await publishDomainEventsFn(db, [
    {
      type: "analysis.run.failed",
      aggregateType: "analysisJob",
      aggregateId: job.id,
      orgId: job.assessment.organizationId,
      idempotencyKey: `analysis.run.failed:${job.id}:${job.attemptCount}`,
      payload: {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        provider: job.provider,
        workflowVersion: job.workflowVersion,
        errorMessage: message
      }
    }
  ]);

  return job;
}

type FailedAnalysisJobRecord = Awaited<ReturnType<typeof markOpenAiJobFailed>>;

export async function runOpenAiAnalysisJob(
  job: AnalysisJobExecutionRecord,
  dependencies?: {
    db?: AiExecutionWorkerDbClient;
    provider?: ReturnType<typeof getAuditAiExecutionProvider>;
    payload?: ExecuteAuditWorkflowInput;
    publishDomainEventsFn?: typeof publishDomainEvents;
    markCustomerRunAnalysisCompletedFn?: typeof markCustomerRunAnalysisCompleted;
    markCustomerRunAnalysisFailedFn?: typeof markCustomerRunAnalysisFailed;
    markCustomerRunReportGeneratedFn?: typeof markCustomerRunReportGenerated;
    markCustomerRunWorkflowProgressFn?: typeof markCustomerRunWorkflowProgress;
    upsertExecutiveDeliveryPackageForReportFn?: typeof upsertExecutiveDeliveryPackageForReport;
    recordOperationalFindingFn?: typeof recordOperationalFinding;
    logServerEventFn?: typeof logServerEvent;
    sendOperationalAlertFn?: typeof sendOperationalAlert;
    ensurePendingAssessmentReportFn?: EnsurePendingAssessmentReportFn;
    persistValidatedWorkflowReportFn?: PersistValidatedWorkflowReportFn;
  }
) {
  const db = dependencies?.db ?? prisma;
  const provider = dependencies?.provider ?? getAuditAiExecutionProvider();
  const publishDomainEventsFn =
    dependencies?.publishDomainEventsFn ?? publishDomainEvents;
  const markCustomerRunAnalysisCompletedFn =
    dependencies?.markCustomerRunAnalysisCompletedFn ?? markCustomerRunAnalysisCompleted;
  const markCustomerRunAnalysisFailedFn =
    dependencies?.markCustomerRunAnalysisFailedFn ?? markCustomerRunAnalysisFailed;
  const markCustomerRunReportGeneratedFn =
    dependencies?.markCustomerRunReportGeneratedFn ?? markCustomerRunReportGenerated;
  const markCustomerRunWorkflowProgressFn =
    dependencies?.markCustomerRunWorkflowProgressFn ?? markCustomerRunWorkflowProgress;
  const upsertExecutiveDeliveryPackageForReportFn =
    dependencies?.upsertExecutiveDeliveryPackageForReportFn ??
    upsertExecutiveDeliveryPackageForReport;
  const recordOperationalFindingFn =
    dependencies?.recordOperationalFindingFn ?? recordOperationalFinding;
  const logServerEventFn = dependencies?.logServerEventFn ?? logServerEvent;
  const sendOperationalAlertFn =
    dependencies?.sendOperationalAlertFn ?? sendOperationalAlert;
  const ensurePendingAssessmentReportFn =
    dependencies?.ensurePendingAssessmentReportFn ??
    (await loadReportRecordHelpers()).ensurePendingAssessmentReport;
  const persistValidatedWorkflowReportFn =
    dependencies?.persistValidatedWorkflowReportFn ??
    (await loadReportRecordHelpers()).persistValidatedWorkflowReport;
  const claimedAt = new Date();
  const payload =
    dependencies?.payload ??
    (await buildExecutionInputFromAssessment(job.assessmentId, job.inputPayload, db));
  const requestHash = hashPayload(payload);
  const claim = await db.analysisJob.updateMany({
    where: {
      id: job.id,
      status: {
        in: [JobStatus.QUEUED, JobStatus.FAILED]
      }
    },
    data: {
      status: JobStatus.RUNNING,
      attemptCount: {
        increment: 1
      },
      lastAttemptAt: claimedAt,
      startedAt: claimedAt,
      completedAt: null,
      errorMessage: null,
      contractVersion: AI_ANALYSIS_CONTRACT_VERSION,
      workflowVersion: AI_ANALYSIS_CONTRACT_VERSION,
      requestHash,
      inputPayload: toJsonValue(payload)
    }
  });

  if (claim.count === 0) {
    return { status: "skipped" as const };
  }

  await db.assessment.update({
    where: { id: job.assessmentId },
    data: {
      status: AssessmentStatus.ANALYSIS_RUNNING
    }
  });

  await publishDomainEventsFn(prisma, [
    {
      type: "analysis.run.started",
      aggregateType: "analysisJob",
      aggregateId: job.id,
      orgId: job.assessment.organizationId,
      idempotencyKey: `analysis.run.started:${job.id}:${requestHash}`,
      payload: {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        provider: "openai_langgraph",
        contractVersion: AI_ANALYSIS_CONTRACT_VERSION,
        workflowVersion: AI_ANALYSIS_CONTRACT_VERSION
      }
    }
  ]);

  try {
    const rawResult = auditWorkflowOutputSchema.parse(
      await provider.executeAuditWorkflow(payload, {
        updateProgress: async (progressUpdate) => {
          await markCustomerRunWorkflowProgressFn({
            assessmentId: progressUpdate.assessmentId,
            status: progressUpdate.status,
            workflowDispatchId: progressUpdate.workflowDispatchId,
            dispatchId: progressUpdate.dispatchId
          });
        }
      })
    );
    const result = applyCommercialRoutingPolicy(rawResult, payload);
    const trace = extractWorkflowTrace(payload.workflowDispatchId);
    const completedAt = new Date();
    const correlationId = buildCorrelationId("openai-langgraph");

    await db.$transaction(async (tx) => {
      const pendingReport = await ensurePendingAssessmentReportFn({
        db: tx,
        organizationId: job.assessment.organizationId,
        assessmentId: job.assessmentId,
        assessmentName: job.assessment.name ?? `Assessment ${job.assessmentId}`,
        organizationNameSnapshot: payload.companyName,
        customerEmailSnapshot: payload.customerEmail,
        selectedPlan: payload.planTier
      });

      await tx.analysisJob.update({
        where: { id: job.id },
        data: {
          providerRequestId: `langgraph:${job.id}:${requestHash}`,
          status: JobStatus.SUCCEEDED,
          outputPayload: toGenericJsonValue({
            contractVersion: AI_ANALYSIS_CONTRACT_VERSION,
            workflowVersion: AI_ANALYSIS_CONTRACT_VERSION,
            requestHash,
            result,
            trace
          }),
          completedAt,
          errorMessage: null
        }
      });

      const report = await persistValidatedWorkflowReportFn({
        db: tx,
        reportId: pendingReport.id,
        result,
        organizationNameSnapshot: payload.companyName,
        customerEmailSnapshot: payload.customerEmail,
        selectedPlan: payload.planTier
      });

      await upsertExecutiveDeliveryPackageForReportFn({
        db: tx,
        reportId: report.id,
        actorUserId: null
      });

      await markCustomerRunReportGeneratedFn({
        assessmentId: job.assessmentId,
        reportId: report.id,
        db: tx
      });

      await tx.assessment.update({
        where: { id: job.assessmentId },
        data: {
          postureScore: result.postureScore,
          riskLevel: result.riskLevel,
          status: AssessmentStatus.REPORT_DRAFT_READY
        }
      });

      await publishDomainEventsFn(tx, [
        {
          type: "analysis.run.completed",
          aggregateType: "analysisJob",
          aggregateId: job.id,
          orgId: job.assessment.organizationId,
          idempotencyKey: `analysis.run.completed:${job.id}:${requestHash}`,
          payload: {
            analysisJobId: job.id,
            assessmentId: job.assessmentId,
            provider: "openai_langgraph",
            providerRequestId: `langgraph:${job.id}:${requestHash}`,
            contractVersion: AI_ANALYSIS_CONTRACT_VERSION,
            workflowVersion: AI_ANALYSIS_CONTRACT_VERSION
          }
        }
      ]);
    });

    logServerEventFn("info", "ai.execution.completed", {
      org_id: job.assessment.organizationId,
      correlation_id: correlationId,
      resource_id: job.id,
      status: "succeeded",
      source: "openai_langgraph.analysis",
      metadata: {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        providerRequestId: `langgraph:${job.id}:${requestHash}`
      }
    });
    return {
      status: "completed" as const,
      requestHash,
      result
    };
  } catch (error) {
    const normalizedError = normalizeExternalError(
      error,
      "OpenAI/LangGraph analysis failed."
    );
    const safeErrorMessage = sanitizeWorkflowErrorMessage(normalizedError.message);
    const trace = extractWorkflowTrace(payload.workflowDispatchId);
    const failedJob: FailedAnalysisJobRecord = await markOpenAiJobFailed(
      db as AiExecutionDbClient,
      job.id,
      new Error(safeErrorMessage),
      trace,
      publishDomainEventsFn
    );
    await markCustomerRunAnalysisFailedFn(job.assessmentId, safeErrorMessage);
    await recordOperationalFindingFn(
      {
        organizationId: failedJob.assessment.organizationId,
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "success.ai_execution_failed",
        severity: OperationsQueueSeverity.HIGH,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "analysisJob",
        sourceRecordId: failedJob.id,
        title: "OpenAI/LangGraph analysis needs operator review",
        summary:
          "The app-owned OpenAI/LangGraph analysis workflow failed or returned invalid structured output.",
        recommendedAction:
          "Review the AI execution payload, structured output validation errors, and model configuration before replaying the workflow.",
        metadata: {
          analysisJobId: failedJob.id,
          assessmentId: failedJob.assessmentId,
          workflowVersion: failedJob.workflowVersion,
          attemptCount: failedJob.attemptCount,
          retryable: normalizedError.retryable,
          category: normalizedError.category,
          statusCode: normalizedError.statusCode,
          message: safeErrorMessage,
          provider: "openai_langgraph"
        }
      },
      prisma
    );
    logServerEventFn("warn", "ai.execution.failed", {
      org_id: job.assessment.organizationId,
      resource_id: job.id,
      status: "failed",
      source: "openai_langgraph.analysis",
      metadata: {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        retryable: normalizedError.retryable,
        category: normalizedError.category,
        statusCode: normalizedError.statusCode,
        message: safeErrorMessage
      }
    });
    await sendOperationalAlertFn({
      source: "openai_langgraph.analysis",
      title: "OpenAI/LangGraph analysis run failed",
      severity: normalizedError.retryable ? "warn" : "error",
      metadata: {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        retryable: normalizedError.retryable,
        category: normalizedError.category,
        statusCode: normalizedError.statusCode,
        message: safeErrorMessage
      }
    });

    return {
      status: "failed" as const,
      safeError: safeErrorMessage
    };
  }
}

export async function dispatchQueuedOpenAiAnalysisJobs(options?: { limit?: number }) {
  const limit = options?.limit ?? 10;
  const recoveredStale = await recoverStaleOpenAiAnalysisJobs(limit);
  const concurrencyLimits = getAiExecutionConcurrencyLimits();
  const runningJobs = await prisma.analysisJob.findMany({
    where: {
      provider: "openai_langgraph",
      jobType: "assessment_analysis",
      status: JobStatus.RUNNING
    },
    select: {
      id: true,
      assessment: {
        select: {
          organizationId: true
        }
      }
    }
  });
  const jobs = await prisma.analysisJob.findMany({
    where: {
      provider: "openai_langgraph",
      jobType: "assessment_analysis",
      status: {
        in: [JobStatus.QUEUED, JobStatus.FAILED]
      },
      attemptCount: {
        lt: MAX_ANALYSIS_ATTEMPTS
      },
    },
    include: {
      assessment: true
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let started = 0;
  let completed = 0;
  let failed = 0;
  const provider = getAuditAiExecutionProvider();
  const plan = buildAnalysisDispatchPlan(jobs, runningJobs, {
    now: new Date(),
    globalLimit: concurrencyLimits.globalLimit,
    perOrgLimit: concurrencyLimits.perOrgLimit
  });
  const selectedJobs = plan.selected;
  const workerCount = Math.min(selectedJobs.length, plan.availableGlobalSlots);

  if (workerCount > 0) {
    let cursor = 0;
    const runNextJob = async (): Promise<void> => {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= selectedJobs.length) {
        return;
      }

      const job = selectedJobs[currentIndex]!;
      const result = await runOpenAiAnalysisJob(job, {
        db: prisma,
        provider,
      });

      if (result.status !== "skipped") {
        started += 1;

        if (result.status === "completed") {
          completed += 1;
        } else if (result.status === "failed") {
          failed += 1;
        }
      }

      await runNextJob();
    };

    await Promise.all(
      Array.from({ length: workerCount }, async () => runNextJob())
    );
  }

  return {
    processed: jobs.length,
    recoveredStale,
    reviewRequired: recoveredStale.deadLetters,
    started,
    completed,
    failed,
    globalConcurrencyLimit: plan.globalLimit,
    perOrgConcurrencyLimit: plan.perOrgLimit,
    runningBeforeDispatch: plan.runningCount,
    availableSlots: plan.availableGlobalSlots,
    selectedForExecution: selectedJobs.length
  };
}

export async function dispatchQueuedAssessmentAnalysisJobs(options?: { limit?: number }) {
  return dispatchQueuedOpenAiAnalysisJobs(options);
}

export { replayWorkflow };
