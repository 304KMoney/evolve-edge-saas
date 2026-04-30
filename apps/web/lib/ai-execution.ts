import { createHash } from "node:crypto";
import {
  AssessmentStatus,
  DeliveryStateStatus,
  JobStatus,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  RoutingSnapshotStatus,
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
  getAppUrl,
  getOptionalEnv
} from "./runtime-config";
import { queueEmailNotification } from "./email";
import { isAuthorizedRequestWithSecrets } from "./security-auth";
import {
  auditWorkflowOutputSchema,
  executeAuditWorkflowInputSchema,
  normalizedAuditExecutionOutputSchema,
  planTierSchema,
  type AuditWorkflowOutput,
  type ExecuteAuditWorkflowInput
} from "../src/server/ai/providers/types";
import type { NormalizedAuditReportInput } from "./report-builder";
import {
  getOrganizationAuditReadiness,
  isAuditIntakeCompleteFromRegulatoryProfile
} from "./audit-intake";
import { recordAuditLifecycleTransition } from "./audit-lifecycle";
import { requirePlanCapability } from "./plan-enforcement";
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
  normalizedOutput: NormalizedAuditReportInput;
  routingSnapshotId?: string | null;
  workflowCode?: string | null;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
}) => Promise<{ id: string; title: string }>;

type RunAuditExecutionInput = {
  snapshot_id: string;
  workflow_code: string;
  organization_id: string;
  intake_data: unknown;
};

type RunAuditExecutionDependencies = {
  db?: typeof prisma;
  runAnalysisJobFn?: typeof runOpenAiAnalysisJob;
  enforcePlanAccessFn?: typeof requirePlanCapability;
  now?: Date;
};

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

function readJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function mapWorkflowCodeToPlanTier(workflowCode: string) {
  switch (workflowCode) {
    case "audit_starter":
      return "starter" as const;
    case "audit_enterprise":
      return "enterprise" as const;
    case "audit_scale":
    default:
      return "scale" as const;
  }
}

function isRoutingSnapshotExecutableStatus(status: RoutingSnapshotStatus) {
  return (
    status === RoutingSnapshotStatus.PENDING ||
    status === RoutingSnapshotStatus.DISPATCH_QUEUED ||
    status === RoutingSnapshotStatus.DISPATCHED ||
    status === RoutingSnapshotStatus.STATUS_UPDATED
  );
}

function normalizeDbWorkflowCode(value: unknown) {
  const raw = String(value ?? "").toLowerCase();

  switch (raw) {
    case "audit_starter":
    case "audit_scale":
    case "audit_enterprise":
    case "briefing_only":
    case "intake_review":
      return raw;
    case "audit_starter".toUpperCase():
      return "audit_starter";
    case "audit_scale".toUpperCase():
      return "audit_scale";
    case "audit_enterprise".toUpperCase():
      return "audit_enterprise";
    case "briefing_only".toUpperCase():
      return "briefing_only";
    case "intake_review".toUpperCase():
      return "intake_review";
    default:
      return raw.replace(/^canonicalworkflowcode\./, "").toLowerCase();
  }
}

function isCompleteAuditExecutionIntakeData(value: unknown) {
  const record = readJsonObject(value);
  const auditIntake = readJsonObject(record?.auditIntake) ?? record;
  const hasRequiredText =
    Boolean(readString(auditIntake?.companyName) ?? readString(auditIntake?.company_name)) &&
    Boolean(readString(auditIntake?.industry)) &&
    Boolean(readString(auditIntake?.companySize) ?? readString(auditIntake?.company_size)) &&
    Boolean(readString(auditIntake?.dataSensitivity) ?? readString(auditIntake?.data_sensitivity));
  const hasAiUsage = typeof auditIntake?.usesAiTools === "boolean" ||
    typeof auditIntake?.uses_ai_tools === "boolean";
  const concerns = Array.isArray(auditIntake?.topConcerns)
    ? auditIntake.topConcerns
    : Array.isArray(auditIntake?.top_concerns)
      ? auditIntake.top_concerns
      : [];

  return hasRequiredText && hasAiUsage && concerns.length > 0;
}

