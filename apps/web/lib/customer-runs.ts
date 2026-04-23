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
import { dispatchQueuedAssessmentAnalysisJobs, getDifyWorkflowVersion } from "./dify";
import { requireRecordInOrganization } from "./scoped-access";
import { dispatchPendingWebhookDeliveries } from "./webhook-dispatcher";

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
      return "Requeue the analysis job after confirming the assessment intake is complete and Dify is reachable.";
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
        extras?.contextJson === undefined
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

  return updateRunSteps(db, run.id, (currentSteps) => {
    return applyQueuedForAnalysisToSteps(currentSteps);
  });
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

  return updateRunSteps(db, run.id, (currentSteps) => {
    return applyAnalysisFailureToSteps(currentSteps, errorMessage);
  });
}

export async function markCustomerRunAnalysisCompleted(
  assessmentId: string,
  db: CustomerRunDbClient = prisma
) {
  const run = await findRunByAssessmentId(db, assessmentId);
  if (!run) {
    return null;
  }

  return updateRunSteps(db, run.id, (currentSteps) => {
    return applyAnalysisCompletedToSteps(currentSteps);
  });
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
      reportId: input.reportId
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

  return updateRunSteps(db, run.id, (currentSteps) =>
    applyReportGenerationFailureToSteps(currentSteps, input.errorMessage)
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
            provider: "dify",
            status: JobStatus.QUEUED,
            jobType: "assessment_analysis",
            contractVersion: "assessment-analysis.v1",
            workflowVersion: getDifyWorkflowVersion(),
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

    await dispatchQueuedAssessmentAnalysisJobs({ limit: 1 });

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
