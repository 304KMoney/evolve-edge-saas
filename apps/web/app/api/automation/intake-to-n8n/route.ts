import { NextResponse } from "next/server";
import {
  createTraceId,
  getIntakeEnvPresence,
  maskEmail,
  maybeAddTraceDebug,
  readTraceIdFromHeaders,
  readTraceIdFromPayload
} from "../../../../lib/intake-observability";
import {
  getAppUrl,
  getOptionalEnv,
  getRuntimeEnvironment,
  requireEnv
} from "../../../../lib/runtime-config";
import { logServerEvent, sendOperationalAlert } from "../../../../lib/monitoring";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { isAuthorizedBearerRequest } from "../../../../lib/security-auth";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonValue,
  readOptionalString,
  readOptionalStringArray,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";

function readOptionalBoolean(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean.`);
  }

  return value;
}

function readOptionalNumber(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number.`);
  }

  return value;
}

function buildCallbackUrls() {
  const appUrl = getAppUrl();

  return {
    status_update_url: `${appUrl}/api/internal/workflows/status`,
    report_ready_url: `${appUrl}/api/internal/workflows/report-ready`,
    failure_url: `${appUrl}/api/internal/workflows/failed`
  };
}

function normalizePayload(payload: Record<string, unknown>) {
  const requestId = readRequiredString(payload, "request_id", { maxLength: 200 });
  const customerEmail = readRequiredString(payload, "customer_email", {
    maxLength: 320
  });
  const purchasedTier =
    readOptionalString(payload, "purchased_tier", { maxLength: 120 }) ??
    readOptionalString(payload, "purchased_plan_code", { maxLength: 120 });

  if (!purchasedTier) {
    throw new ValidationError(
      "purchased_tier or purchased_plan_code is required."
    );
  }

  const purchasedPlanCode =
    readOptionalString(payload, "purchased_plan_code", { maxLength: 120 }) ??
    purchasedTier;

  return {
    request_id: requestId,
    app_customer_id: readOptionalString(payload, "app_customer_id", {
      maxLength: 200
    }),
    app_org_id: readOptionalString(payload, "app_org_id", { maxLength: 200 }),
    customer_email: customerEmail,
    customer_name: readOptionalString(payload, "customer_name", {
      maxLength: 200
    }),
    first_name: readOptionalString(payload, "first_name", { maxLength: 120 }),
    last_name: readOptionalString(payload, "last_name", { maxLength: 120 }),
    company_name: readOptionalString(payload, "company_name", { maxLength: 200 }),
    phone: readOptionalString(payload, "phone", { maxLength: 60 }),
    purchased_tier: purchasedTier,
    purchased_plan_code: purchasedPlanCode,
    amount_paid: readOptionalNumber(payload, "amount_paid"),
    currency: readOptionalString(payload, "currency", { maxLength: 16 }),
    stripe_session_id: readOptionalString(payload, "stripe_session_id", {
      maxLength: 200
    }),
    stripe_payment_intent: readOptionalString(payload, "stripe_payment_intent", {
      maxLength: 200
    }),
    stripe_customer_id: readOptionalString(payload, "stripe_customer_id", {
      maxLength: 200
    }),
    order_id: readOptionalString(payload, "order_id", { maxLength: 200 }),
    lead_source_detail: readOptionalString(payload, "lead_source_detail", {
      maxLength: 200
    }),
    top_concerns: readOptionalStringArray(payload, "top_concerns", {
      maxItems: 25,
      maxItemLength: 500
    }),
    uses_ai_tools: readOptionalBoolean(payload, "uses_ai_tools"),
    company_size: readOptionalString(payload, "company_size", {
      maxLength: 120
    }),
    industry: readOptionalString(payload, "industry", { maxLength: 120 }),
    additional_notes: readOptionalString(payload, "additional_notes", {
      maxLength: 8000,
      allowEmpty: true
    }),
    website: readOptionalString(payload, "website", { maxLength: 500 }),
    intake_answers: readOptionalJsonValue(payload, "intake_answers"),
    purchase_timestamp: readOptionalString(payload, "purchase_timestamp", {
      maxLength: 100
    }),
    callback_urls: buildCallbackUrls()
  };
}

