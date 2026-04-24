import {
  AssessmentStatus,
  CustomerRunStep,
  CustomerRunStatus,
  DomainEventStatus,
  JobStatus,
  Prisma,
  ReportStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import { requireRecordInOrganization } from "./scoped-access";
import { dispatchPendingWebhookDeliveries } from "./webhook-dispatcher";
import { getAiExecutionProvider } from "./runtime-config";

type CustomerRunDbClient = Prisma.TransactionClient | typeof prisma;

export type CustomerRunStepKey =
  | "intake"
  | "analysis"
  | "reportGeneration"
  | "crmSync"
  | "delivery";

export type CustomerRunStepStatus = "pending" | "running" | "completed" | "failed";

export type CustomerRunStepState = {
  status: CustomerRunStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
};

export type CustomerRunSteps = Record<CustomerRunStepKey, CustomerRunStepState>;

export type AuditWorkflowProgressState =
  | "queued"
  | "preparing_context"
  | "mapping_frameworks"
  | "analyzing_risks"
  | "scoring_risk"
  | "building_roadmap"
  | "generating_report"
  | "pending_review"
  | "completed"
  | "failed";

export type AuditWorkflowProgress = {
  status: AuditWorkflowProgressState;
  workflowDispatchId: string | null;
  dispatchId: string | null;
  label: string;
  description: string;
  progressPercent: number;
  updatedAt: string;
};

export type AuditWorkflowProgressPresentation = {
  label: string;
  description: string;
  progressPercent: number;
  nextStep: string;
  eta: string;
};

const AUDIT_WORKFLOW_PROGRESS_PRESENTATION: Record<
  AuditWorkflowProgressState,
  AuditWorkflowProgressPresentation
> = {
  queued: {
    label: "Queued",
    description:
      "Your audit has been accepted and is waiting for a secure backend worker to begin processing.",
    progressPercent: 5,
    nextStep: "Prepare the company context for the audit run.",
    eta: "Starting soon"
  },
  preparing_context: {
    label: "Preparing Context",
    description:
      "We are assembling business context and intake signals before mapping controls and findings.",
    progressPercent: 18,
    nextStep: "Map your business context to the right frameworks.",
    eta: "Usually 1-2 minutes"
  },
  mapping_frameworks: {
    label: "Mapping Frameworks",
    description:
      "The workflow is aligning your assessment with the most relevant security and compliance frameworks.",
    progressPercent: 34,
    nextStep: "Analyze governance, security, and compliance risks.",
    eta: "Usually 2-4 minutes"
  },
  analyzing_risks: {
    label: "Analyzing Risks",
    description:
      "We are reviewing governance, access, vendor, AI, and data-handling gaps across the validated workflow state.",
    progressPercent: 52,
    nextStep: "Calculate the deterministic risk score.",
    eta: "Usually 4-7 minutes"
  },
  scoring_risk: {
    label: "Scoring Risk",
    description:
      "The workflow is applying the backend-controlled scoring rules to the validated findings set.",
    progressPercent: 66,
    nextStep: "Build the prioritized 30/60/90 day roadmap.",
    eta: "Usually 6-9 minutes"
  },
  building_roadmap: {
    label: "Building Roadmap",
    description:
      "We are organizing remediation actions into an executive-ready roadmap with ownership and timing guidance.",
    progressPercent: 80,
    nextStep: "Assemble the final executive report.",
    eta: "Usually 8-11 minutes"
  },
  generating_report: {
    label: "Generating Report",
    description:
      "The final report is being assembled from validated workflow outputs for delivery-quality rendering.",
    progressPercent: 92,
    nextStep: "Hand off the report for internal review.",
    eta: "Almost ready"
  },
  pending_review: {
    label: "Pending Review",
    description:
      "The report draft is ready and is now waiting for internal quality review before client delivery.",
    progressPercent: 97,
    nextStep: "Internal reviewer approval.",
    eta: "Awaiting review"
  },
  completed: {
    label: "Completed",
    description:
      "The workflow has completed successfully and the validated report is available in the app.",
    progressPercent: 100,
    nextStep: "Review or deliver the report.",
    eta: "Ready now"
  },
  failed: {
    label: "Needs Attention",
    description:
      "The workflow stopped safely before delivery. Internal teams can inspect the trace and replay it if needed.",
    progressPercent: 100,
    nextStep: "Operator review and safe replay if appropriate.",
    eta: "Blocked pending review"
  }
};

const STEP_SEQUENCE: Array<{
  key: CustomerRunStepKey;
  value: CustomerRunStep;
}> = [
  { key: "intake", value: CustomerRunStep.INTAKE },
  { key: "analysis", value: CustomerRunStep.ANALYSIS },
  { key: "reportGeneration", value: CustomerRunStep.REPORT_GENERATION },
  { key: "crmSync", value: CustomerRunStep.CRM_SYNC },
  { key: "delivery", value: CustomerRunStep.DELIVERY }
];

function toIsoString(date: Date) {
  return date.toISOString();
}

function readContextObject(
  value: Prisma.JsonValue | null | undefined
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

export function getAuditWorkflowProgressPresentation(
  status: AuditWorkflowProgressState
) {
  return AUDIT_WORKFLOW_PROGRESS_PRESENTATION[status];
}

export function buildAuditWorkflowProgress(input: {
  status: AuditWorkflowProgressState;
  workflowDispatchId?: string | null;
  dispatchId?: string | null;
  updatedAt?: Date;
}): AuditWorkflowProgress {
  const presentation = getAuditWorkflowProgressPresentation(input.status);

  return {
    status: input.status,
    workflowDispatchId: input.workflowDispatchId ?? null,
    dispatchId: input.dispatchId ?? null,
    label: presentation.label,
    description: presentation.description,
    progressPercent: presentation.progressPercent,
    updatedAt: toIsoString(input.updatedAt ?? new Date())
  };
}

export function parseAuditWorkflowProgress(value: unknown): AuditWorkflowProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = record.status;

  if (
    status !== "queued" &&
    status !== "preparing_context" &&
    status !== "mapping_frameworks" &&
    status !== "analyzing_risks" &&
    status !== "scoring_risk" &&
    status !== "building_roadmap" &&
    status !== "generating_report" &&
    status !== "pending_review" &&
    status !== "completed" &&
    status !== "failed"
  ) {
    return null;
  }

  const presentation = getAuditWorkflowProgressPresentation(status);

  return {
    status,
    workflowDispatchId:
      typeof record.workflowDispatchId === "string" ? record.workflowDispatchId : null,
    dispatchId: typeof record.dispatchId === "string" ? record.dispatchId : null,
    label: typeof record.label === "string" ? record.label : presentation.label,
    description:
      typeof record.description === "string"
        ? record.description
        : presentation.description,
    progressPercent:
      typeof record.progressPercent === "number" &&
      Number.isFinite(record.progressPercent)
        ? Math.max(0, Math.min(100, record.progressPercent))
        : presentation.progressPercent,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : toIsoString(new Date())
  };
}

function mergeWorkflowProgressIntoContext(
  contextJson: Prisma.JsonValue | null | undefined,
  progress: AuditWorkflowProgress
) {
  const context = readContextObject(contextJson);

  return {
    ...context,
    workflowProgress: progress
  } satisfies Prisma.InputJsonValue;
}

export function createInitialCustomerRunSteps(startedAt = new Date()): CustomerRunSteps {
  const startedAtIso = toIsoString(startedAt);

  return {
    intake: {
      status: "running",
      startedAt: startedAtIso,
      completedAt: null,
      error: null
    },
    analysis: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null
    },
    reportGeneration: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null
    },
    crmSync: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null
    },
    delivery: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null
    }
  };
}

