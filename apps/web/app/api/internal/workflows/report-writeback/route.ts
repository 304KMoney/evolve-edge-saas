import { prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest } from "../../../../../lib/audit";
import {
  buildTraceRequestContext,
  createTraceId,
  getIntakeEnvPresence,
  maybeAddTraceDebug,
  readTraceIdFromHeaders
} from "../../../../../lib/intake-observability";
import { logServerEvent, sendOperationalAlert } from "../../../../../lib/monitoring";
import { appendOperatorWorkflowEventRecord } from "../../../../../lib/operator-workflow-event-records";
import {
  markCustomerRunDelivered,
  markCustomerRunReportGenerated,
  markCustomerRunReportGenerationFailed
} from "../../../../../lib/customer-runs";
import {
  getReportRecordForWriteback,
  persistNormalizedReportWriteback
} from "../../../../../lib/report-records";
import { applyRouteRateLimit } from "../../../../../lib/security-rate-limit";
import { parseJsonRequestBody, ValidationError } from "../../../../../lib/security-validation";
import { validateWorkflowWritebackTargetBinding } from "../../../../../lib/workflow-writeback-target";
import { isAuthorizedWorkflowWritebackRequest } from "../../../../../lib/workflow-dispatch";
import {
  malformedWritebackPayloadError,
  persistenceWritebackError,
  toWorkflowWritebackErrorResponse,
  unauthorizedWritebackError,
  unknownWritebackTargetError,
  workflowWritebackDuplicateResponse,
  WorkflowWritebackRouteError
} from "../../../../../lib/workflow-writeback-errors";
import { parseWorkflowWritebackPayload } from "../../../../../lib/workflow-writeback";
import { resolveWorkflowWritebackCustomerRunReconciliation } from "../../../../../lib/workflow-writeback-reconciliation";
import {
  buildWorkflowWritebackStatusMarker,
  claimWorkflowWritebackReceipt
} from "../../../../../lib/workflow-writeback-receipts";

function inferOperatorEventCode(input: {
  reportStatus?: "received" | "processing" | "awaiting_review" | "ready" | "delivered" | "failed" | null;
  deliveryStatus?: "generated" | "reviewed" | "sent" | "briefing_booked" | "briefing_completed" | "failed" | null;
}) {
  if (input.reportStatus === "failed" || input.deliveryStatus === "failed") {
    return "delivery_failed" as const;
  }

  if (
    input.reportStatus === "delivered" ||
    input.deliveryStatus === "sent" ||
    input.deliveryStatus === "briefing_booked" ||
    input.deliveryStatus === "briefing_completed"
  ) {
    return "report_delivered" as const;
  }

  if (input.reportStatus === "ready") {
    return "report_ready" as const;
  }

  if (
    input.reportStatus === "received" ||
    input.reportStatus === "processing" ||
    input.reportStatus === "awaiting_review" ||
    input.deliveryStatus === "generated" ||
    input.deliveryStatus === "reviewed"
  ) {
    return "report_processing" as const;
  }

  return null;
}

function inferOperatorEventMessage(input: {
  reportStatus?: "received" | "processing" | "awaiting_review" | "ready" | "delivered" | "failed" | null;
  deliveryStatus?: "generated" | "reviewed" | "sent" | "briefing_booked" | "briefing_completed" | "failed" | null;
}) {
  if (input.reportStatus === "failed" || input.deliveryStatus === "failed") {
    return "Report delivery processing failed during workflow writeback.";
  }

  if (
    input.reportStatus === "delivered" ||
    input.deliveryStatus === "sent" ||
    input.deliveryStatus === "briefing_booked" ||
    input.deliveryStatus === "briefing_completed"
  ) {
    return "Report delivery progressed to a customer-facing delivered state.";
  }

  if (input.reportStatus === "ready") {
    return "Report output was marked ready by workflow writeback.";
  }

  if (
    input.reportStatus === "received" ||
    input.reportStatus === "processing" ||
    input.reportStatus === "awaiting_review" ||
    input.deliveryStatus === "generated" ||
    input.deliveryStatus === "reviewed"
  ) {
    return "Report processing advanced through workflow writeback.";
  }

  return null;
}