export async function POST(request: Request) {
  const route = "api.automation.intake-to-n8n";
  const rateLimited = applyRouteRateLimit(request, {
    key: "automation-intake-to-n8n",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const intakeSecret =
    getOptionalEnv("PUBLIC_INTAKE_SHARED_SECRET") ??
    getOptionalEnv("OUTBOUND_DISPATCH_SECRET");
  if (!intakeSecret && getRuntimeEnvironment() === "production") {
    return NextResponse.json(
      { error: "Public intake is not configured for production." },
      { status: 503 }
    );
  }

  if (intakeSecret && !isAuthorizedBearerRequest(request, intakeSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const envPresence = getIntakeEnvPresence();
  let traceId = readTraceIdFromHeaders(request.headers) ?? createTraceId("intake-api");
  let requestId: string | null = null;
  let orgId: string | null = null;
  let customerEmail: string | null = null;
  let purchasedTier: string | null = null;

  try {
    logServerEvent("info", "automation.intake_to_n8n.request_received", {
      traceId,
      route,
      status: "received",
      source: route,
      metadata: envPresence
    });

    const payload = expectObject(await parseJsonRequestBody(request));
    traceId = readTraceIdFromPayload(payload) ?? traceId;
    logServerEvent("info", "automation.intake_to_n8n.payload_parsed", {
      traceId,
      route,
      status: "parsed",
      source: route,
      metadata: {
        ...envPresence,
        payloadKeys: Object.keys(payload).slice(0, 20)
      }
    });

    const normalized = normalizePayload(payload);
    requestId = normalized.request_id;
    orgId = normalized.app_org_id;
    customerEmail = normalized.customer_email;
    purchasedTier = normalized.purchased_tier;
    traceId = readTraceIdFromPayload(normalized) ?? traceId;

    logServerEvent("info", "automation.intake_to_n8n.payload_validated", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      status: "validated",
      source: route,
      metadata: {
        customerEmail: maskEmail(customerEmail),
        purchasedTier,
        ...envPresence
      }
    });

    logServerEvent("info", "automation.intake_to_n8n.received", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "received",
      source: route
    });

    const webhookUrl = requireEnv("N8N_WEBHOOK_URL");
    const callbackSharedSecret = requireEnv("N8N_CALLBACK_SHARED_SECRET");
    logServerEvent("info", "automation.intake_to_n8n.dispatch_begin", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      status: "begin",
      source: route,
      metadata: {
        customerEmail: maskEmail(customerEmail),
        purchasedTier,
        ...envPresence
      }
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${callbackSharedSecret}`,
        "x-evolve-edge-trace-id": traceId,
        "x-evolve-edge-request-id": normalized.request_id,
        "x-evolve-edge-org-id": normalized.app_org_id ?? "",
        "x-evolve-edge-customer-email": normalized.customer_email,
        "x-evolve-edge-purchased-tier": normalized.purchased_tier
      },
      body: JSON.stringify(normalized),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `n8n webhook returned ${response.status}: ${responseText}`.slice(0, 1_000)
      );
    }

    logServerEvent("info", "automation.intake_to_n8n.accepted", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "accepted",
      source: route
    });

    logServerEvent("info", "automation.intake_to_n8n.final_response", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      status: "accepted",
      source: route
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        {
          ok: true,
          accepted: true,
          request_id: requestId
        },
        traceId
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      logServerEvent("warn", "automation.intake_to_n8n.invalid_payload", {
        traceId,
        route,
        request_id: requestId,
        org_id: orgId,
        customer_email: maskEmail(customerEmail),
        purchased_tier: purchasedTier,
        status: "invalid",
        source: route,
        metadata: {
          ...envPresence,
          message: error.message
        }
      });

      return NextResponse.json(maybeAddTraceDebug({ error: error.message }, traceId), { status: 400 });
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logServerEvent("error", "automation.intake_to_n8n.failed", {
      traceId,
      route,
      request_id: requestId,
      org_id: orgId,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "failed",
      source: route,
      metadata: {
        ...envPresence,
        message: errorMessage
      }
    });

    await sendOperationalAlert({
      source: "api.automation.intake-to-n8n",
      title: "Intake-to-n8n forwarding failed",
      metadata: {
        requestId,
        orgId,
        customerEmail: maskEmail(customerEmail),
        purchasedTier,
        traceId,
        message: errorMessage
      }
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        { error: "Intake request could not be forwarded. Please retry shortly." },
        traceId
      ),
      { status: 500 }
    );
  }
}