function cloneSteps(steps: CustomerRunSteps): CustomerRunSteps {
  return JSON.parse(JSON.stringify(steps)) as CustomerRunSteps;
}

function clearFutureSteps(steps: CustomerRunSteps, currentKey: CustomerRunStepKey) {
  let reset = false;

  for (const step of STEP_SEQUENCE) {
    if (step.key === currentKey) {
      reset = true;
      continue;
    }

    if (!reset) {
      continue;
    }

    steps[step.key] = {
      status: "pending",
      startedAt: null,
      completedAt: null,
      error: null
    };
  }

  return steps;
}

function markStepCompleted(
  steps: CustomerRunSteps,
  key: CustomerRunStepKey,
  at = new Date()
) {
  steps[key] = {
    status: "completed",
    startedAt: steps[key].startedAt ?? toIsoString(at),
    completedAt: toIsoString(at),
    error: null
  };

  return steps;
}

function markStepRunning(steps: CustomerRunSteps, key: CustomerRunStepKey, at = new Date()) {
  steps[key] = {
    status: "running",
    startedAt: steps[key].startedAt ?? toIsoString(at),
    completedAt: null,
    error: null
  };

  return steps;
}

function markStepFailed(
  steps: CustomerRunSteps,
  key: CustomerRunStepKey,
  error: string,
  at = new Date()
) {
  steps[key] = {
    status: "failed",
    startedAt: steps[key].startedAt ?? toIsoString(at),
    completedAt: null,
    error
  };

  return steps;
}