export async function POST(request: Request) {
  const route = "api.internal.workflows.report-writeback";
  const traceId = readTraceIdFromHeaders(request.headers) ?? createTraceId("workflow-callback");
  const requestContext = buildTraceRequestContext(
    buildAuditRequestContextFromRequest(request) as Record<string, unknown>,
    traceId,
    route
  );
  const envPresence = getIntakeEnvPresence();

  try {
    logServerEvent("info", "workflow.callback.report_writeback.request_received", {
      traceId,
      route,
      status: "received",
      source: "n8n.callback",
      metadata: envPresence,
      requestContext
    });

    const rateLimited = applyRouteRateLimit(request, {
      key: "internal-workflows-report-writeback",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedWorkflowWritebackRequest(request)) {
      logServerEvent("warn", "workflow.callback.report_writeback.auth_failed", {
        traceId,
        route,
        status: "unauthorized",
        source: "n8n.callback",
        metadata: envPresence,
        requestContext
      });
      return toWorkflowWritebackErrorResponse(unauthorizedWritebackError());
    }

    logServerEvent("info", "workflow.callback.report_writeback.auth_passed", {
      traceId,
      route,
      status: "authorized",
      source: "n8n.callback",
      metadata: envPresence,
      requestContext
    });

    const payload = parseWorkflowWritebackPayload(
      await parseJsonRequestBody(request)
    );

    logServerEvent("info", "workflow.callback.report_writeback.received", {
      traceId,
      route,
      dispatch_id: payload.dispatchId,
      correlation_id: payload.correlationId,
      source: "n8n.callback",
      requestContext,
      resource_id: payload.reportId ?? payload.reportReference,
      metadata: {
        reportStatus: payload.reportUpdate?.reportStatus ?? null,
        deliveryStatus: payload.deliveryUpdate?.deliveryStatus ?? null,
        hasArtifactUpdate: Boolean(payload.artifactUpdate),
        hasOperatorEvent: Boolean(payload.operatorEvent)
      }
    });

    let writebackTargetFailureReason: string | null = null;
    const updatedReport = await prisma.$transaction(async (tx) => {
      const reportCandidate = await getReportRecordForWriteback({
        db: tx,
        reportId: payload.reportId,
        reportReference: payload.reportReference
      });

      if (!reportCandidate) {
        writebackTargetFailureReason = "report_not_found";
        return null;
      }

      const targetBinding = await validateWorkflowWritebackTargetBinding({
        db: tx,
        dispatchId: payload.dispatchId,
        payloadOrganizationId: payload.organizationId,
        payloadReportReference: payload.reportReference,
        reportCandidate
      });

      if (!targetBinding.valid) {
        writebackTargetFailureReason = targetBinding.reason;
        return null;
      }

      const statusMarker = buildWorkflowWritebackStatusMarker({
        reportStatus: payload.reportUpdate?.reportStatus ?? null,
        deliveryStatus: payload.deliveryUpdate?.deliveryStatus ?? null,
        operatorEventCode: payload.operatorEvent?.eventCode ?? null,
        hasArtifactUpdate: Boolean(payload.artifactUpdate)
      });
      const receipt = await claimWorkflowWritebackReceipt({
        db: tx,
        correlationId: payload.correlationId,
        dispatchId: payload.dispatchId,
        reportId: reportCandidate.id,
        statusMarker
      });

      if (!receipt.claimed) {
        return {
          ...reportCandidate,
          deduplicated: true as const,
          statusMarker
        };
      }

      const report = await persistNormalizedReportWriteback({
        db: tx,
        reportId: reportCandidate.id,
        selectedPlan: payload.selectedPlan ?? undefined,
        reportStatus: payload.reportUpdate?.reportStatus ?? undefined,
        executiveSummary: payload.reportUpdate?.executiveSummary ?? undefined,
        overallRiskPosture: payload.reportUpdate?.overallRiskPosture ?? undefined,
        findings: payload.reportUpdate?.findings ?? undefined,
        gaps: payload.reportUpdate?.gaps ?? undefined,
        actions: payload.reportUpdate?.actions ?? undefined,
        roadmap: payload.reportUpdate?.roadmap ?? undefined,
        artifactUpdate: payload.artifactUpdate ?? undefined,
        deliveryUpdate: payload.deliveryUpdate ?? undefined
      });

      if (!report) {
        return null;
      }

      const reportStatus = payload.reportUpdate?.reportStatus ?? null;
      const deliveryStatus = payload.deliveryUpdate?.deliveryStatus ?? null;
      const customerRunReconciliation =
        resolveWorkflowWritebackCustomerRunReconciliation({
          reportStatus,
          deliveryStatus
        });

      if (typeof report.assessmentId === "string" && report.assessmentId.length > 0) {
        if (customerRunReconciliation.reportGenerationFailed) {
          await markCustomerRunReportGenerationFailed({
            assessmentId: report.assessmentId,
            errorMessage:
              payload.deliveryUpdate?.deliveryMessage ??
              payload.operatorEvent?.message ??
              "Workflow report generation failed.",
            db: tx
          });
        } else if (customerRunReconciliation.reportGenerated) {
          await markCustomerRunReportGenerated({
            assessmentId: report.assessmentId,
            reportId: report.id,
            db: tx
          });
        }
      }

      if (customerRunReconciliation.deliveryCompleted) {
        await markCustomerRunDelivered(report.id, tx);
      }

      const inferredEventCode = inferOperatorEventCode({
        reportStatus,
        deliveryStatus
      });
      const inferredEventMessage = inferOperatorEventMessage({
        reportStatus,
        deliveryStatus
      });

      if (inferredEventCode && inferredEventMessage) {
        await appendOperatorWorkflowEventRecord({
          db: tx,
          eventKey: `operator.writeback:${payload.dispatchId}:${report.id}:${inferredEventCode}:${
            payload.reportUpdate?.reportStatus ??
            payload.deliveryUpdate?.deliveryStatus ??
            "none"
          }`,
          organizationId: report.organizationId,
          customerAccountId: report.customerAccountId,
          reportId: report.id,
          eventCode: inferredEventCode,
          severity: inferredEventCode === "delivery_failed" ? "critical" : "info",
          message: payload.deliveryUpdate?.deliveryMessage ?? inferredEventMessage,
          metadata: {
            dispatchId: payload.dispatchId,
            correlationId: payload.correlationId,
            reportStatus: payload.reportUpdate?.reportStatus ?? null,
            deliveryStatus: payload.deliveryUpdate?.deliveryStatus ?? null,
            statusMarker
          }
        });
      }

      if (payload.operatorEvent) {
        await appendOperatorWorkflowEventRecord({
          db: tx,
          eventKey: `operator.writeback.explicit:${payload.dispatchId}:${report.id}:${
            payload.operatorEvent.eventCode ??
            inferredEventCode ??
            "report_processing"
          }`,
          organizationId: report.organizationId,
          customerAccountId: report.customerAccountId,
          reportId: report.id,
          eventCode:
            payload.operatorEvent.eventCode ??
            inferredEventCode ??
            "report_processing",
          severity: payload.operatorEvent.severity,
          message: payload.operatorEvent.message,
          metadata: payload.operatorEvent.metadata ?? {
            dispatchId: payload.dispatchId,
            correlationId: payload.correlationId,
            statusMarker
          }
        });
      }

      return {
        ...report,
        deduplicated: false as const,
        statusMarker
      };
    });

    if (!updatedReport) {
      const error = unknownWritebackTargetError(
        writebackTargetFailureReason === "report_not_found"
          ? "Report could not be resolved for workflow writeback."
          : "Report writeback target is not bound to the expected workflow dispatch."
      );
      logServerEvent("warn", "workflow.callback.report_writeback.report_not_found", {
        dispatch_id: payload.dispatchId,
        correlation_id: payload.correlationId,
        status: "not_found",
        source: "n8n.callback",
        requestContext,
        resource_id: payload.reportId ?? payload.reportReference,
        metadata: {
          errorCode: error.code,
          errorClass: error.errorClass,
          retryable: error.retryable,
          operatorVisible: error.operatorVisible,
          writebackTargetFailureReason
        }
      });
      return toWorkflowWritebackErrorResponse(error);
    }

    if (updatedReport.deduplicated) {
      logServerEvent("info", "workflow.callback.report_writeback.deduplicated", {
        dispatch_id: payload.dispatchId,
        correlation_id: payload.correlationId,
        status: updatedReport.status,
        source: "n8n.callback",
        requestContext,
        resource_id: updatedReport.id,
        metadata: {
          statusMarker: updatedReport.statusMarker
        }
      });

      return workflowWritebackDuplicateResponse({
        dispatchId: payload.dispatchId,
        correlationId: payload.correlationId,
        reportId: updatedReport.id,
        reportReference: payload.reportReference
      });
    }

    logServerEvent("info", "workflow.callback.report_writeback.persisted", {
      traceId,
      route,
      dispatch_id: payload.dispatchId,
      correlation_id: payload.correlationId,
      status: updatedReport.status,
      source: "n8n.callback",
      requestContext,
      resource_id: updatedReport.id,
      metadata: {
        statusMarker: updatedReport.statusMarker
      }
    });

    logServerEvent("info", "workflow.callback.report_writeback.final_response", {
      traceId,
      route,
      dispatch_id: payload.dispatchId,
      correlation_id: payload.correlationId,
      status: updatedReport.status,
      source: "n8n.callback",
      requestContext
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        {
          ok: true,
          accepted: true,
          dispatchId: payload.dispatchId,
          correlationId: payload.correlationId,
          reportId: updatedReport.id,
          reportReference: payload.reportReference
        },
        traceId
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      const responseError = malformedWritebackPayloadError(error.message);
      logServerEvent("warn", "workflow.callback.report_writeback.invalid_payload", {
        traceId,
        route,
        status: "invalid",
        source: "n8n.callback",
        requestContext,
        metadata: {
          message: error.message,
          errorCode: responseError.code,
          errorClass: responseError.errorClass,
          retryable: responseError.retryable,
          operatorVisible: responseError.operatorVisible
        }
      });
      return toWorkflowWritebackErrorResponse(responseError);
    }

    if (error instanceof WorkflowWritebackRouteError) {
      return toWorkflowWritebackErrorResponse(error);
    }

    const responseError = persistenceWritebackError(
      error instanceof Error ? error.message : "Workflow writeback persistence failed."
    );
    logServerEvent("error", "workflow.callback.report_writeback.failed", {
      traceId,
      route,
      status: "failed",
      source: "n8n.callback",
      requestContext,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error",
        errorCode: responseError.code,
        errorClass: responseError.errorClass,
        retryable: responseError.retryable,
        operatorVisible: responseError.operatorVisible
      }
    });
    await sendOperationalAlert({
      source: "api.internal.workflows.report-writeback",
      title: "Workflow report writeback callback failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error",
        errorCode: responseError.code,
        errorClass: responseError.errorClass,
        retryable: responseError.retryable,
        operatorVisible: responseError.operatorVisible
      }
    });

    return toWorkflowWritebackErrorResponse(responseError);
  }
}
