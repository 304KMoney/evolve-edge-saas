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
  readOptionalEnumValue,
  readOptionalJsonValue,
  readOptionalString,
  ValidationError
} from "../../../../../lib/security-validation";
import {
  isAuthorizedWorkflowWritebackRequest,
  recordWorkflowStatusCallback
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
    failureReason: readOptionalString(payload, "failure_reason", {
      maxLength: 2000,
      allowEmpty: true
    }),
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
  const route = "api.internal.workflows.status";
  let traceId = readTraceIdFromHeaders(request.headers) ?? createTraceId("workflow-callback");
  const envPresence = getIntakeEnvPresence();
  const requestContext = buildTraceRequestContext(
    buildAuditRequestContextFromRequest(request) as Record<string, unknown>,
    traceId,
    route
  );
  try {
    logServerEvent("info", "workflow.callback.status.request_received", {
      traceId,
      route,
      status: "received",
      source: "n8n.callback",
      metadata: envPresence,
      requestContext
    });

    const rateLimited = await applyRouteRateLimit(request, {
      key: "internal-workflows-status",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedWorkflowWritebackRequest(request)) {
      logServerEvent("warn", "workflow.callback.status.auth_failed", {
        traceId,
        route,
        status: "unauthorized",
        source: "n8n.callback",
        metadata: envPresence,
        requestContext
      });
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logServerEvent("info", "workflow.callback.status.auth_passed", {
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
    const status = readOptionalEnumValue(payload, "status", [
      "acknowledged",
      "running",
      "succeeded",
      "failed"
    ] as const);
    if (!status) {
      throw new ValidationError(
        "status must be one of: acknowledged, running, succeeded, failed."
      );
    }

    logServerEvent("info", "workflow.callback.status.received", {
      traceId,
      route,
      request_id: dispatchId,
      dispatch_id: dispatchId,
      customer_email: maskEmail(
        readOptionalString(payload, "customer_email", { maxLength: 320 })
      ),
      purchased_tier: readOptionalString(payload, "purchased_tier", { maxLength: 100 }),
      status,
      source: "n8n.callback",
      requestContext
    });

    const result = await recordWorkflowStatusCallback({
      dispatchId,
      status,
      externalExecutionId: readOptionalString(payload, "externalExecutionId", {
        maxLength: 200
      }),
      message: readOptionalString(payload, "message", {
        maxLength: 1000,
        allowEmpty: true
      }) ?? readOptionalString(payload, "failure_reason", {
        maxLength: 2000,
        allowEmpty: true
      }),
      metadata: buildCallbackMetadata(payload),
      requestContext
    });

    logServerEvent("info", "workflow.callback.status.completed", {
      traceId,
      route,
      dispatch_id: result.id,
      status: result.status,
      source: "n8n.callback",
      requestContext
    });

    logServerEvent("info", "workflow.callback.status.final_response", {
      traceId,
      route,
      dispatch_id: result.id,
      status: result.status,
      source: "n8n.callback",
      requestContext
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        {
          ok: true,
          dispatchId: result.id,
          status: result.status
        },
        traceId
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      logServerEvent("warn", "workflow.callback.status.invalid_payload", {
        traceId,
        route,
        status: "invalid",
        source: "n8n.callback",
        requestContext,
        metadata: {
          message: error.message
        }
      });
      return NextResponse.json(maybeAddTraceDebug({ error: error.message }, traceId), { status: 400 });
    }

    logServerEvent("error", "workflow.callback.status.failed", {
      traceId,
      route,
      status: "failed",
      source: "n8n.callback",
      requestContext,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    await sendOperationalAlert({
      source: "api.internal.workflows.status",
      title: "Workflow status callback failed",
      metadata: {
        traceId,
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      maybeAddTraceDebug(
        {
          error: error instanceof Error ? error.message : "Unknown error"
        },
        traceId
      ),
      { status: 500 }
    );
  }
}
