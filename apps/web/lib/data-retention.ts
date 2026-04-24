import {
  AssessmentStatus,
  JobStatus,
  Prisma,
  ReportStatus,
  prisma,
} from "@evolve-edge/db";
import {
  getAssessmentRetentionDays,
  getAuditLogRetentionDays,
  getReportRetentionDays,
  getWorkflowTraceRetentionDays,
} from "./runtime-config";
import { clearWorkflowTracesOlderThan } from "../src/server/ai/observability/workflow-tracker";

type RetentionDbClient = Pick<
  typeof prisma,
  "report" | "assessment" | "auditLog" | "auditWorkflowCheckpoint" | "analysisJob"
>;

export type RetentionPolicy = {
  reportsDays: number;
  assessmentsDays: number;
  auditLogsDays: number;
  workflowTracesDays: number;
};

export function getComplianceRetentionPolicy(): RetentionPolicy {
  return {
    reportsDays: getReportRetentionDays(),
    assessmentsDays: getAssessmentRetentionDays(),
    auditLogsDays: getAuditLogRetentionDays(),
    workflowTracesDays: getWorkflowTraceRetentionDays(),
  };
}

function getCutoff(days: number, now: Date) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function getComplianceRetentionCutoffs(
  policy: RetentionPolicy,
  now = new Date()
) {
  return {
    reportsBefore: getCutoff(policy.reportsDays, now),
    assessmentsBefore: getCutoff(policy.assessmentsDays, now),
    auditLogsBefore: getCutoff(policy.auditLogsDays, now),
    workflowTracesBefore: getCutoff(policy.workflowTracesDays, now),
  };
}

export async function cleanupExpiredComplianceData(input?: {
  db?: RetentionDbClient;
  now?: Date;
  policy?: RetentionPolicy;
}) {
  const db = input?.db ?? prisma;
  const policy = input?.policy ?? getComplianceRetentionPolicy();
  const cutoffs = getComplianceRetentionCutoffs(policy, input?.now);

  const [
    deletedReports,
    deletedAssessments,
    deletedAuditLogs,
    deletedCheckpoints,
    deletedAnalysisJobs,
  ] = await Promise.all([
    db.report.deleteMany({
      where: {
        createdAt: { lt: cutoffs.reportsBefore },
        status: {
          in: [ReportStatus.DELIVERED, ReportStatus.SUPERSEDED, ReportStatus.FAILED],
        },
      },
    }),
    db.assessment.deleteMany({
      where: {
        createdAt: { lt: cutoffs.assessmentsBefore },
        status: {
          in: [AssessmentStatus.ARCHIVED],
        },
      },
    }),
    db.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffs.auditLogsBefore },
      },
    }),
    db.auditWorkflowCheckpoint.deleteMany({
      where: {
        createdAt: { lt: cutoffs.workflowTracesBefore },
      },
    }),
    db.analysisJob.deleteMany({
      where: {
        createdAt: { lt: cutoffs.workflowTracesBefore },
        status: {
          in: [JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELED],
        },
      },
    }),
  ]);

  const clearedInMemoryTraces = clearWorkflowTracesOlderThan(cutoffs.workflowTracesBefore);

  return {
    policy,
    cutoffs: {
      reportsBefore: cutoffs.reportsBefore.toISOString(),
      assessmentsBefore: cutoffs.assessmentsBefore.toISOString(),
      auditLogsBefore: cutoffs.auditLogsBefore.toISOString(),
      workflowTracesBefore: cutoffs.workflowTracesBefore.toISOString(),
    } satisfies Prisma.InputJsonValue,
    deleted: {
      reports: deletedReports.count,
      assessments: deletedAssessments.count,
      auditLogs: deletedAuditLogs.count,
      workflowCheckpoints: deletedCheckpoints.count,
      analysisJobs: deletedAnalysisJobs.count,
      inMemoryWorkflowTraces: clearedInMemoryTraces,
    },
  };
}
