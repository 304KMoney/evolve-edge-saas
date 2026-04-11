"use server";

import { redirect } from "next/navigation";
import { getServerAuditRequestContext } from "../../lib/audit";
import {
  captureLeadSubmission,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { trackProductAnalyticsEvent } from "../../lib/product-analytics";

export async function submitContactSalesLeadAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamSize = String(formData.get("teamSize") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim() || "general-sales";
  const source = String(formData.get("source") ?? "").trim() || "contact-sales-page";
  const sourcePath = String(formData.get("sourcePath") ?? "").trim() || "/contact-sales";
  const requestedPlanCode = String(formData.get("requestedPlanCode") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!email || !companyName) {
    redirect(
      `/contact-sales?error=missing-required&intent=${encodeURIComponent(intent)}&source=${encodeURIComponent(source)}` as never
    );
  }

  const [requestContext, attribution] = await Promise.all([
    getServerAuditRequestContext(),
    readLeadAttributionFromCookies()
  ]);

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
      message
    },
    actorLabel: email,
    requestContext
  });

  if (!leadCapture.deduped) {
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
  }

  redirect(
    `/contact-sales?submitted=1&intent=${encodeURIComponent(intent)}&source=${encodeURIComponent(source)}` as never
  );
}
