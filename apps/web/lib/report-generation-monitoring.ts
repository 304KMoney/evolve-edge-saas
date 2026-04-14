import { logServerEvent } from "./monitoring";

export type ReportGenerationFailureStage =
  | "routing"
  | "persistence"
  | "downstream_sync";

export type ReportGenerationFailureClassification =
  | "report_generation.routing_failed"
  | "report_generation.persistence_failed"
  | "report_generation.downstream_sync_failed";

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error";
}

export function getReportGenerationFailureClassification(
  stage: ReportGenerationFailureStage
): ReportGenerationFailureClassification {
  switch (stage) {
    case "routing":
      return "report_generation.routing_failed";
    case "downstream_sync":
      return "report_generation.downstream_sync_failed";
    case "persistence":
    default:
      return "report_generation.persistence_failed";
  }
}

export function logReportGenerationValidationFallback(input: {
  organizationId: string;
  userId: string;
  assessmentId: string;
  analysisJobId: string | null;
  requestContext?: unknown;
}) {
  logServerEvent("warn", "report.generate.validation_fallback", {
    org_id: input.organizationId,
    user_id: input.userId,
    resource_id: input.assessmentId,
    status: "fallback",
    source: "report.generate",
    requestContext: input.requestContext ?? undefined,
    metadata: {
      assessmentId: input.assessmentId,
      analysisJobId: input.analysisJobId,
      classification: "report_generation.validation_fallback"
    }
  });
}

export function logReportGenerationFailure(input: {
  organizationId: string;
  userId: string;
  assessmentId: string;
  reportId?: string | null;
  routingDecisionId?: string | null;
  workflowCode?: string | null;
  stage: ReportGenerationFailureStage;
  requestContext?: unknown;
  error: unknown;
}) {
  logServerEvent("error", "report.generate.failed", {
    org_id: input.organizationId,
    user_id: input.userId,
    resource_id: input.reportId ?? input.assessmentId,
    routing_snapshot_id: input.routingDecisionId ?? null,
    workflow_code: input.workflowCode ?? null,
    status: "failed",
    source: "report.generate",
    requestContext: input.requestContext ?? undefined,
    metadata: {
      assessmentId: input.assessmentId,
      reportId: input.reportId ?? null,
      routingDecisionId: input.routingDecisionId ?? null,
      classification: getReportGenerationFailureClassification(input.stage),
      stage: input.stage,
      message: normalizeErrorMessage(input.error)
    }
  });
}