export function applyQueuedForAnalysisToSteps(currentSteps: CustomerRunSteps) {
  const steps = cloneSteps(currentSteps);
  markStepCompleted(steps, "intake");
  markStepRunning(steps, "analysis");
  clearFutureSteps(steps, "analysis");
  return steps;
}

export function applyAnalysisFailureToSteps(
  currentSteps: CustomerRunSteps,
  errorMessage: string
) {
  const steps = cloneSteps(currentSteps);
  markStepFailed(steps, "analysis", errorMessage);
  clearFutureSteps(steps, "analysis");
  return steps;
}

export function applyAnalysisCompletedToSteps(currentSteps: CustomerRunSteps) {
  const steps = cloneSteps(currentSteps);
  markStepCompleted(steps, "analysis");
  markStepRunning(steps, "reportGeneration");
  clearFutureSteps(steps, "reportGeneration");
  return steps;
}

export function applyReportGeneratedToSteps(currentSteps: CustomerRunSteps) {
  const steps = cloneSteps(currentSteps);
  if (steps.analysis.status !== "completed") {
    markStepCompleted(steps, "analysis");
  }
  markStepCompleted(steps, "reportGeneration");
  markStepRunning(steps, "crmSync");
  clearFutureSteps(steps, "crmSync");
  return steps;
}

export function applyReportGenerationFailureToSteps(
  currentSteps: CustomerRunSteps,
  errorMessage: string
) {
  const steps = cloneSteps(currentSteps);
  if (steps.analysis.status !== "completed") {
    markStepCompleted(steps, "analysis");
  }
  markStepFailed(steps, "reportGeneration", errorMessage);
  clearFutureSteps(steps, "reportGeneration");
  return steps;
}

export function applyCrmSyncResultToSteps(
  currentSteps: CustomerRunSteps,
  delivered: boolean,
  errorMessage?: string | null
) {
  const steps = cloneSteps(currentSteps);
  if (delivered) {
    markStepCompleted(steps, "crmSync");
    if (steps.delivery.status === "pending") {
      markStepRunning(steps, "delivery");
    }
  } else {
    markStepFailed(steps, "crmSync", errorMessage ?? "CRM sync failed.");
    clearFutureSteps(steps, "crmSync");
  }

  return steps;
}

