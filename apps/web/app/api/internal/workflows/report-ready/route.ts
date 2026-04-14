import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest } from "../../../../../lib/audit";
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
  const requestContext = buildAuditRequestContextFromRequest(request);
  try {
    const rateLimited = applyRouteRateLimit(request, {
      key: "internal-workflows-report-ready",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedWorkflowWritebackRequest(request)) {
      logServerEvent("warn", "workflow.callback.report_ready.unauthorized", {
        status: "unauthorized",
        source: "n8n.callback",
        requestContext
      });
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = expectObject(await parseJsonRequestBody(request));
    const dispatchId = readDispatchIdFromPayload(payload);

    logServerEvent("info", "workflow.callback.report_ready.received", {
      request_id: dispatchId,
      dispatch_id: dispatchId,
      customer_email: readOptionalString(payload, "customer_email", { maxLength: 320 }),
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

    logServerEvent("info", "workflow.callback.report_ready.completed", {
      dispatch_id: result.id,
      status: result.status,
      source: "n8n.callback",
      requestContext
    });

    return NextResponse.json({
      ok: true,
      dispatchId: result.id,
      status: result.status
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      logServerEvent("warn", "workflow.callback.report_ready.invalid_payload", {
        status: "invalid",
        source: "n8n.callback",
        requestContext,
        metadata: {
          message: error.message
        }
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logServerEvent("error", "workflow.callback.report_ready.failed", {
      status: "failed",
      source: "n8n.callback",
      requestContext,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    await sendOperationalAlert({
      source: "api.internal.workflows.report-ready",
      title: "Workflow report-ready callback failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
