"use server";

import { redirect } from "next/navigation";
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
import { dispatchWebhookDeliveriesForEvent } from "../../lib/webhook-dispatcher";

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
  const source = String(formData.get("source") ?? "").trim() || "contact-sales-page";
  const sourcePath = String(formData.get("sourcePath") ?? "").trim() || "/contact";
  const requestedPlanCode = String(formData.get("requestedPlanCode") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const maskedEmail = maskEmail(email);
  const envPresence = getIntakeEnvPresence();

  logServerEvent("info", "contact_sales.submit.begin", {
    traceId,
    route: "contact-sales.action",
    status: "begin",
    source: "contact-sales.action",
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

  if (!email || !companyName) {
    logServerEvent("warn", "contact_sales.submit.invalid", {
      traceId,
      route: "contact-sales.action",
      status: "invalid",
      source: "contact-sales.action",
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
      route: "contact-sales.action",
      request_id: requestId,
      status: "validated",
      source: "contact-sales.action",
      metadata: {
        email: maskedEmail,
        intent,
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
      route: "contact-sales.action",
      request_id: requestId,
      resource_id: leadCapture.lead.id,
      status: "received",
      source: "contact-sales.action",
      metadata: {
        email: maskedEmail,
        deduped: leadCapture.deduped,
        eventId: leadCapture.eventId
      }
    });

    const deliverySummary =
      leadCapture.eventId !== null
        ? await dispatchWebhookDeliveriesForEvent(leadCapture.eventId)
        : { results: [] };
    const hubspotStatus = leadCapture.deduped
      ? "not_repeated"
      : summarizeDelivery(deliverySummary.results, "hubspot");
    const workflowStatus = leadCapture.deduped
      ? "not_repeated"
      : summarizeDelivery(deliverySummary.results, "n8n");
    const overallStatus =
      hubspotStatus === "failed" || workflowStatus === "failed"
        ? "partial"
        : "success";

    logServerEvent("info", "contact_sales.submit.final_response", {
      traceId,
      route: "contact-sales.action",
      request_id: requestId,
      resource_id: leadCapture.lead.id,
      status: overallStatus,
      source: "contact-sales.action",
      metadata: {
        email: maskedEmail,
        submission: "received",
        hubspot: hubspotStatus,
        workflow: workflowStatus
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
          route: "contact-sales.action",
          status: "failed",
          source: "contact-sales.action",
          metadata: {
            email: maskedEmail,
            intent,
            source,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    redirect(
      buildContactRedirect({
        intent,
        source,
        status: overallStatus,
        submission: "received",
        hubspot: hubspotStatus,
        workflow: workflowStatus,
        traceId
      })
    );
  } catch (error) {
    logServerEvent("error", "contact_sales.submit.failed", {
      traceId,
      route: "contact-sales.action",
      status: "failed",
      source: "contact-sales.action",
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
