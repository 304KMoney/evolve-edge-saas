import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest } from "../../../../../lib/audit";
import {
  buildTraceRequestContext,
  createTraceId,
  getIntakeEnvPresence,
  maskEmail,
  maybeAddTraceDebug,
  readTraceIdFromHeaders,
  readTraceIdFromPayload
} from "../../../../../lib/intake-observability";
import { logServerEvent, sendOperationalAlert } from "../../../../../lib/monitoring";
import { applyRouteRateLimit } from "../../../../../lib/security-rate-limit";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonValue,
  readOptionalString,
  readOptionalStringArray,
  ValidationError
} from "../../../../../lib/security-validation";
import { buildWorkflowCallbackErrorBody } from "../../../../../lib/workflow-callback-route-error";
import { buildWorkflowCallbackSuccessBody } from "../../../../../lib/workflow-callback-route-response";
import {
  isAuthorizedWorkflowWritebackRequest,
  recordWorkflowReportReady,
} from "../../../../../lib/workflow-dispatch";

function readDispatchIdFromPayload(payload: Record<string, unknown>) {
  const dispatchId =
    readOptionalString(payload, "dispatchId", { maxLength: 200 }) ??
    readOptionalString(payload, "request_id", { maxLength: 200 });

  if (!dispatchId) {
    throw new ValidationError("dispatchId or request_id is required.");
  }

  return dispatchId;
}

