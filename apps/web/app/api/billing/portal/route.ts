import { NextResponse } from "next/server";
import { requireOrganizationPermission } from "../../../../lib/auth";
import { createStripeBillingPortalSession } from "../../../../lib/billing";
import { shouldBlockDemoExternalSideEffects } from "../../../../lib/demo-mode";
import { requireEntitlement } from "../../../../lib/entitlements";
import { logServerEvent } from "../../../../lib/monitoring";
import { trackProductAnalyticsEvent } from "../../../../lib/product-analytics";
import { enforceTrustedOrigin } from "../../../../lib/route-security";
import { getAppUrl } from "../../../../lib/runtime-config";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";

function readValidatedPortalSource(formData: FormData | null) {
  const value = formData?.get("source");
  if (typeof value !== "string") {
    return "billing-portal";
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    return "billing-portal";
  }

  return normalized;
}

export async function POST(request: Request) {
  const invalidOrigin = enforceTrustedOrigin(request);
  if (invalidOrigin) {
    return invalidOrigin;
  }

  const rateLimited = await applyRouteRateLimit(request, {
    key: "billing-portal",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const session = await requireOrganizationPermission("billing.manage");
  await requireEntitlement(session.organization!.id, "billing.portal");
  const appUrl = getAppUrl();
  const formData = await request.formData().catch(() => null);
  const source = readValidatedPortalSource(formData);

  if (shouldBlockDemoExternalSideEffects()) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?billing=demo-mode`);
  }

  try {
    await trackProductAnalyticsEvent({
      name: "billing.portal_opened",
      payload: {
        source
      },
      source,
      path: "/api/billing/portal",
      session,
      organizationId: session.organization!.id,
      userId: session.user.id
    });

    const url = await createStripeBillingPortalSession({
      organizationId: session.organization!.id,
      returnUrl: `${appUrl}/billing/return?status=portal`
    });

    return NextResponse.redirect(url);
  } catch (error) {
    logServerEvent("error", "billing.portal.failed", {
      org_id: session.organization!.id,
      user_id: session.user.id,
      status: "failed",
      source,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?billing=portal-error`
    );
  }
}