function buildAssessmentAnswersFromIntake(intakeData: unknown) {
  const record = readJsonObject(intakeData);
  const auditIntake = readJsonObject(record?.auditIntake) ?? record ?? {};
  const topConcerns = Array.isArray(auditIntake.topConcerns)
    ? auditIntake.topConcerns
    : Array.isArray(auditIntake.top_concerns)
      ? auditIntake.top_concerns
      : [];
  const toolsPlatforms = Array.isArray(auditIntake.toolsPlatforms)
    ? auditIntake.toolsPlatforms
    : Array.isArray(auditIntake.tools_platforms)
      ? auditIntake.tools_platforms
      : [];

  return [
    {
      key: "company-profile",
      question: "Company profile",
      answer: {
        companyName: readString(auditIntake.companyName) ?? readString(auditIntake.company_name),
        industry: readString(auditIntake.industry),
        companySize: readString(auditIntake.companySize) ?? readString(auditIntake.company_size),
        dataSensitivity:
          readString(auditIntake.dataSensitivity) ?? readString(auditIntake.data_sensitivity)
      }
    },
    {
      key: "ai-usage",
      question: "AI usage inventory",
      answer: {
        usesAiTools: auditIntake.usesAiTools ?? auditIntake.uses_ai_tools ?? false,
        aiToolsDetails:
          readString(auditIntake.aiToolsDetails) ?? readString(auditIntake.ai_tools_details),
        toolsPlatforms
      }
    },
    {
      key: "top-concerns",
      question: "Top audit concerns",
      answer: topConcerns
    }
  ];
}

function buildEvidenceSummaryFromIntake(intakeData: unknown) {
  const record = readJsonObject(intakeData);
  const auditIntake = readJsonObject(record?.auditIntake) ?? record ?? {};
  const notes = readString(auditIntake.optionalNotes) ?? readString(auditIntake.optional_notes);
  const tools = Array.isArray(auditIntake.toolsPlatforms)
    ? auditIntake.toolsPlatforms.join(", ")
    : Array.isArray(auditIntake.tools_platforms)
      ? auditIntake.tools_platforms.join(", ")
      : null;

  return [notes ? `Notes: ${notes}` : null, tools ? `Tools/platforms: ${tools}` : null]
    .filter(Boolean)
    .join("\n\n") || null;
}

function assertAuditExecutionPayloadRouted(payload: ExecuteAuditWorkflowInput) {
  if (!payload.routingSnapshotId) {
    throw new Error("AI execution requires a backend routing snapshot.");
  }

  if (!payload.workflowDispatchId) {
    throw new Error("AI execution requires a backend workflow dispatch.");
  }
}

function buildRoadmapBuckets(result: AuditWorkflowOutput) {
  const normalizeAction = (action: AuditWorkflowOutput["roadmap"][number]) => ({
    title: action.title,
    summary: action.description,
    priority: action.priority,
    owner: action.ownerRole,
    timeline: action.targetTimeline
  });
  const buckets = {
    days_30: [] as ReturnType<typeof normalizeAction>[],
    days_60: [] as ReturnType<typeof normalizeAction>[],
    days_90: [] as ReturnType<typeof normalizeAction>[]
  };

  for (const action of result.roadmap) {
    const timeline = action.targetTimeline?.toLowerCase() ?? "";
    const normalized = normalizeAction(action);

    if (timeline.includes("90") || timeline.includes("strategic") || timeline.includes("quarter")) {
      buckets.days_90.push(normalized);
    } else if (timeline.includes("60") || timeline.includes("near")) {
      buckets.days_60.push(normalized);
    } else {
      buckets.days_30.push(normalized);
    }
  }

  return buckets;
}

