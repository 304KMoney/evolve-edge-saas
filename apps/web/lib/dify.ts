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
  markCustomerRunAnalysisFailed
} from "./customer-runs";
import {
  getCanonicalProcessingDepthForPlan,
  getCanonicalReportTemplateForPlan,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import { publishDomainEvents } from "./domain-events";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { recordOperationalFinding } from "./operations-queues";
import {
  buildCorrelationId,
  clampTimeoutMs,
  isProcessingClaimStale,
  normalizeExternalError
} from "./reliability";
import {
  normalizeDifyWorkflowOutputs,
  type DifyAssessmentPayload,
  type DifyRunResponse,
  type NormalizedDifyContract
} from "./dify-adapter";
import { getAppUrl, getDifyBaseUrl, getOptionalEnv, requireEnv } from "./runtime-config";
import { listOrganizationWorkflowRoutingDecisions, type NormalizedWorkflowHints } from "./workflow-routing";

const DIFY_ANALYSIS_CONTRACT_VERSION = "assessment-analysis.v1";
const DEFAULT_DIFY_TIMEOUT_MS = 20_000;
const MAX_ANALYSIS_ATTEMPTS = 3;
const DEFAULT_ANALYSIS_STALE_MINUTES = 30;

type DifyDbClient = Prisma.TransactionClient | typeof prisma;

// Dify calls are server-only and flow through this module. Request payloads are
// assembled from app-owned assessment and routing state, and raw Dify outputs
// must pass adapter validation before they are persisted or allowed to affect
// report-generation state.

export function getDifyWorkflowVersion() {
  return getOptionalEnv("DIFY_WORKFLOW_VERSION") ?? "v1";
}

function getDifyApiBaseUrl() {
  const configured = getDifyBaseUrl();
  if (!configured) {
    throw new Error("Missing required environment variable: DIFY_API_BASE_URL (or DIFY_BASE_URL alias)");
  }

  return configured;
}

function getDifyApiKey() {
  return requireEnv("DIFY_API_KEY");
}

function getDifyWorkflowId() {
  return requireEnv("DIFY_WORKFLOW_ID");
}

function getDifyDispatchSecret() {
  return requireEnv("DIFY_DISPATCH_SECRET");
}

function getDifyTimeoutMs() {
  const parsed = Number(getOptionalEnv("DIFY_TIMEOUT_MS") ?? "");
  return clampTimeoutMs(
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DIFY_TIMEOUT_MS,
    DEFAULT_DIFY_TIMEOUT_MS
  );
}

function getDifyStaleMinutes() {
  const parsed = Number(
    getOptionalEnv("DIFY_ANALYSIS_STALE_MINUTES") ?? DEFAULT_ANALYSIS_STALE_MINUTES
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ANALYSIS_STALE_MINUTES;
}

export function requireDifyDispatchSecret() {
  return getDifyDispatchSecret();
}

function summarizeSectionNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const notes = (value as Record<string, unknown>).notes;
  return typeof notes === "string" ? notes.trim() : "";
}

async function buildAssessmentPayload(
  assessmentId: string,
  routingDecisionId?: string | null
): Promise<DifyAssessmentPayload> {
  const assessment = await prisma.assessment.findUnique({
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
    throw new Error("Assessment not found for Dify execution.");
  }

  const routingDecision =
    routingDecisionId
      ? await prisma.workflowRoutingDecision.findUnique({
          where: { id: routingDecisionId }
        })
      : (
          await listOrganizationWorkflowRoutingDecisions(assessment.organizationId, {
            limit: 10
          })
        ).find(
          (decision) =>
            decision.workflowFamily === "ASSESSMENT_ANALYSIS" &&
            decision.sourceRecordType === "assessment" &&
            decision.sourceRecordId === assessmentId
        ) ?? null;
  const workflowHints =
    routingDecision?.workflowHints &&
    typeof routingDecision.workflowHints === "object" &&
    !Array.isArray(routingDecision.workflowHints)
      ? (routingDecision.workflowHints as Record<string, unknown>)
      : null;
  const canonicalPlanCode = resolveCanonicalPlanCodeFromRevenuePlanCode(
    routingDecision?.planCode ?? null
  );
  const workflowCode =
    workflowHints && typeof workflowHints.workflow_code === "string"
      ? workflowHints.workflow_code
      : typeof workflowHints?.routeKey === "string"
        ? workflowHints.routeKey
        : null;
  const reportTemplate = getCanonicalReportTemplateForPlan(canonicalPlanCode);
  const processingDepth = getCanonicalProcessingDepthForPlan(canonicalPlanCode);
  const frameworks = assessment.organization.frameworkSelections.map(
    (selection) => selection.frameworkId
  );

  return {
    contractVersion: DIFY_ANALYSIS_CONTRACT_VERSION,
    workflowVersion: getDifyWorkflowVersion(),
    assessment: {
      id: assessment.id,
      organizationId: assessment.organizationId,
      name: assessment.name,
      submittedAt: assessment.submittedAt?.toISOString() ?? null,
      intakeVersion: assessment.intakeVersion
    },
    sections: assessment.sections.map((section) => ({
      key: section.key,
      title: section.title,
      status: section.status,
      notes: summarizeSectionNotes(section.responses)
    })),
    reportUrl: `${getAppUrl()}/dashboard/reports`,
    commercial_context: {
      company_name: assessment.organization.name,
      contact_name: null,
      contact_email: null,
      industry: null,
      frameworks,
      plan_code: canonicalPlanCode,
      workflow_code: typeof workflowCode === "string" ? workflowCode : null,
      report_template: reportTemplate,
      processing_depth: processingDepth,
      top_concerns: []
    },
    routing_context: workflowHints
      ? {
          routing_decision_id: routingDecision?.id ?? null,
          workflow_family:
            typeof workflowHints.workflowFamily === "string"
              ? workflowHints.workflowFamily
              : "assessment_analysis",
          route_key:
            typeof workflowHints.routeKey === "string"
              ? workflowHints.routeKey
              : "analysis.scale_enhanced",
          processing_tier:
            typeof workflowHints.processingTier === "string"
              ? workflowHints.processingTier
              : "scale",
          report_template: reportTemplate,
          workflow_code:
            typeof workflowCode === "string" ? workflowCode : "audit_scale",
          processing_depth: processingDepth
        }
      : undefined,
    workflowRouting: workflowHints
      ? {
          decisionId: routingDecision?.id ?? null,
          workflowFamily:
            typeof workflowHints.workflowFamily === "string"
              ? workflowHints.workflowFamily
              : "assessment_analysis",
          routeKey:
            typeof workflowHints.routeKey === "string"
              ? workflowHints.routeKey
              : "analysis.scale_standard",
          processingTier:
            typeof workflowHints.processingTier === "string"
              ? workflowHints.processingTier
              : "standard",
          reportDepth:
            typeof workflowHints.reportDepth === "string"
              ? workflowHints.reportDepth
              : "standard",
          analysisDepth:
            typeof workflowHints.analysisDepth === "string"
              ? workflowHints.analysisDepth
              : "standard",
          monitoringMode:
            typeof workflowHints.monitoringMode === "string"
              ? workflowHints.monitoringMode
              : "disabled",
          controlScoringMode:
            typeof workflowHints.controlScoringMode === "string"
              ? workflowHints.controlScoringMode
              : "disabled",
          featureFlags:
            workflowHints.featureFlags &&
            typeof workflowHints.featureFlags === "object" &&
            !Array.isArray(workflowHints.featureFlags)
              ? (workflowHints.featureFlags as NormalizedWorkflowHints["featureFlags"])
              : {
                  monitoringEnabled: false,
                  controlScoringEnabled: false,
                  customFrameworksEnabled: false,
                  enterpriseOverrideActive: false,
                  demoSafeguardsActive: false
                }
        }
      : undefined
  };
}

function hashPayload(payload: DifyAssessmentPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

type DifyValidatedResult = NormalizedDifyContract;

export async function recordDifyAnalysisFailureFinding(input: {
  organizationId: string;
  analysisJobId: string;
  assessmentId: string;
  workflowVersion: string | null;
  attemptCount: number;
  retryable: boolean;
  category: string;
  statusCode: number | null;
  message: string;
  db?: DifyDbClient;
}) {
  const shouldPersist = !input.retryable || input.attemptCount >= MAX_ANALYSIS_ATTEMPTS;
  if (!shouldPersist) {
    return null;
  }

  const db = input.db ?? prisma;
  const summary = !input.retryable
    ? "Dify returned a terminal analysis failure that requires operator review before the customer workflow is retried."
    : "Dify analysis exhausted retry attempts and now requires operator review before the customer workflow is retried.";

  try {
    return await recordOperationalFinding(
      {
        organizationId: input.organizationId,
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "success.dify_analysis_failed",
        severity: OperationsQueueSeverity.HIGH,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "analysisJob",
        sourceRecordId: input.analysisJobId,
        title: "Dify analysis needs operator review",
        summary,
        recommendedAction:
          "Review the analysis job error, validate Dify credentials and workflow inputs, then requeue analysis only after the failure mode is understood.",
        metadata: {
          analysisJobId: input.analysisJobId,
          assessmentId: input.assessmentId,
          workflowVersion: input.workflowVersion,
          attemptCount: input.attemptCount,
          retryable: input.retryable,
          category: input.category,
          statusCode: input.statusCode,
          message: input.message
        }
      },
      db
    );
  } catch (error) {
    logServerEvent("warn", "dify.analysis.failure_finding_failed", {
      org_id: input.organizationId,
      resource_id: input.analysisJobId,
      status: "warning",
      source: "dify.analysis",
      metadata: {
        assessmentId: input.assessmentId,
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });

    return null;
  }
}

async function callDifyWorkflow(input: {
  payload: DifyAssessmentPayload;
  jobId: string;
  requestHash: string;
}) {
  const correlationId = buildCorrelationId("dify");
  const response = await fetch(`${getDifyApiBaseUrl()}/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getDifyApiKey()}`,
      "Content-Type": "application/json",
      "x-evolve-edge-correlation-id": correlationId,
      "x-evolve-edge-idempotency-key": `analysis:${input.jobId}:${input.requestHash}`
    },
    body: JSON.stringify({
      workflow_id: getDifyWorkflowId(),
      inputs: {
        contractVersion: input.payload.contractVersion,
        workflowVersion: input.payload.workflowVersion,
        assessment: input.payload.assessment,
        sections: input.payload.sections,
        reportUrl: input.payload.reportUrl,
        commercial_context: input.payload.commercial_context,
        routing_context: input.payload.routing_context,
        workflowRouting: input.payload.workflowRouting
      },
      response_mode: "blocking",
      user: `analysis-job:${input.jobId}`
    }),
    signal: AbortSignal.timeout(getDifyTimeoutMs())
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `[${correlationId}] Dify API error (${response.status}): ${text}`.slice(0, 1_000)
    );
  }

  return {
    correlationId,
    response: JSON.parse(text) as DifyRunResponse
  };
}

async function recoverStaleAnalysisJobs(limit: number) {
  const staleBefore = new Date(
    Date.now() - getDifyStaleMinutes() * 60 * 1000
  );
  const assessmentOrgById = new Map<string, string>();
  const staleJobs = await prisma.analysisJob.findMany({
    where: {
      provider: "dify",
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
        staleAfterMs: getDifyStaleMinutes() * 60 * 1000
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
              "Dify analysis exceeded the running timeout and exhausted retries."
          }
        });
        await tx.assessment.update({
          where: { id: job.assessmentId },
          data: {
            status: AssessmentStatus.ANALYSIS_QUEUED
          }
        });
      });

      const organizationId =
        assessmentOrgById.get(job.assessmentId) ??
        (
          await prisma.assessment.findUnique({
            where: { id: job.assessmentId },
            select: { organizationId: true }
          })
        )?.organizationId ??
        null;
      if (organizationId) {
        assessmentOrgById.set(job.assessmentId, organizationId);
        await recordDifyAnalysisFailureFinding({
          organizationId,
          analysisJobId: job.id,
          assessmentId: job.assessmentId,
          workflowVersion: job.workflowVersion,
          attemptCount: job.attemptCount,
          retryable: false,
          category: "stale_processing",
          statusCode: null,
          message:
            "Dify analysis exceeded the running timeout and exhausted retries."
        });
      }

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
            "Dify analysis exceeded the running timeout and was re-queued automatically."
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

async function markJobFailed(
  db: DifyDbClient,
  jobId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
  const job = await db.analysisJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.FAILED,
      errorMessage: message,
      completedAt: new Date()
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

  await publishDomainEvents(db, [
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

type FailedAnalysisJobRecord = Awaited<ReturnType<typeof markJobFailed>>;

export async function dispatchQueuedAssessmentAnalysisJobs(options?: { limit?: number }) {
  const limit = options?.limit ?? 10;
  const recoveredStale = await recoverStaleAnalysisJobs(limit);
  const jobs = await prisma.analysisJob.findMany({
    where: {
      provider: "dify",
      jobType: "assessment_analysis",
      status: {
        in: [JobStatus.QUEUED, JobStatus.FAILED]
      },
      attemptCount: {
        lt: MAX_ANALYSIS_ATTEMPTS
      }
    },
    include: {
      assessment: {
        include: {
          sections: {
            orderBy: { orderIndex: "asc" }
          }
        }
      }
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let started = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const claimedAt = new Date();
    const routingDecisionId =
      job.inputPayload &&
      typeof job.inputPayload === "object" &&
      !Array.isArray(job.inputPayload) &&
      typeof (job.inputPayload as Record<string, unknown>).workflowRoutingDecisionId ===
        "string"
        ? String(
            (job.inputPayload as Record<string, unknown>).workflowRoutingDecisionId
          )
        : null;
    const payload = await buildAssessmentPayload(job.assessmentId, routingDecisionId);
    const requestHash = hashPayload(payload);
    const claim = await prisma.analysisJob.updateMany({
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
        contractVersion: payload.contractVersion,
        workflowVersion: payload.workflowVersion,
        requestHash,
        inputPayload: payload
      }
    });

    if (claim.count === 0) {
      continue;
    }

    started += 1;

    await publishDomainEvents(prisma, [
      {
        type: "analysis.run.started",
        aggregateType: "analysisJob",
        aggregateId: job.id,
        orgId: job.assessment.organizationId,
        idempotencyKey: `analysis.run.started:${job.id}:${requestHash}`,
        payload: {
          analysisJobId: job.id,
          assessmentId: job.assessmentId,
          provider: "dify",
          contractVersion: payload.contractVersion,
          workflowVersion: payload.workflowVersion
        }
      }
    ]);

    try {
      const { response, correlationId } = await callDifyWorkflow({
        payload,
        jobId: job.id,
        requestHash
      });

      const outputs = response.data?.outputs;
      if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
        throw new Error("Dify response did not include outputs.");
      }

      const validated = normalizeDifyWorkflowOutputs(outputs);
      const completedAt = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.analysisJob.update({
          where: { id: job.id },
          data: {
            providerRequestId:
              response.request_id ?? response.workflow_run_id ?? response.data?.id ?? null,
            status: JobStatus.SUCCEEDED,
            outputPayload: {
              contractVersion: DIFY_ANALYSIS_CONTRACT_VERSION,
              workflowVersion: payload.workflowVersion,
              requestHash,
              result: validated
            },
            completedAt,
            errorMessage: null
          }
        });

        await tx.assessment.update({
          where: { id: job.assessmentId },
          data: {
            status: AssessmentStatus.REPORT_DRAFT_READY
          }
        });

        await publishDomainEvents(tx, [
          {
            type: "analysis.run.completed",
            aggregateType: "analysisJob",
            aggregateId: job.id,
            orgId: job.assessment.organizationId,
            idempotencyKey: `analysis.run.completed:${job.id}:${requestHash}`,
            payload: {
              analysisJobId: job.id,
              assessmentId: job.assessmentId,
              provider: "dify",
              providerRequestId:
                response.request_id ?? response.workflow_run_id ?? response.data?.id ?? null,
              contractVersion: payload.contractVersion,
              workflowVersion: payload.workflowVersion
            }
          }
        ]);
      });

      logServerEvent("info", "dify.analysis.completed", {
        org_id: job.assessment.organizationId,
        correlation_id: correlationId,
        resource_id: job.id,
        status: "succeeded",
        source: "dify.analysis",
        metadata: {
          analysisJobId: job.id,
          assessmentId: job.assessmentId,
          providerRequestId:
            response.request_id ?? response.workflow_run_id ?? response.data?.id ?? null
        }
      });
      await markCustomerRunAnalysisCompleted(job.assessmentId);

      completed += 1;
    } catch (error) {
      const normalizedError = normalizeExternalError(
        error,
        "Dify analysis failed."
      );
      const failedJob: FailedAnalysisJobRecord = await markJobFailed(
        prisma,
        job.id,
        error
      );
      await markCustomerRunAnalysisFailed(
        job.assessmentId,
        normalizedError.message
      );
      await recordDifyAnalysisFailureFinding({
        organizationId: failedJob.assessment.organizationId,
        analysisJobId: failedJob.id,
        assessmentId: failedJob.assessmentId,
        workflowVersion: failedJob.workflowVersion,
        attemptCount: failedJob.attemptCount,
        retryable: normalizedError.retryable,
        category: normalizedError.category,
        statusCode: normalizedError.statusCode,
        message: normalizedError.message
      });
      const correlationMatch =
        error instanceof Error
          ? error.message.match(/^\[([^\]]+)\]/)
          : null;
      logServerEvent("warn", "dify.analysis.failed", {
        org_id: job.assessment.organizationId,
        correlation_id: correlationMatch?.[1] ?? null,
        resource_id: job.id,
        status: "failed",
        source: "dify.analysis",
        metadata: {
          analysisJobId: job.id,
          assessmentId: job.assessmentId,
          retryable: normalizedError.retryable,
          category: normalizedError.category,
          statusCode: normalizedError.statusCode,
          message: normalizedError.message
        }
      });
      await sendOperationalAlert({
        source: "dify.analysis",
        title: "Dify analysis run failed",
        severity: normalizedError.retryable ? "warn" : "error",
        metadata: {
          analysisJobId: job.id,
          assessmentId: job.assessmentId,
          retryable: normalizedError.retryable,
          category: normalizedError.category,
          statusCode: normalizedError.statusCode,
          message: normalizedError.message
        }
      });
      failed += 1;
    }
  }

  return {
    processed: jobs.length,
    recoveredStale,
    reviewRequired: recoveredStale.deadLetters,
    started,
    completed,
    failed
  };
}