export function applyDeliveryCompletedToSteps(currentSteps: CustomerRunSteps) {
  const steps = cloneSteps(currentSteps);
  if (steps.crmSync.status === "pending") {
    markStepRunning(steps, "crmSync");
  }
  markStepCompleted(steps, "delivery");
  return steps;
}

function getRecoveryHint(step: CustomerRunStepKey) {
  switch (step) {
    case "analysis":
      return "Requeue the analysis job after confirming the assessment intake is complete and the OpenAI/LangGraph provider is configured.";
    case "crmSync":
      return "Retry the HubSpot delivery for the report-generated event after confirming CRM credentials and custom properties are configured.";
    case "reportGeneration":
      return "Review the underlying assessment and analysis result before regenerating the report.";
    case "delivery":
      return "Re-run delivery after confirming the report is ready and the intended recipient path is available.";
    case "intake":
    default:
      return "Review the intake data and resume the workflow from the workspace.";
  }
}

export function summarizeCustomerRun(steps: CustomerRunSteps): {
  status: CustomerRunStatus;
  currentStep: CustomerRunStep;
  recoveryHint: string | null;
  lastError: string | null;
  completedAt: Date | null;
} {
  for (const step of STEP_SEQUENCE) {
    if (steps[step.key].status === "failed") {
      return {
        status: CustomerRunStatus.ACTION_REQUIRED,
        currentStep: step.value,
        recoveryHint: getRecoveryHint(step.key),
        lastError: steps[step.key].error,
        completedAt: null
      };
    }
  }

  const pendingOrRunningStep =
    STEP_SEQUENCE.find((step) => steps[step.key].status === "running") ??
    STEP_SEQUENCE.find((step) => steps[step.key].status === "pending");

  if (pendingOrRunningStep) {
    return {
      status:
        pendingOrRunningStep.key === "intake" &&
        steps.intake.status === "pending"
          ? CustomerRunStatus.PENDING
          : CustomerRunStatus.RUNNING,
      currentStep: pendingOrRunningStep.value,
      recoveryHint: null,
      lastError: null,
      completedAt: null
    };
  }

  const completedAtIso = steps.delivery.completedAt ?? steps.crmSync.completedAt;

  return {
    status: CustomerRunStatus.COMPLETED,
    currentStep: CustomerRunStep.DELIVERY,
    recoveryHint: null,
    lastError: null,
    completedAt: completedAtIso ? new Date(completedAtIso) : new Date()
  };
}

function parseStepsJson(value: Prisma.JsonValue): CustomerRunSteps {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createInitialCustomerRunSteps();
  }

  const parsed = value as Partial<Record<CustomerRunStepKey, Partial<CustomerRunStepState>>>;
  const base = createInitialCustomerRunSteps();

  for (const step of STEP_SEQUENCE) {
    const current = parsed[step.key];
    if (!current) {
      continue;
    }

    base[step.key] = {
      status:
        current.status === "pending" ||
        current.status === "running" ||
        current.status === "completed" ||
        current.status === "failed"
          ? current.status
          : base[step.key].status,
      startedAt: typeof current.startedAt === "string" ? current.startedAt : base[step.key].startedAt,
      completedAt:
        typeof current.completedAt === "string" ? current.completedAt : base[step.key].completedAt,
      error: typeof current.error === "string" ? current.error : null
    };
  }

  return base;
}

