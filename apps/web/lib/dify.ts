import { createHash } from "node:crypto";
import {
  AssessmentStatus,
  JobStatus,
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
import {
  buildCorrelationId,
  clampTimeoutMs,
  isProcessingClaimStale,
  normalizeExternalError
} from "./reliability";
import { normalizeDifyContractShape } from "./integration-contracts";
import { getAppUrl, getOptionalEnv, requireEnv } from "./runtime-config";
import { listOrganizationWorkflowRoutingDecisions, type NormalizedWorkflowHints } from "./workflow-routing";

const DIFY_ANALYSIS_CONTRACT_VERSION = "assessment-analysis.v1";
const DEFAULT_DIFY_TIMEOUT_MS = 20_000;
const MAX_ANALYSIS_ATTEMPTS = 3;
const DEFAULT_ANALYSIS_STALE_MINUTES = 30;

type DifyDbClient = Prisma.TransactionClient | typeof prisma;

type DifyAssessmentPayload = {
  contractVersion: string;
  workflowVersion: string;
  assessment: {
    id: string;
    organizationId: string;
    name: string;
    submittedAt: string | null;
    intakeVersion: number;
  };
  sections: Array<{
    key: string;
    title: string;
    status: string;
    notes: string;
  }>;
  reportUrl: string;
  commercial_context?: {
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    industry: string | null;
    frameworks: string[];
    plan_code: string | null;
    workflow_code: string | null;
    report_template: string;
    processing_depth: string;
    top_concerns: string[];
  };
  routing_context?: {
    routing_decision_id: string | null;
    workflow_family: string;
    route_key: string;
    processing_tier: string;
    report_template: string;
    workflow_code: string;
    processing_depth: string;
  };
  workflowRouting?: {
    decisionId: string | null;
    workflowFamily: string;
    routeKey: string;
    processingTier: string;
    reportDepth: string;
    analysisDepth: string;
    monitoringMode: string;
    controlScoringMode: string;
    featureFlags: NormalizedWorkflowHints["featureFlags"];
  };
};

type DifyValidatedResult = {
  finalReport: string | null;
  executiveSummary: string;
  postureScore: number;
  riskLevel: string;
  topConcerns: string[];
  findings: Array<{
    title: string;
    summary: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    riskDomain: string;
    impactedFrameworks: string[];
    score?: number | null;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    ownerRole?: string | null;
    effort?: string | null;
    targetTimeline?: string | null;
  }>;
};

type DifyRunResponse = {
  request_id?: string;
  workflow_run_id?: string;
  data?: {
    id?: string;
    outputs?: Record<string, unknown>;
    status?: string;
    error?: string | null;
  };
};

export function getDifyWorkflowVersion() {
  return getOptionalEnv("DIFY_WORKFLOW_VERSION") ?? "v1";
}

function getDifyApiBaseUrl() {
  return requireEnv("DIFY_API_BASE_URL");
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

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback?: string | null
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback ?? null;
}

function validateDifyResponse(outputs: Record<string, unknown>): DifyValidatedResult {
  const executiveSummary =
    readFirstString(outputs, ["executiveSummary", "executive_summary"]) ?? "";
  const postureScore = outputs.postureScore;
  const riskLevel = readFirstString(outputs, ["riskLevel", "risk_level"]) ?? "";
  const finalReport = readFirstString(outputs, ["finalReport", "final_report"]);
  const findings = outputs.findings;
  const topConcernsValue = outputs.topConcerns ?? outputs.top_concerns;
  const recommendations = outputs.recommendations ?? outputs.roadmap;

  if (executiveSummary.trim().length === 0) {
    throw new Error("Dify response missing executiveSummary.");
  }

  if (
    typeof postureScore !== "number" ||
    Number.isNaN(postureScore) ||
    postureScore < 0 ||
    postureScore > 100
  ) {
    throw new Error("Dify response postureScore must be a number between 0 and 100.");
  }

  if (riskLevel.trim().length === 0) {
    throw new Error("Dify response missing riskLevel.");
  }

  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error("Dify response must include findings.");
  }

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    throw new Error("Dify response must include recommendations.");
  }

  const normalizedFindings = findings.map((finding, index) => {
      if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
        throw new Error(`Invalid Dify finding at index ${index}.`);
      }

      const record = finding as Record<string, unknown>;
      if (
        typeof record.title !== "string" ||
        typeof record.summary !== "string" ||
        typeof record.severity !== "string" ||
        typeof record.riskDomain !== "string"
      ) {
        throw new Error(`Incomplete Dify finding at index ${index}.`);
      }

      return {
        title: record.title.trim(),
        summary: record.summary.trim(),
        severity: record.severity as DifyValidatedResult["findings"][number]["severity"],
        riskDomain: record.riskDomain.trim(),
        impactedFrameworks: asStringArray(record.impactedFrameworks),
        score:
          typeof record.score === "number" && Number.isFinite(record.score)
            ? record.score
            : null
      };
    });
  const normalizedRecommendations = recommendations.map((recommendation, index) => {
      if (
        !recommendation ||
        typeof recommendation !== "object" ||
        Array.isArray(recommendation)
      ) {
        throw new Error(`Invalid Dify recommendation at index ${index}.`);
      }

      const record = recommendation as Record<string, unknown>;
      if (
        typeof record.title !== "string" ||
        typeof record.description !== "string" ||
        typeof record.priority !== "string"
      ) {
        throw new Error(`Incomplete Dify recommendation at index ${index}.`);
      }

      return {
        title: record.title.trim(),
        description: record.description.trim(),
        priority:
          record.priority as DifyValidatedResult["recommendations"][number]["priority"],
        ownerRole: typeof record.ownerRole === "string" ? record.ownerRole.trim() : null,
        effort: typeof record.effort === "string" ? record.effort.trim() : null,
        targetTimeline:
          typeof record.targetTimeline === "string"
            ? record.targetTimeline.trim()
            : null
      };
    });

  return normalizeDifyContractShape({
    finalReport,
    executiveSummary: executiveSummary.trim(),
    postureScore,
    riskLevel: riskLevel.trim(),
    topConcerns: asStringArray(topConcernsValue),
    findings: normalizedFindings,
    recommendations: normalizedRecommendations
  });
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

  return JSON.parse(text) as DifyRunResponse;
}

async function recoverStaleAnalysisJobs(limit: number) {
  const staleBefore = new Date(
    Date.now() - getDifyStaleMinutes() * 60 * 1000
  );
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
      const response = await callDifyWorkflow({
        payload,
        jobId: job.id,
        requestHash
      });

      const outputs = response.data?.outputs;
      if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
        throw new Error("Dify response did not include outputs.");
      }

      const validated = validateDifyResponse(outputs);
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
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        providerRequestId:
          response.request_id ?? response.workflow_run_id ?? response.data?.id ?? null
      });
      await markCustomerRunAnalysisCompleted(job.assessmentId);

      completed += 1;
    } catch (error) {
      await markJobFailed(prisma, job.id, error);
      await markCustomerRunAnalysisFailed(
        job.assessmentId,
        normalizeExternalError(error, "Dify analysis failed.").message
      );
      const normalizedError = normalizeExternalError(
        error,
        "Dify analysis failed."
      );
      logServerEvent("warn", "dify.analysis.failed", {
        analysisJobId: job.id,
        assessmentId: job.assessmentId,
        retryable: normalizedError.retryable,
        category: normalizedError.category,
        statusCode: normalizedError.statusCode,
        message: normalizedError.message
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
