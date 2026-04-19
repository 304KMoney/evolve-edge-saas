"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { headers } from "next/headers";
import { getServerAuditRequestContext } from "../../lib/audit";
import {
  buildTraceRequestContext,
  createTraceId,
  getIntakeEnvPresence,
  maskEmail
} from "../../lib/intake-observability";
import {
  LeadSubmissionPipelineError,
  captureLeadSubmission,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { logServerEvent } from "../../lib/monitoring";
import { trackProductAnalyticsEvent } from "../../lib/product-analytics";
import { getAppUrl, getOptionalEnv } from "../../lib/runtime-config";
import { dispatchWebhookDeliveriesForEvent } from "../../lib/webhook-dispatcher";

const CONTACT_ROUTE = "contact-sales.action";
const CONTACT_SOURCE = "contact-sales.action";
const DEFAULT_N8N_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SNIPPET_LENGTH = 500;

type CanonicalContactTier = "starter" | "growth" | "scale" | "enterprise";

function buildContactRedirect(input: {
  intent: string;
  source: string;
  status?: "success" | "partial" | "failed";
  error?: string;
  submission?: string;
  hubspot?: string;
  workflow?: string;
  traceId?: string;
}) {
  const params = new URLSearchParams({
    intent: input.intent,
    source: input.source
  });

  if (input.status) {
    params.set("status", input.status);
  }
  if (input.error) {
    params.set("error", input.error);
  }
  if (input.submission) {
    params.set("submission", input.submission);
  }
  if (input.hubspot) {
    params.set("hubspot", input.hubspot);
  }
  if (input.workflow) {
    params.set("workflow", input.workflow);
  }
  if (input.traceId) {
    params.set("trace", input.traceId);
  }

  return `/contact?${params.toString()}` as never;
}

function summarizeDelivery(results: Array<{ provider: string; status: string }>, provider: string) {
  const matching = results.filter((result) => result.provider === provider);

  if (matching.length === 0) {
    return "not_configured";
  }

  if (matching.every((result) => result.status === "DELIVERED")) {
    return provider === "n8n" ? "dispatched" : "captured";
  }

  return "failed";
}

function normalizeLookupKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeCanonicalTier(value: string | null | undefined): CanonicalContactTier | null {
  const normalized = normalizeLookupKey(value);

  switch (normalized) {
    case "founding-risk-audit":
    case "starter":
      return "starter";
    case "growth":
      return "growth";
    case "scale":
      return "scale";
    case "enterprise":
      return "enterprise";
    default:
      return null;
  }
}

function resolveCanonicalContactTier(input: {
  intent: string;
  tier?: string | null;
  workflowType?: string | null;
  requestedPlanCode?: string | null;
}): CanonicalContactTier {
  return (
    normalizeCanonicalTier(input.tier) ??
    normalizeCanonicalTier(input.workflowType) ??
    normalizeCanonicalTier(input.intent) ??
    normalizeCanonicalTier(input.requestedPlanCode) ??
    "starter"
  );
}

async function buildIntakeDispatchUrl() {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";

  if (host) {
    return `${protocol}://${host}/api/automation/intake-to-app-dispatch`;
  }

  return `${getAppUrl()}/api/automation/intake-to-app-dispatch`;
}

async function dispatchContactSubmissionToN8n(input: {
  traceId: string;
  leadId: string;
  requestId: string | null;
  eventId: string | null;
  email: string;
  companyName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  teamSize: string;
  intent: string;
  tier: string;
  workflowType: string;
  sourcePath: string;
  requestedPlanCode: string;
  message: string;
}) {
  const rawIntent = normalizeLookupKey(input.intent);
  const canonicalTier = resolveCanonicalContactTier({
    intent: input.intent,
    tier: input.tier,
    workflowType: input.workflowType,
    requestedPlanCode: input.requestedPlanCode
  });
  const intakeDispatchPath = "/api/automation/intake-to-app-dispatch";
  const intakeDispatchUrl = intakeDispatchPath;
  const dispatchSecret = process.env.PUBLIC_INTAKE_SHARED_SECRET?.trim() ?? "";
  if (!dispatchSecret) {
    throw new Error("PUBLIC_INTAKE_SHARED_SECRET is required.");
  const dispatchSecret = process.env.PUBLIC_INTAKE_SHARED_SECRET?.trim() ?? "";
  if (!dispatchSecret) {
    throw new Error("PUBLIC_INTAKE_SHARED_SECRET is required.");
  const intakeDispatchUrl = await buildIntakeDispatchUrl();
  const dispatchSecret =
    getOptionalEnv("PUBLIC_INTAKE_SHARED_SECRET") ?? getOptionalEnv("OUTBOUND_DISPATCH_SECRET");
  if (!dispatchSecret) {
    throw new Error("PUBLIC_INTAKE_SHARED_SECRET or OUTBOUND_DISPATCH_SECRET is required.");
  }
  const requestId = `contact_${input.traceId}_${Date.now()}`;
  const customerName = `${input.firstName} ${input.lastName}`.trim();

  logServerEvent("info", "contact_sales.submit.workflow_resolution", {
    traceId: input.traceId,
    route: CONTACT_ROUTE,
    request_id: input.requestId,
    resource_id: input.leadId,
    event_id: input.eventId,
    status: "resolved",
    source: CONTACT_SOURCE,
    metadata: {
      rawIntent,
      canonicalTier,
      selectedDestination: "api.automation.intake-to-app-dispatch",
      selectedDestinationPath: intakeDispatchPath,
      selectedDestinationPath: intakeDispatchPath
      selectedDestinationUrl: intakeDispatchUrl
    }
  });

  const timeoutMs = DEFAULT_N8N_TIMEOUT_MS;
  const payload = {
    request_id: requestId,
    customer_email: input.email,
    customer_name: customerName || null,
    first_name: input.firstName || null,
    last_name: input.lastName || null,
    company_name: input.companyName || null,
    phone: input.phone || null,
    purchased_tier: canonicalTier,
    purchased_plan_code: canonicalTier,
    additional_notes: input.message || null,
    lead_source_detail: input.sourcePath,
    intake_answers: {
      intent: input.intent,
      canonicalTier,
      workflowType: input.workflowType || null
    },
    trace_id: input.traceId,
    submitted_at: new Date().toISOString(),
    lead_id: input.leadId,
    event_id: input.eventId
  };

  logServerEvent("info", "contact_sales.submit.outbound_fetch_start", {
    traceId: input.traceId,
    route: CONTACT_ROUTE,
    request_id: input.requestId,
    resource_id: input.leadId,
    event_id: input.eventId,
    status: "begin",
    source: CONTACT_SOURCE,
    metadata: {
      destinationUrl: intakeDispatchUrl,
      destinationPath: intakeDispatchPath,
      destination: "api.automation.intake-to-app-dispatch",
      canonicalTier,
      timeoutMs
    }
  });
  console.info("[contact_sales.submit] intake dispatch request", {
    path: intakeDispatchPath,
    hasAuthorizationHeader: dispatchSecret.length > 0
  });

  const response = await fetch(intakeDispatchPath, {

  const response = await fetch(intakeDispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dispatchSecret}`,
      "x-evolve-edge-trace-id": input.traceId
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseText = (await response.text()).slice(0, MAX_RESPONSE_SNIPPET_LENGTH);

  logServerEvent("info", "contact_sales.submit.outbound_fetch_status", {
    traceId: input.traceId,
    route: CONTACT_ROUTE,
    request_id: input.requestId,
    resource_id: input.leadId,
    event_id: input.eventId,
    status: response.ok ? "accepted" : "failed",
    source: CONTACT_SOURCE,
    metadata: {
      destinationUrl: intakeDispatchUrl,
      destinationPath: intakeDispatchPath,
      destination: "api.automation.intake-to-app-dispatch",
      canonicalTier,
      rawIntent,
      responseStatus: response.status,
      responseSnippet: responseText
    }
  });

  if (!response.ok) {
    throw new Error(`Contact workflow dispatch failed with status ${response.status}.`);
  }

  return {
    canonicalTier,
    rawIntent
  };
}

export async function submitContactSalesLeadAction(formData: FormData) {
  const traceId = createTraceId("lead");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamSize = String(formData.get("teamSize") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim() || "general-sales";
  const tier = String(formData.get("tier") ?? "").trim();
  const workflowType = String(formData.get("workflowType") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim() || "contact-sales-page";
  const sourcePath = String(formData.get("sourcePath") ?? "").trim() || "/contact";
  const requestedPlanCode = String(formData.get("requestedPlanCode") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const maskedEmail = maskEmail(email);
  const envPresence = getIntakeEnvPresence();

  logServerEvent("info", "contact_sales.submit.begin", {
    traceId,
    route: CONTACT_ROUTE,
    status: "begin",
    source: CONTACT_SOURCE,
    metadata: {
      email: maskedEmail,
      companyName,
      intent,
      sourcePath,
      requestedPlanCode: requestedPlanCode || null,
      hasMessage: message.length > 0,
      ...envPresence
    }
  });
  logServerEvent("info", "contact_sales.submit.live_path_entered", {
    traceId,
    route: CONTACT_ROUTE,
    status: "entered",
    source: CONTACT_SOURCE,
    metadata: {
      submitPath: "/contact",
      dispatchPath: "/api/automation/intake-to-app-dispatch",
      intent
    }
  });

  if (!email || !companyName) {
    logServerEvent("warn", "contact_sales.submit.invalid", {
      traceId,
      route: CONTACT_ROUTE,
      status: "invalid",
      source: CONTACT_SOURCE,
      metadata: {
        email: maskedEmail,
        companyNamePresent: Boolean(companyName),
        emailPresent: Boolean(email)
      }
    });
    redirect(buildContactRedirect({ intent, source, error: "missing-required", status: "failed", traceId }));
  }

  let attribution = null;

  try {
    const [requestContext, capturedAttribution] = await Promise.all([
      getServerAuditRequestContext(),
      readLeadAttributionFromCookies()
    ]);
    const tracedRequestContext = buildTraceRequestContext(
      requestContext as Record<string, unknown>,
      traceId,
      "contact-sales.action"
    );
    const requestId =
      typeof (tracedRequestContext as Record<string, unknown>).requestId === "string"
        ? ((tracedRequestContext as Record<string, unknown>).requestId as string)
        : null;

    attribution = capturedAttribution;

    logServerEvent("info", "contact_sales.submit.payload_normalized", {
      traceId,
      route: CONTACT_ROUTE,
      request_id: requestId,
      status: "validated",
      source: CONTACT_SOURCE,
      metadata: {
        email: maskedEmail,
        intent,
        tier: tier || null,
        workflowType: workflowType || null,
        sourcePath,
        requestedPlanCode: requestedPlanCode || null,
        hasAttribution: Boolean(attribution)
      }
    });

    const leadCapture = await captureLeadSubmission({
      source: intent === "demo-request" ? "demo_request" : "contact_sales",
      email,
      firstName,
      lastName,
      companyName,
      jobTitle,
      phone,
      teamSize,
      intent,
      sourcePath,
      requestedPlanCode: requestedPlanCode || null,
      attribution,
      payload: {
        message,
        trace_id: traceId
      },
      actorLabel: email,
      requestContext: tracedRequestContext
    });

    logServerEvent("info", "contact_sales.submit.received", {
      traceId,
      route: CONTACT_ROUTE,
      request_id: requestId,
      resource_id: leadCapture.lead.id,
      status: "received",
      source: CONTACT_SOURCE,
      metadata: {
        email: maskedEmail,
        deduped: leadCapture.deduped,
        eventId: leadCapture.eventId
      }
    });

    let workflowStatus: "dispatched" | "failed" = "failed";
    let deliverySummary: { results: Array<{ provider: string; status: string }> } = {
      results: []
    };
    let deliveryDispatchFailed = false;

    if (leadCapture.eventId !== null) {
      try {
        await dispatchContactSubmissionToN8n({
          traceId,
          leadId: leadCapture.lead.id,
          requestId,
          eventId: leadCapture.eventId,
          email,
          companyName,
          firstName,
          lastName,
          jobTitle,
          phone,
          teamSize,
          intent,
          tier,
          workflowType,
          sourcePath,
          requestedPlanCode,
          message
        });
        workflowStatus = "dispatched";
      } catch (error) {
        deliveryDispatchFailed = true;
        workflowStatus = "failed";
        logServerEvent("error", "contact_sales.submit.workflow_dispatch_failed", {
          traceId,
          route: CONTACT_ROUTE,
          request_id: requestId,
          resource_id: leadCapture.lead.id,
          event_id: leadCapture.eventId,
          status: "failed",
          source: CONTACT_SOURCE,
          metadata: {
            email: maskedEmail,
            intent,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }

      try {
        deliverySummary = await dispatchWebhookDeliveriesForEvent(leadCapture.eventId);
      } catch (error) {
        deliveryDispatchFailed = true;
        logServerEvent("error", "contact_sales.submit.dispatch_failed", {
          traceId,
          route: CONTACT_ROUTE,
          request_id: requestId,
          resource_id: leadCapture.lead.id,
          event_id: leadCapture.eventId,
          status: "failed",
          source: CONTACT_SOURCE,
          metadata: {
            email: maskedEmail,
            stage: "webhook_dispatch",
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    const hubspotStatus = leadCapture.deduped
      ? "not_repeated"
      : deliveryDispatchFailed
        ? "failed"
        : summarizeDelivery(deliverySummary.results, "hubspot");
    if (leadCapture.eventId === null) {
      try {
        await dispatchContactSubmissionToN8n({
          traceId,
          leadId: leadCapture.lead.id,
          requestId,
          eventId: null,
          email,
          companyName,
          firstName,
          lastName,
          jobTitle,
          phone,
          teamSize,
          intent,
          tier,
          workflowType,
          sourcePath,
          requestedPlanCode,
          message
        });
        workflowStatus = "dispatched";
      } catch (error) {
        deliveryDispatchFailed = true;
        workflowStatus = "failed";
        logServerEvent("error", "contact_sales.submit.workflow_dispatch_failed", {
          traceId,
          route: CONTACT_ROUTE,
          request_id: requestId,
          resource_id: leadCapture.lead.id,
          status: "failed",
          source: CONTACT_SOURCE,
          metadata: {
            email: maskedEmail,
            intent,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    const inboundWorkflowStatus = leadCapture.deduped
      ? "not_repeated"
      : deliveryDispatchFailed
        ? "failed"
        : summarizeDelivery(deliverySummary.results, "n8n");
    const workflowSummaryStatus = workflowStatus === "dispatched" ? "dispatched" : inboundWorkflowStatus;
    const overallStatus =
      hubspotStatus === "failed" || workflowStatus === "failed"
        ? "failed"
        : "success";

    logServerEvent("info", "contact_sales.submit.final_response", {
      traceId,
      route: CONTACT_ROUTE,
      request_id: requestId,
      resource_id: leadCapture.lead.id,
      status: overallStatus,
      source: CONTACT_SOURCE,
      metadata: {
        email: maskedEmail,
        submission: "received",
        hubspot: hubspotStatus,
        workflow: workflowSummaryStatus
      }
    });

    if (!leadCapture.deduped) {
      try {
        await trackProductAnalyticsEvent({
          name: "funnel.lead_captured",
          payload: {
            source: intent === "demo-request" ? "demo_request" : "contact_sales",
            intent,
            requestedPlanCode: requestedPlanCode || null,
            companyName,
            deduped: false
          },
          source: "contact-sales",
          path: sourcePath,
          organizationId: null,
          userId: null,
          attribution
        });
      } catch (error) {
        logServerEvent("warn", "contact_sales.submit.analytics_failed", {
          traceId,
          route: CONTACT_ROUTE,
          status: "failed",
          source: CONTACT_SOURCE,
          metadata: {
            email: maskedEmail,
            intent,
            source,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    if (overallStatus === "failed") {
      redirect(
        buildContactRedirect({
          intent,
          source,
          status: "failed",
          error: "submission-failed",
          hubspot: hubspotStatus,
          workflow: workflowSummaryStatus,
          traceId
        })
      );
    }

    redirect(
      buildContactRedirect({
        intent,
        source,
        status: "success",
        submission: "received",
        hubspot: hubspotStatus,
        workflow: workflowSummaryStatus,
        traceId
      })
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    logServerEvent("error", "contact_sales.submit.failed", {
      traceId,
      route: CONTACT_ROUTE,
      status: "failed",
      source: CONTACT_SOURCE,
      metadata: {
        email: maskedEmail,
        companyName,
        intent,
        source,
        sourcePath,
        hasAttribution: Boolean(attribution),
        stage:
          error instanceof LeadSubmissionPipelineError ? error.stage : "lead_capture",
        message: error instanceof Error ? error.message : "Unknown error",
        ...envPresence
      }
    });

    redirect(buildContactRedirect({ intent, source, error: "submission-failed", status: "failed", traceId }));
  }
}
