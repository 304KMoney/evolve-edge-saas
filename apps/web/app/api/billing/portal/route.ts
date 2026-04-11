import { NextResponse } from "next/server";
import { requireOrganizationPermission } from "../../../../lib/auth";
import { createStripeBillingPortalSession } from "../../../../lib/billing";
import { shouldBlockDemoExternalSideEffects } from "../../../../lib/demo-mode";
import { requireEntitlement } from "../../../../lib/entitlements";
import { trackProductAnalyticsEvent } from "../../../../lib/product-analytics";
import { getAppUrl } from "../../../../lib/runtime-config";

export async function POST(request: Request) {
  const session = await requireOrganizationPermission("billing.manage");
  await requireEntitlement(session.organization!.id, "billing.portal");
  const appUrl = getAppUrl();
  const formData = await request.formData().catch(() => null);
  const source = String(formData?.get("source") ?? "").trim() || "billing-portal";

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
    console.error("Failed to create Stripe billing portal session", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?billing=portal-error`
    );
  }
}