export function normalizeAuditExecutionOutput(
  result: AuditWorkflowOutput
): NormalizedAuditReportInput {
  const topRisks = result.findings.map((finding: AuditWorkflowOutput["findings"][number]) => ({
    title: finding.title,
    summary: finding.summary,
    severity: finding.severity,
    frameworks: finding.impactedFrameworks
  }));
  const governanceGaps = [
    ...result.riskAnalysis.systemicThemes,
    ...result.findings
      .filter((finding: AuditWorkflowOutput["findings"][number]) =>
        finding.riskDomain.toLowerCase().includes("govern")
      )
      .map((finding: AuditWorkflowOutput["findings"][number]) => finding.title)
  ];
  const priorityActions = result.recommendations.map(
    (recommendation: AuditWorkflowOutput["recommendations"][number]) => ({
    title: recommendation.title,
    summary: recommendation.description,
    priority: recommendation.priority,
    owner: recommendation.ownerRole,
    timeline: recommendation.targetTimeline
    })
  );

  return normalizedAuditExecutionOutputSchema.parse({
    executive_summary: result.executiveSummary,
    risk_level: result.riskLevel,
    compliance_score: result.postureScore,
    top_risks: topRisks,
    governance_gaps:
      governanceGaps.length > 0
        ? Array.from(new Set(governanceGaps))
        : ["No governance gaps were identified in the validated workflow output."],
    priority_actions: priorityActions,
    roadmap_30_60_90: buildRoadmapBuckets(result),
    assumptions: [
      "Analysis is based on the completed onboarding intake, selected frameworks, and evidence summaries available at execution time.",
      "Recommendations are business-level summaries and must be reviewed before customer delivery."
    ],
    limitations: [
      "This draft does not reproduce secrets, payment card data, SSNs, PHI, or other sensitive raw records.",
      "This AI execution output is not a final certification or legal opinion."
    ]
  }) as NormalizedAuditReportInput;
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
          frameworkSelections: {
            include: {
              framework: true
            }
          }
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

  if (
    !assessment.organization.onboardingCompletedAt ||
    !isAuditIntakeCompleteFromRegulatoryProfile(assessment.organization.regulatoryProfile)
  ) {
    throw new Error("Required onboarding intake must be completed before AI execution.");
  }

  const payloadRecord =
    jobInputPayload && typeof jobInputPayload === "object" && !Array.isArray(jobInputPayload)
      ? (jobInputPayload as Record<string, unknown>)
      : null;

  const frameworks = assessment.organization.frameworkSelections.map(
    (selection) => selection.framework.name || selection.framework.code || selection.frameworkId
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
    routingSnapshotId:
      typeof payloadRecord?.routingSnapshotId === "string"
        ? payloadRecord.routingSnapshotId
        : undefined,
    workflowDispatchId:
      typeof payloadRecord?.workflowDispatchId === "string"
        ? payloadRecord.workflowDispatchId
        : "",
    dispatchId:
      typeof payloadRecord?.dispatchId === "string"
        ? payloadRecord.dispatchId
        : typeof payloadRecord?.workflowDispatchId === "string"
          ? payloadRecord.workflowDispatchId
          : "",
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
      outputPayload: toGenericJsonValue({
        status: "failed_review_required",
        failureReason: message,
        ...(trace
          ? {
              trace,
              failure: buildSafeWorkflowFailure(trace),
            }
          : {})
      })
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
    queueEmailNotificationFn?: typeof queueEmailNotification;
    enforcePlanAccessFn?: typeof requirePlanCapability;
    auditReadinessOverride?: boolean;
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
  const queueEmailNotificationFn =
    dependencies?.queueEmailNotificationFn ?? queueEmailNotification;
  const enforcePlanAccessFn =
    dependencies?.enforcePlanAccessFn ?? requirePlanCapability;
  const readiness =
    dependencies?.auditReadinessOverride === undefined
      ? await getOrganizationAuditReadiness({
          organizationId: job.assessment.organizationId
        })
      : {
          organizationId: job.assessment.organizationId,
          readyForAudit: dependencies.auditReadinessOverride
        };

  if (!readiness.readyForAudit) {
    logServerEventFn("warn", "ai.execution.blocked_intake_incomplete", {
      org_id: job.assessment.organizationId,
      resource_id: job.id,
      status: "blocked",
      source: "openai_langgraph.analysis",
      metadata: {
        assessmentId: job.assessmentId,
        reason: "audit_intake_incomplete"
      }
    });

    return {
      status: "blocked" as const,
      reason: "audit_intake_incomplete" as const
    };
  }

  const claimedAt = new Date();
  let payload: ExecuteAuditWorkflowInput;
  try {
    payload =
      dependencies?.payload ??
      (await buildExecutionInputFromAssessment(job.assessmentId, job.inputPayload, db));
    assertAuditExecutionPayloadRouted(payload);
    await enforcePlanAccessFn({
      organizationId: job.assessment.organizationId,
      capability: "ai_execution",
      workflowCode: payload.commercialRouting?.workflowCode ?? null,
      requestedPlan: payload.planTier,
      db: db as AiExecutionDbClient
    });
  } catch (error) {
    const safeErrorMessage = sanitizeWorkflowErrorMessage(
      error instanceof Error ? error.message : "AI execution preflight failed."
    );
    await markOpenAiJobFailed(
      db as AiExecutionDbClient,
      job.id,
      new Error(safeErrorMessage),
      null,
      publishDomainEventsFn
    );

    return {
      status: "failed" as const,
      safeError: safeErrorMessage
    };
  }
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
  await recordAuditLifecycleTransition({
    db,
    organizationId: job.assessment.organizationId,
    assessmentId: job.assessmentId,
    toStatus: "intake_complete",
    actorType: "SYSTEM",
    actorLabel: "openai-langgraph-worker",
    reasonCode: "intake.ready_for_analysis",
    evidence: {
      intakeComplete: readiness.readyForAudit
    },
    metadata: {
      provider: "openai_langgraph"
    }
  });
  if (payload.routingSnapshotId) {
    await recordAuditLifecycleTransition({
      db,
      organizationId: job.assessment.organizationId,
      assessmentId: job.assessmentId,
      toStatus: "routing_complete",
      actorType: "SYSTEM",
      actorLabel: "openai-langgraph-worker",
      reasonCode: "routing.snapshot.ready",
      linkages: {
        routingSnapshotId: payload.routingSnapshotId,
        workflowDispatchId: payload.workflowDispatchId ?? null
      },
      evidence: {
        routingSnapshotId: payload.routingSnapshotId
      },
      metadata: {
        provider: "openai_langgraph"
      }
    });
    await recordAuditLifecycleTransition({
      db,
      organizationId: job.assessment.organizationId,
      assessmentId: job.assessmentId,
      toStatus: "analysis_pending",
      actorType: "SYSTEM",
      actorLabel: "openai-langgraph-worker",
      reasonCode: "analysis.job.queued",
      linkages: {
        routingSnapshotId: payload.routingSnapshotId,
        workflowDispatchId: payload.workflowDispatchId ?? null
      },
      evidence: {
        analysisJobId: job.id
      },
      metadata: {
        provider: "openai_langgraph"
      }
    });
    await recordAuditLifecycleTransition({
      db,
      organizationId: job.assessment.organizationId,
      assessmentId: job.assessmentId,
      toStatus: "analysis_running",
      actorType: "JOB",
      actorLabel: "openai-langgraph-worker",
      reasonCode: "analysis.running",
      linkages: {
        routingSnapshotId: payload.routingSnapshotId,
        workflowDispatchId: payload.workflowDispatchId ?? null
      },
      evidence: {
        analysisJobId: job.id
      },
      metadata: {
        provider: "openai_langgraph"
      }
    });
  }

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
    const normalizedOutput = normalizeAuditExecutionOutput(result);
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
            status: "validated",
            routingSnapshotId: payload.routingSnapshotId,
            normalizedOutput,
            result,
            reportDraft: {
              available: true,
              validation: "passed",
              validatedAt: completedAt.toISOString()
            },
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
        normalizedOutput,
        routingSnapshotId: payload.routingSnapshotId,
        workflowCode: payload.commercialRouting?.workflowCode ?? null,
        organizationNameSnapshot: payload.companyName,
        customerEmailSnapshot: payload.customerEmail,
        selectedPlan: payload.planTier
      });
      await recordAuditLifecycleTransition({
        db: tx,
        organizationId: job.assessment.organizationId,
        assessmentId: job.assessmentId,
        toStatus: "analysis_complete",
        actorType: "JOB",
        actorLabel: "openai-langgraph-worker",
        reasonCode: "analysis.completed",
        linkages: {
          routingSnapshotId: payload.routingSnapshotId ?? null,
          workflowDispatchId: payload.workflowDispatchId ?? null,
          reportId: report.id
        },
        evidence: {
          reportId: report.id
        },
        metadata: {
          analysisJobId: job.id
        }
      });
      await recordAuditLifecycleTransition({
        db: tx,
        organizationId: job.assessment.organizationId,
        assessmentId: job.assessmentId,
        toStatus: "report_ready",
        actorType: "SYSTEM",
        actorLabel: "report-builder",
        reasonCode: "report.ready",
        linkages: {
          routingSnapshotId: payload.routingSnapshotId ?? null,
          workflowDispatchId: payload.workflowDispatchId ?? null,
          reportId: report.id
        },
        evidence: {
          reportId: report.id
        },
        metadata: {
          analysisJobId: job.id
        }
      });

      if (payload.routingSnapshotId) {
        await tx.deliveryStateRecord.updateMany({
          where: { routingSnapshotId: payload.routingSnapshotId },
          data: {
            reportId: report.id,
            latestExecutionResultJson: toGenericJsonValue({
              status: "report_ready",
              normalizedOutput,
              reportId: report.id,
              reportGeneratedAt: completedAt.toISOString()
            })
          }
        });
      }

      await upsertExecutiveDeliveryPackageForReportFn({
        db: tx,
        reportId: report.id,
        actorUserId: null
      });

      if (payload.customerEmail) {
        await queueEmailNotificationFn(tx, {
          templateKey: "report-ready",
          recipientEmail: payload.customerEmail,
          recipientName: null,
          orgId: job.assessment.organizationId,
          userId: null,
          idempotencyKey: `email:report-ready:${report.id}:ai-execution`,
          payload: {
            organizationName: payload.companyName,
            reportTitle: report.title,
            reportUrl: `${getAppUrl()}/dashboard/reports/${report.id}`
          }
        });
      }

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
    const isValidationFailure =
      Boolean(error && typeof error === "object" && "issues" in error) ||
      normalizedError.message.includes('"path"') ||
      normalizedError.message.includes("invalid_type");
    const safeErrorMessage = isValidationFailure
      ? "AI output validation failed; failed_review_required."
      : sanitizeWorkflowErrorMessage(normalizedError.message);
    const trace = extractWorkflowTrace(payload.workflowDispatchId);
    const failedJob: FailedAnalysisJobRecord = await markOpenAiJobFailed(
      db as AiExecutionDbClient,
      job.id,
      new Error(safeErrorMessage),
      trace,
      publishDomainEventsFn
    );
    await recordAuditLifecycleTransition({
      db,
      organizationId: job.assessment.organizationId,
      assessmentId: job.assessmentId,
      toStatus: "failed_review_required",
      actorType: "JOB",
      actorLabel: "openai-langgraph-worker",
      reasonCode: "analysis.failed_review_required",
      linkages: {
        routingSnapshotId: payload.routingSnapshotId ?? null,
        workflowDispatchId: payload.workflowDispatchId ?? null
      },
      evidence: {
        failureReason: safeErrorMessage
      },
      metadata: {
        analysisJobId: job.id,
        retryable: normalizedError.retryable,
        category: normalizedError.category
      }
    });
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