async function updateRunSteps(
  db: CustomerRunDbClient,
  runId: string,
  mutate: (steps: CustomerRunSteps) => CustomerRunSteps,
  extras?: {
    reportId?: string | null;
    contextJson?: Prisma.InputJsonValue;
    mergeContextJson?: (
      existingContext: Prisma.JsonValue | null
    ) => Prisma.InputJsonValue;
    retryIncrement?: boolean;
    recoveryNote?: string | null;
  }
) {
  const existingRun = await db.customerRun.findUnique({
    where: { id: runId }
  });

  if (!existingRun) {
    return null;
  }

  const steps = mutate(parseStepsJson(existingRun.stepsJson));
  const summary = summarizeCustomerRun(steps);

  return db.customerRun.update({
    where: { id: runId },
    data: {
      reportId: extras?.reportId === undefined ? existingRun.reportId : extras.reportId,
      stepsJson: steps,
      contextJson:
        extras?.mergeContextJson
          ? extras.mergeContextJson(existingRun.contextJson)
          : extras?.contextJson === undefined
            ? existingRun.contextJson ?? Prisma.JsonNull
            : extras.contextJson,
      status: summary.status,
      currentStep: summary.currentStep,
      recoveryHint: summary.recoveryHint,
      lastError: summary.lastError,
      completedAt: summary.completedAt,
      retryCount: extras?.retryIncrement ? { increment: 1 } : undefined,
      lastRecoveredAt: extras?.retryIncrement ? new Date() : undefined,
      lastRecoveryNote: extras?.recoveryNote ?? undefined
    }
  });
}

async function findRunByAssessmentId(db: CustomerRunDbClient, assessmentId: string) {
  return db.customerRun.findFirst({
    where: { assessmentId },
    orderBy: { createdAt: "desc" }
  });
}

async function findRunByReportId(db: CustomerRunDbClient, reportId: string) {
  return db.customerRun.findFirst({
    where: { reportId },
    orderBy: { createdAt: "desc" }
  });
}

export async function createCustomerRunForAssessment(input: {
  db?: CustomerRunDbClient;
  organizationId: string;
  initiatedByUserId?: string | null;
  assessmentId: string;
  source: string;
  contextJson?: Prisma.InputJsonValue;
}) {
  const db = input.db ?? prisma;
  const startedAt = new Date();
  const steps = createInitialCustomerRunSteps(startedAt);
  const summary = summarizeCustomerRun(steps);

  return db.customerRun.upsert({
    where: {
      idempotencyKey: `customer-run:assessment:${input.assessmentId}`
    },
    update: {
      organizationId: input.organizationId,
      initiatedByUserId: input.initiatedByUserId ?? null,
      source: input.source,
      contextJson: input.contextJson ?? undefined
    },
    create: {
      organizationId: input.organizationId,
      initiatedByUserId: input.initiatedByUserId ?? null,
      assessmentId: input.assessmentId,
      runType: "assessment_report_delivery",
      source: input.source,
      idempotencyKey: `customer-run:assessment:${input.assessmentId}`,
      status: summary.status,
      currentStep: summary.currentStep,
      stepsJson: steps,
      contextJson: input.contextJson ?? undefined,
      startedAt
    }
  });
}

export async function markCustomerRunQueuedForAnalysis(
  assessmentId: string,
  db: CustomerRunDbClient = prisma
) {
  const run = await findRunByAssessmentId(db, assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => applyQueuedForAnalysisToSteps(currentSteps),
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: "queued"
          })
        )
    }
  );
}

export async function markCustomerRunAnalysisFailed(
  assessmentId: string,
  errorMessage: string,
  db: CustomerRunDbClient = prisma
) {
  const run = await findRunByAssessmentId(db, assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => applyAnalysisFailureToSteps(currentSteps, errorMessage),
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: "failed"
          })
        )
    }
  );
}

export async function markCustomerRunAnalysisCompleted(
  assessmentId: string,
  db: CustomerRunDbClient = prisma
) {
  const run = await findRunByAssessmentId(db, assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => applyAnalysisCompletedToSteps(currentSteps),
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: "completed"
          })
        )
    }
  );
}

export async function markCustomerRunWorkflowProgress(input: {
  assessmentId: string;
  status: AuditWorkflowProgressState;
  workflowDispatchId?: string | null;
  dispatchId?: string | null;
  db?: CustomerRunDbClient;
}) {
  const db = input.db ?? prisma;
  const run = await findRunByAssessmentId(db, input.assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => currentSteps,
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: input.status,
            workflowDispatchId: input.workflowDispatchId,
            dispatchId: input.dispatchId
          })
        )
    }
  );
}

