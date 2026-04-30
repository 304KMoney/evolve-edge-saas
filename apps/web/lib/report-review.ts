import {
  AssessmentStatus,
  JobStatus,
  Prisma,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  ReportStatus,
  prisma
} from "@evolve-edge/db";
import {
  AI_WORKFLOW_FEEDBACK_TYPES,
  recordAiWorkflowFeedback,
} from "../src/server/ai/feedback";
import { getAiExecutionProvider } from "./runtime-config";
import { markCustomerRunQueuedForAnalysis } from "./customer-runs";
import { requireRecordInOrganization } from "./scoped-access";
import { getOrganizationAuditReadiness } from "./audit-intake";

type ReportReviewDbClient = Prisma.TransactionClient | typeof prisma;

function createRegenerationDispatchKey(reportId: string) {
  const nonce = Date.now().toString(36);
  return `${reportId}-regen-${nonce}`;
}

export async function queueReportRegeneration(input: {
  reportId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ReportReviewDbClient;
}) {
  const db = input.db ?? prisma;
  const report = await requireRecordInOrganization({
    recordId: input.reportId,
    organizationId: input.organizationId,
    entityLabel: "Report",
    load: ({ recordId, organizationId }) =>
      db.report.findFirst({
        where: {
          id: recordId,
          organizationId
        },
        include: {
          assessment: true,
          latestInReportPackages: {
            take: 1
          }
        }
      })
  });

  const dispatchKey = createRegenerationDispatchKey(report.id);
  const latestPackage = report.latestInReportPackages[0] ?? null;
  const readiness = await getOrganizationAuditReadiness({
    organizationId: input.organizationId,
    db
  });

  if (!readiness.readyForAudit) {
    throw new Error(
      "Required onboarding intake must be completed before report regeneration."
    );
  }

  const queuedJob = await db.analysisJob.create({
    data: {
      assessmentId: report.assessmentId,
      provider: getAiExecutionProvider(),
      status: JobStatus.QUEUED,
      jobType: "assessment_analysis",
      contractVersion: "assessment-analysis.v2",
      workflowVersion: "langgraph-audit.v1",
      inputPayload: {
        workflowDispatchId: dispatchKey,
        dispatchId: dispatchKey,
        regenerationRequestedByUserId: input.actorUserId,
        regenerationRequestedFromReportId: report.id,
        regenerationReason: input.notes?.trim() || null
      }
    }
  });

  await db.assessment.update({
    where: { id: report.assessmentId },
    data: {
      status: AssessmentStatus.ANALYSIS_QUEUED
    }
  });

  await db.report.update({
    where: { id: report.id },
    data: {
      status: ReportStatus.REJECTED
    }
  });

  if (latestPackage) {
    await db.reportPackage.update({
      where: { id: latestPackage.id },
      data: {
        qaStatus: ReportPackageQaStatus.CHANGES_REQUESTED,
        deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
        qaNotes: input.notes?.trim() || latestPackage.qaNotes || null,
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId
      }
    });
  }

  await markCustomerRunQueuedForAnalysis(report.assessmentId, db);

  await recordAiWorkflowFeedback({
    db,
    workflowDispatchId: dispatchKey,
    organizationId: input.organizationId,
    reportId: report.id,
    feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.REGENERATED,
    notes: input.notes ?? null,
    metadata: {
      source: "report.regeneration_requested",
      previousWorkflowDispatchId:
        report.reportJson &&
        typeof report.reportJson === "object" &&
        !Array.isArray(report.reportJson) &&
        (report.reportJson as Record<string, unknown>).workflowMetadata &&
        typeof (report.reportJson as Record<string, unknown>).workflowMetadata === "object"
          ? ((report.reportJson as Record<string, unknown>).workflowMetadata as Record<string, unknown>).workflowDispatchId ?? null
          : null,
    }
  });

  return queuedJob;
}