export async function runAuditExecution(
  input: RunAuditExecutionInput,
  dependencies?: RunAuditExecutionDependencies
) {
  const db = dependencies?.db ?? prisma;
  const runAnalysisJobFn = dependencies?.runAnalysisJobFn ?? runOpenAiAnalysisJob;
  const enforcePlanAccessFn = dependencies?.enforcePlanAccessFn ?? requirePlanCapability;
  const now = dependencies?.now ?? new Date();
  const snapshotId = input.snapshot_id.trim();
  const workflowCode = input.workflow_code.trim();
  const organizationId = input.organization_id.trim();

  if (!snapshotId) {
    throw new Error("AI execution requires snapshot_id.");
  }

  if (!workflowCode) {
    throw new Error("AI execution requires workflow_code.");
  }

  if (!organizationId) {
    throw new Error("AI execution requires organization_id.");
  }

  if (!isCompleteAuditExecutionIntakeData(input.intake_data)) {
    throw new Error("Completed intake_data is required before AI execution.");
  }

  const snapshot = await db.routingSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      workflowDispatches: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      organization: {
        include: {
          frameworkSelections: {
            include: {
              framework: true
            }
          }
        }
      }
    }
  });

  if (!snapshot) {
    throw new Error("Routing snapshot not found for AI execution.");
  }

  if (snapshot.organizationId !== organizationId) {
    throw new Error("Routing snapshot organization does not match AI execution request.");
  }

  if (normalizeDbWorkflowCode(snapshot.workflowCode) !== normalizeDbWorkflowCode(workflowCode)) {
    throw new Error("Routing snapshot workflow_code does not match AI execution request.");
  }

  if (!isRoutingSnapshotExecutableStatus(snapshot.status)) {
    throw new Error("Routing snapshot status does not allow AI execution.");
  }

  await enforcePlanAccessFn({
    organizationId,
    capability: "ai_execution",
    workflowCode,
    requestedPlan: mapWorkflowCodeToPlanTier(workflowCode),
    db
  });

  const readiness = await getOrganizationAuditReadiness({
    organizationId,
    db
  });

  if (!readiness.readyForAudit) {
    throw new Error("Required onboarding intake must be completed before AI execution.");
  }

  const workflowDispatch = snapshot.workflowDispatches[0] ?? null;
  if (!workflowDispatch) {
    throw new Error("AI execution requires a workflow dispatch tied to the routing snapshot.");
  }

  const assessment = await db.assessment.findFirst({
    where: {
      organizationId,
      status: {
        in: [
          AssessmentStatus.INTAKE_SUBMITTED,
          AssessmentStatus.ANALYSIS_QUEUED,
          AssessmentStatus.ANALYSIS_RUNNING,
          AssessmentStatus.REPORT_DRAFT_READY
        ]
      }
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }]
  });

  if (!assessment) {
    throw new Error("No intake-submitted assessment was found for AI execution.");
  }

  const hints = readJsonObject(snapshot.normalizedHintsJson);
  const selectedFrameworks =
    snapshot.organization.frameworkSelections.length > 0
      ? snapshot.organization.frameworkSelections.map(
          (selection) => selection.framework.name || selection.framework.code || selection.frameworkId
        )
      : ["SOC 2"];
  const planTier = mapWorkflowCodeToPlanTier(workflowCode);
  const payload = executeAuditWorkflowInputSchema.parse({
    orgId: organizationId,
    assessmentId: assessment.id,
    routingSnapshotId: snapshot.id,
    workflowDispatchId: workflowDispatch.id,
    dispatchId: workflowDispatch.id,
    customerEmail: null,
    companyName: snapshot.organization.name,
    industry: snapshot.organization.industry ?? "Unspecified",
    companySize: snapshot.organization.sizeBand ?? "Unspecified",
    selectedFrameworks,
    assessmentAnswers: buildAssessmentAnswersFromIntake(input.intake_data),
    evidenceSummary: buildEvidenceSummaryFromIntake(input.intake_data),
    planTier,
    commercialRouting:
      hints && readJsonObject(hints.capability_profile)
        ? {
            planTier,
            workflowCode,
            entitlementSource:
              readString(hints.entitlement_source) === "trial"
                ? "trial"
                : readString(hints.entitlement_source) === "override"
                  ? "override"
                  : readString(hints.entitlement_source) === "blocked"
                    ? "blocked"
                    : "subscription",
            reportDepth:
              readString(readJsonObject(hints.capability_profile)?.report_depth) === "custom"
                ? "custom"
                : readString(readJsonObject(hints.capability_profile)?.report_depth) === "enhanced"
                  ? "enhanced"
                  : readString(readJsonObject(hints.capability_profile)?.report_depth) === "standard"
                    ? "standard"
                    : "concise",
            maxFindings:
              typeof readJsonObject(hints.capability_profile)?.max_findings === "number"
                ? (readJsonObject(hints.capability_profile)?.max_findings as number)
                : 5,
            roadmapDetail:
              readString(readJsonObject(hints.capability_profile)?.roadmap_detail) === "full"
                ? "full"
                : readString(readJsonObject(hints.capability_profile)?.roadmap_detail) === "detailed"
                  ? "detailed"
                  : "standard",
            executiveBriefingEligible:
              readJsonObject(hints.capability_profile)?.executive_briefing_eligible === true,
            monitoringAddOnEligible:
              readJsonObject(hints.capability_profile)?.monitoring_add_on_eligible === true,
            addOnEligible: readJsonObject(hints.capability_profile)?.add_on_eligible === true,
            immutable: true
          }
        : undefined
  });
  const existingJob = await db.analysisJob.findFirst({
    where: {
      jobType: "assessment_analysis",
      inputPayload: {
        path: ["routingSnapshotId"],
        equals: snapshot.id
      }
    },
    include: {
      assessment: {
        select: {
          organizationId: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  const job =
    existingJob ??
    (await db.analysisJob.create({
      data: {
        assessmentId: assessment.id,
        provider: "openai_langgraph",
        status: JobStatus.QUEUED,
        jobType: "assessment_analysis",
        contractVersion: AI_ANALYSIS_CONTRACT_VERSION,
        workflowVersion: AI_ANALYSIS_CONTRACT_VERSION,
        inputPayload: toJsonValue(payload)
      },
      include: {
        assessment: {
          select: {
            organizationId: true,
            name: true
          }
        }
      }
    }));

  await db.routingSnapshot.update({
    where: { id: snapshot.id },
    data: { status: RoutingSnapshotStatus.STATUS_UPDATED }
  });
  await recordAuditLifecycleTransition({
    db,
    organizationId,
    assessmentId: assessment.id,
    toStatus: "intake_complete",
    actorType: "SYSTEM",
    actorLabel: "ai-execution",
    reasonCode: "intake.ready_for_execution",
    evidence: {
      intakeComplete: readiness.readyForAudit
    },
    metadata: {
      source: "runAuditExecution"
    }
  });
  await recordAuditLifecycleTransition({
    db,
    organizationId,
    assessmentId: assessment.id,
    toStatus: "routing_complete",
    actorType: "SYSTEM",
    actorLabel: "ai-execution",
    reasonCode: "routing.snapshot.ready",
    linkages: {
      routingSnapshotId: snapshot.id,
      workflowDispatchId: workflowDispatch.id
    },
    evidence: {
      routingSnapshotId: snapshot.id
    },
    metadata: {
      workflowCode,
      source: "runAuditExecution"
    }
  });
  await recordAuditLifecycleTransition({
    db,
    organizationId,
    assessmentId: assessment.id,
    toStatus: "analysis_pending",
    actorType: "SYSTEM",
    actorLabel: "ai-execution",
    reasonCode: "analysis.job.queued",
    linkages: {
      routingSnapshotId: snapshot.id,
      workflowDispatchId: workflowDispatch.id
    },
    evidence: {
      analysisJobId: job.id
    },
    metadata: {
      analysisJobId: job.id,
      workflowCode
    }
  });

  const result = await runAnalysisJobFn(job, {
    db,
    payload
  });

  if (result.status === "completed") {
    const normalizedOutput = normalizeAuditExecutionOutput(result.result);
    await db.routingSnapshot.update({
      where: { id: snapshot.id },
      data: { status: RoutingSnapshotStatus.REPORT_READY }
    });
    await db.deliveryStateRecord.updateMany({
      where: { routingSnapshotId: snapshot.id },
      data: {
        status: DeliveryStateStatus.REPORT_GENERATED,
        reportGeneratedAt: now,
        latestExecutionResultJson: toGenericJsonValue({
          status: "analysis_complete",
          normalizedOutput,
          analysisCompletedAt: now.toISOString()
        })
      }
    });
  } else if (result.status === "failed") {
    await db.deliveryStateRecord.updateMany({
      where: { routingSnapshotId: snapshot.id },
      data: {
        status: DeliveryStateStatus.AWAITING_REVIEW,
        awaitingReviewAt: now,
        lastError: result.safeError,
        latestExecutionResultJson: toGenericJsonValue({
          status: "failed_review_required",
          failureReason: result.safeError,
          analysisFailedAt: now.toISOString()
        })
      }
    });
    await recordAuditLifecycleTransition({
      db,
      organizationId,
      assessmentId: assessment.id,
      toStatus: "failed_review_required",
      actorType: "SYSTEM",
      actorLabel: "ai-execution",
      reasonCode: "analysis.failed_review_required",
      linkages: {
        routingSnapshotId: snapshot.id,
        workflowDispatchId: workflowDispatch.id
      },
      evidence: {
        failureReason: result.safeError
      },
      metadata: {
        analysisJobId: job.id
      }
    });
  }

  return {
    ...result,
    routingSnapshotId: snapshot.id,
    workflowCode,
    workflowDispatchId: workflowDispatch.id,
    analysisJobId: job.id
  };
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
