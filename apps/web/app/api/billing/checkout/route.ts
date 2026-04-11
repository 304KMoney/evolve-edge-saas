import { NextResponse } from "next/server";
import { requireOrganizationPermission } from "../../../../lib/auth";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  getCurrentSubscription
} from "../../../../lib/billing";
import {
  getCanonicalCommercialPlanDefinition,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  supportsStripeCheckoutForCanonicalPlan
} from "../../../../lib/commercial-catalog";
import { shouldBlockDemoExternalSideEffects } from "../../../../lib/demo-mode";
import { trackProductAnalyticsEvent } from "../../../../lib/product-analytics";
import { getPlanTransitionDirection } from "../../../../lib/revenue-catalog";
import { getAppUrl } from "../../../../lib/runtime-config";

export async function POST(request: Request) {
  const session = await requireOrganizationPermission("billing.manage");
  const formData = await request.formData();
  const requestedPlanCode = String(formData.get("planCode") ?? "scale");
  const source = String(formData.get("source") ?? "").trim() || "billing-checkout";
  const appUrl = getAppUrl();
  const canonicalPlanCode =
    resolveCanonicalPlanCode(requestedPlanCode) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(requestedPlanCode);

  if (shouldBlockDemoExternalSideEffects()) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?billing=demo-mode`);
  }

  if (canonicalPlanCode && !supportsStripeCheckoutForCanonicalPlan(canonicalPlanCode)) {
    return NextResponse.redirect(
      `${appUrl}/contact-sales?intent=enterprise-plan&source=${encodeURIComponent(source)}`
    );
  }

  try {
    const currentSubscription = await getCurrentSubscription(session.organization!.id);
    const transition = getPlanTransitionDirection(
      currentSubscription?.plan.code ?? null,
      requestedPlanCode
    );

    await trackProductAnalyticsEvent({
      name: "billing.checkout_started",
      payload: {
        planCode: canonicalPlanCode ?? requestedPlanCode,
        transition
      },
      source,
      path: "/api/billing/checkout",
      session,
      organizationId: session.organization!.id,
      userId: session.user.id,
      billingPlanCode: canonicalPlanCode ?? requestedPlanCode
    });

    if (transition === "upgrade") {
      await trackProductAnalyticsEvent({
        name: "revenue.upgrade_clicked",
        payload: {
          fromPlanCode: currentSubscription?.plan.code ?? null,
          toPlanCode: canonicalPlanCode ?? requestedPlanCode,
          source
        },
        source,
        path: "/api/billing/checkout",
        session,
        organizationId: session.organization!.id,
        userId: session.user.id,
        billingPlanCode: canonicalPlanCode ?? requestedPlanCode
      });
    }

    if (currentSubscription?.stripeSubscriptionId && currentSubscription?.stripeCustomerId) {
      await trackProductAnalyticsEvent({
        name: "billing.portal_opened",
        payload: {
          source: `${source}:plan-change`
        },
        source,
        path: "/api/billing/checkout",
        session,
        organizationId: session.organization!.id,
        userId: session.user.id,
        billingPlanCode: currentSubscription.plan.code
      });

      const portalUrl = await createStripeBillingPortalSession({
        organizationId: session.organization!.id,
        returnUrl: `${appUrl}/billing/return?status=portal`
      });

      return NextResponse.redirect(portalUrl);
    }

    const { checkoutUrl } = await createStripeCheckoutSession({
      organizationId: session.organization!.id,
      email: session.user.email,
      planCode: requestedPlanCode,
      successUrl: `${appUrl}/billing/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/billing/return?status=cancelled&planCode=${encodeURIComponent(canonicalPlanCode ?? requestedPlanCode)}`
    });

    return NextResponse.redirect(checkoutUrl);
  } catch (error) {
    console.error("Failed to create Stripe checkout session", error);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings?billing=error`
    );
  }
}