export async function markCustomerRunWorkflowProgressByReport(input: {
  reportId: string;
  status: AuditWorkflowProgressState;
  workflowDispatchId?: string | null;
  dispatchId?: string | null;
  db?: CustomerRunDbClient;
}) {
  const db = input.db ?? prisma;
  const run = await findRunByReportId(db, input.reportId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => currentSteps,
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: input.status,
            workflowDispatchId: input.workflowDispatchId,
            dispatchId: input.dispatchId
          })
        )
    }
  );
}

export async function markCustomerRunReportGenerated(input: {
  assessmentId: string;
  reportId: string;
  db?: CustomerRunDbClient;
}) {
  const db = input.db ?? prisma;
  const run = await findRunByAssessmentId(db, input.assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) => applyReportGeneratedToSteps(currentSteps),
    {
      reportId: input.reportId,
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: "pending_review"
          })
        )
    }
  );
}

export async function markCustomerRunReportGenerationFailed(input: {
  assessmentId: string;
  errorMessage: string;
  db?: CustomerRunDbClient;
}) {
  const db = input.db ?? prisma;
  const run = await findRunByAssessmentId(db, input.assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(
    db,
    run.id,
    (currentSteps) =>
      applyReportGenerationFailureToSteps(currentSteps, input.errorMessage),
    {
      mergeContextJson: (existingContext) =>
        mergeWorkflowProgressIntoContext(
          existingContext,
          buildAuditWorkflowProgress({
            status: "failed"
          })
        )
    }
  );
}

export async function markCustomerRunCrmSyncResult(input: {
  reportId: string;
  delivered: boolean;
  errorMessage?: string | null;
  db?: CustomerRunDbClient;
}) {
  const db = input.db ?? prisma;
  const run = await findRunByReportId(db, input.reportId);
  if (!run) {
    return null;
  }

  return updateRunSteps(db, run.id, (currentSteps) => {
    return applyCrmSyncResultToSteps(
      currentSteps,
      input.delivered,
      input.errorMessage
    );
  });
}

export async function markCustomerRunDelivered(
  reportId: string,
  db: CustomerRunDbClient = prisma
) {
  const run = await findRunByReportId(db, reportId);
  if (!run) {
    return null;
  }

  return updateRunSteps(db, run.id, (currentSteps) => {
    return applyDeliveryCompletedToSteps(currentSteps);
  });
}

export async function getOrganizationCustomerRuns(
  organizationId: string,
  options?: {
    limit?: number;
    db?: CustomerRunDbClient;
  }
) {
  const db = options?.db ?? prisma;

  return db.customerRun.findMany({
    where: { organizationId },
    include: {
      assessment: {
        select: {
          id: true,
          name: true,
          status: true
        }
      },
      report: {
        select: {
          id: true,
          title: true,
          status: true,
          deliveredAt: true
        }
      },
      initiatedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 10
  });
}

export async function retryCustomerRun(
  runId: string,
  input: {
    organizationId: string;
    actorEmail: string;
    reason?: string | null;
  }
) {
  const run = await requireRecordInOrganization({
    recordId: runId,
    organizationId: input.organizationId,
    entityLabel: "Customer run",
    load: ({ recordId, organizationId }) =>
      prisma.customerRun.findFirst({
        where: {
          id: recordId,
          organizationId
        },
        include: {
          assessment: {
            include: {
              analysisJobs: {
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          },
          report: true
        }
      })
  });

  const steps = parseStepsJson(run.stepsJson);
  const failedStep =
    STEP_SEQUENCE.find((step) => steps[step.key].status === "failed")?.key ?? null;

  if (!failedStep) {
    throw new Error("This customer run does not currently need recovery.");
  }

  if (failedStep === "analysis") {
    if (!run.assessmentId) {
      throw new Error("Analysis recovery requires an assessment.");
    }
    const assessmentId = run.assessmentId;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const latestJob = await tx.analysisJob.findFirst({
        where: { assessmentId },
        orderBy: { createdAt: "desc" }
      });

      if (latestJob) {
        await tx.analysisJob.update({
          where: { id: latestJob.id },
          data: {
            status: JobStatus.QUEUED,
            errorMessage: null,
            completedAt: null,
            startedAt: null
          }
        });
      } else {
        await tx.analysisJob.create({
          data: {
            assessmentId,
            provider: getAiExecutionProvider(),
            status: JobStatus.QUEUED,
            jobType: "assessment_analysis",
            contractVersion: "assessment-analysis.v2",
            workflowVersion: (
              await import("./ai-execution")
            ).getAiExecutionWorkflowVersion(),
            inputPayload: {
              assessmentId,
              organizationId: run.organizationId
            }
          }
        });
      }

      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          status: AssessmentStatus.ANALYSIS_QUEUED
        }
      });

      await updateRunSteps(
        tx,
        run.id,
        (currentSteps) => {
          const nextSteps = cloneSteps(currentSteps);
          nextSteps.analysis = {
            status: "running",
            startedAt: toIsoString(new Date()),
            completedAt: null,
            error: null
          };
          clearFutureSteps(nextSteps, "analysis");
          return nextSteps;
        },
        {
          retryIncrement: true,
          recoveryNote:
            input.reason?.trim()
              ? `Analysis recovery requested by ${input.actorEmail}: ${input.reason.trim()}`
              : `Analysis recovery requested by ${input.actorEmail}.`
        }
      );
    });

    await (await import("./ai-execution")).dispatchQueuedAssessmentAnalysisJobs({
      limit: 1
    });

    return {
      runId: run.id,
      recoveredStep: failedStep
    };
  }

  if (failedStep === "crmSync") {
    if (!run.reportId) {
      throw new Error("CRM recovery requires a generated report.");
    }
    const reportId = run.reportId;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const relatedEvents = await tx.domainEvent.findMany({
        where: {
          aggregateType: "report",
          aggregateId: reportId,
          type: {
            in: ["report.generated", "report.delivered"]
          }
        },
        select: { id: true }
      });

      if (relatedEvents.length === 0) {
        throw new Error("No report lifecycle events were found for CRM recovery.");
      }

      await tx.webhookDelivery.updateMany({
        where: {
          eventId: {
            in: relatedEvents.map((event: { id: string }) => event.id)
          },
          destination: "hubspot-crm",
          status: {
            in: [WebhookDeliveryStatus.FAILED, WebhookDeliveryStatus.RETRYING, WebhookDeliveryStatus.PENDING]
          }
        },
        data: {
          status: WebhookDeliveryStatus.RETRYING,
          nextRetryAt: null,
          lastError: null
        }
      });

      await tx.domainEvent.updateMany({
        where: {
          id: {
            in: relatedEvents.map((event: { id: string }) => event.id)
          }
        },
        data: {
          status: DomainEventStatus.PENDING
        }
      });

      await updateRunSteps(
        tx,
        run.id,
        (currentSteps) => {
          const nextSteps = cloneSteps(currentSteps);
          nextSteps.crmSync = {
            status: "running",
            startedAt: nextSteps.crmSync.startedAt ?? toIsoString(new Date()),
            completedAt: null,
            error: null
          };
          return nextSteps;
        },
        {
          retryIncrement: true,
          recoveryNote:
            input.reason?.trim()
              ? `CRM recovery requested by ${input.actorEmail}: ${input.reason.trim()}`
              : `CRM recovery requested by ${input.actorEmail}.`
        }
      );
    });

    await dispatchPendingWebhookDeliveries({ limit: 10 });

    return {
      runId: run.id,
      recoveredStep: failedStep
    };
  }

  throw new Error("Manual recovery is only implemented for analysis and CRM sync failures.");
}