function buildCallbackMetadata(payload: Record<string, unknown>) {
  const metadataValue = readOptionalJsonValue(payload, "metadata");
  const metadataObject =
    metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)
      ? (metadataValue as Record<string, unknown>)
      : {};
  const compactMetadata = {
    appCustomerId: readOptionalString(payload, "app_customer_id", { maxLength: 200 }),
    appOrgId: readOptionalString(payload, "app_org_id", { maxLength: 200 }),
    customerEmail: readOptionalString(payload, "customer_email", { maxLength: 320 }),
    companyName: readOptionalString(payload, "company_name", { maxLength: 200 }),
    purchasedTier: readOptionalString(payload, "purchased_tier", { maxLength: 100 }),
    hubspotContactId: readOptionalString(payload, "hubspot_contact_id", { maxLength: 200 }),
    hubspotDealId: readOptionalString(payload, "hubspot_deal_id", { maxLength: 200 }),
    reportId: readOptionalString(payload, "report_id", { maxLength: 200 }),
    reportUrl: readOptionalString(payload, "report_url", { maxLength: 2000 }),
    timestamp: readOptionalString(payload, "timestamp", { maxLength: 100 })
  };

  return {
    ...metadataObject,
    ...Object.fromEntries(
      Object.entries(compactMetadata).filter(([, value]) => value !== null)
    )
  } as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  const route = "api.internal.workflows.report-ready";
  let traceId = readTraceIdFromHeaders(request.headers) ?? createTraceId("workflow-callback");
  const envPresence = getIntakeEnvPresence();
  const requestContext = buildTraceRequestContext(
    buildAuditRequestContextFromRequest(request) as Record<string, unknown>,
    traceId,
    route
  );
  try {
    logServerEvent("info", "workflow.callback.report_ready.request_received", {
      traceId,
      route,
      status: "received",
      source: "n8n.callback",
      metadata: envPresence,
      requestContext
    });

    const rateLimited = applyRouteRateLimit(request, {
      key: "internal-workflows-report-ready",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedWorkflowWritebackRequest(request)) {
      logServerEvent("warn", "workflow.callback.report_ready.auth_failed", {
        traceId,
        route,
        status: "unauthorized",
        source: "n8n.callback",
        metadata: envPresence,
        requestContext
      });
      return NextResponse.json(
        maybeAddTraceDebug(
          buildWorkflowCallbackErrorBody({
            code: "unauthorized_callback",
            errorClass: "non_retryable_validation",
            retryable: false,
            operatorVisible: false,
            message: "Unauthorized workflow callback request."
          }),
          traceId
        ),
        { status: 401 }
      );
    }

    logServerEvent("info", "workflow.callback.report_ready.auth_passed", {
      traceId,
      route,
      status: "authorized",
      source: "n8n.callback",
      metadata: envPresence,
      requestContext
    });

    const payload = expectObject(await parseJsonRequestBody(request));
    traceId = readTraceIdFromPayload(payload) ?? traceId;
    const dispatchId = readDispatchIdFromPayload(payload);

    logServerEvent("info", "workflow.callback.report_ready.received", {
      traceId,
      route,
      request_id: dispatchId,
      dispatch_id: dispatchId,
      customer_email: maskEmail(
        readOptionalString(payload, "customer_email", { maxLength: 320 })
      ),
      purchased_tier: readOptionalString(payload, "purchased_tier", { maxLength: 100 }),
      status: readOptionalString(payload, "status", { maxLength: 100 }) ?? "received",
      source: "n8n.callback",
      requestContext
    });

    const result = await recordWorkflowReportReady({
      dispatchId,
      reportReference:
        readOptionalString(payload, "reportReference", {
          maxLength: 200
        }) ??
        readOptionalString(payload, "report_id", {
          maxLength: 200
        }),
      reportUrl:
        readOptionalString(payload, "reportUrl", {
          maxLength: 2000
        }) ??
        readOptionalString(payload, "report_url", {
          maxLength: 2000
        }),
      externalExecutionId: readOptionalString(payload, "externalExecutionId", {
        maxLength: 200
      }),
      executiveSummary: readOptionalString(payload, "executiveSummary", {
        maxLength: 8000,
        allowEmpty: true
      }),
      riskLevel: readOptionalString(payload, "riskLevel", { maxLength: 100 }),
      topConcerns: readOptionalStringArray(payload, "topConcerns", {
        maxItems: 25,
        maxItemLength: 500
      }),
      metadata: buildCallbackMetadata(payload),
      requestContext
    });

    if (result.deduplicated) {
      logServerEvent("info", "workflow.callback.report_ready.deduplicated", {
        traceId,
        route,
        dispatch_id: result.id,
        status: result.status,
        source: "n8n.callback",
        requestContext
      });

      return NextResponse.json(
        maybeAddTraceDebug(
          buildWorkflowCallbackSuccessBody({
            dispatchId: result.id,
            status: result.status,
            deduplicated: true
          }),
          traceId
        )
      );
    }

    logServerEvent("info", "workflow.callback.report_ready.completed", {
      traceId,
      route,
      dispatch_id: result.id,
      status: result.status,
      source: "n8n.callback",
      requestContext
    });

    logServerEvent("info", "workflow.callback.report_ready.final_response", {
      traceId,
      route,
      dispatch_id: result.id,
      status: result.status,
      source: "n8n.callback",
      requestContext
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        buildWorkflowCallbackSuccessBody({
          dispatchId: result.id,
          status: result.status
        }),
        traceId
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      logServerEvent("warn", "workflow.callback.report_ready.invalid_payload", {
        traceId,
        route,
        status: "invalid",
        source: "n8n.callback",
        requestContext,
        metadata: {
          message: error.message
        }
      });
      return NextResponse.json(
        maybeAddTraceDebug(
          buildWorkflowCallbackErrorBody({
            code: "malformed_payload",
            errorClass: "non_retryable_validation",
            retryable: false,
            operatorVisible: false,
            message: error.message
          }),
          traceId
        ),
        { status: 400 }
      );
    }

    logServerEvent("error", "workflow.callback.report_ready.failed", {
      traceId,
      route,
      status: "failed",
      source: "n8n.callback",
      requestContext,
      metadata: {
        traceId,
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    await sendOperationalAlert({
      source: "api.internal.workflows.report-ready",
      title: "Workflow report-ready callback failed",
      metadata: {
        traceId,
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      maybeAddTraceDebug(
        buildWorkflowCallbackErrorBody({
          code: "callback_processing_failed",
          errorClass: "retryable",
          retryable: true,
          operatorVisible: true,
          message: error instanceof Error ? error.message : "Unknown error"
        }),
        traceId
      ),
      { status: 500 }
    );
  }
}
