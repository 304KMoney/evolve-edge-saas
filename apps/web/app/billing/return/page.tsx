import { redirect } from "next/navigation";
import { requireCurrentSession } from "../../../lib/auth";
import {
  getCurrentSubscription,
  hasStripeBillingConfig,
  synchronizeStripeCheckoutSession
} from "../../../lib/billing";
import { getLatestLeadSubmissionForConversion } from "../../../lib/lead-pipeline";
import { logServerEvent } from "../../../lib/monitoring";
import { createPaymentCustomerBinding } from "../../../lib/payment-customer-binding";
import { trackProductAnalyticsEvent } from "../../../lib/product-analytics";
import { getPlanTransitionDirection } from "../../../lib/revenue-catalog";

export const dynamic = "force-dynamic";

export default async function BillingReturnPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    session_id?: string;
  }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const params = await searchParams;
  const status = String(params.status ?? "");
  const checkoutSessionId = String(params.session_id ?? "");

  if (status === "cancelled") {
    redirect("/dashboard/settings?billing=cancelled");
  }

  if (status === "portal") {
    redirect("/dashboard/settings?billing=portal-returned");
  }

  if (status !== "success") {
    redirect("/dashboard/settings?billing=error");
  }

  if (!checkoutSessionId || !hasStripeBillingConfig()) {
    redirect("/dashboard/settings?billing=processing");
  }

  try {
    const previousSubscription = await getCurrentSubscription(session.organization!.id);
    const leadSubmission = await getLatestLeadSubmissionForConversion({
      organizationId: session.organization!.id,
      userId: session.user.id,
      email: session.user.email
    });
    const syncedSubscription = await synchronizeStripeCheckoutSession({
      organizationId: session.organization!.id,
      checkoutSessionId
    });

    if (!syncedSubscription) {
      redirect("/dashboard/settings?billing=processing");
    }

    const paymentBinding = createPaymentCustomerBinding({
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentReference: syncedSubscription.stripeSubscriptionId ?? null,
      customerEmail: session.user.email,
      selectedPlan:
        leadSubmission?.requestedPlanCode ?? syncedSubscription.plan.code,
      organizationId: session.organization!.id,
      customerId: session.user.id,
      bindingStatus: "organization_bound"
    });

    await trackProductAnalyticsEvent({
      name: "billing.checkout_completed",
      payload: {
        planCode: syncedSubscription.plan.code,
        transition: getPlanTransitionDirection(
          previousSubscription?.plan.code ?? null,
          syncedSubscription.plan.code
        )
      },
      source: "billing-return",
      path: "/billing/return",
      session,
      organizationId: session.organization!.id,
      userId: session.user.id,
      billingPlanCode: syncedSubscription.plan.code
    });

    await trackProductAnalyticsEvent({
      name: "funnel.lead_to_paid",
      payload: {
        planCode: syncedSubscription.plan.code,
        leadSource: leadSubmission?.source ?? null,
        requestedPlanCode: leadSubmission?.requestedPlanCode ?? null
      },
      source: "billing-return",
      path: "/billing/return",
      session,
      organizationId: session.organization!.id,
      userId: session.user.id,
      billingPlanCode: syncedSubscription.plan.code
    });

    logServerEvent("info", "billing.checkout.binding_reconciled", {
      org_id: session.organization!.id,
      user_id: session.user.id,
      status: "reconciled",
      source: "billing-return",
      metadata: paymentBinding
    });

    redirect("/dashboard/settings?billing=success");
  } catch (error) {
    console.error("Failed to reconcile Stripe checkout return", error);
    redirect("/dashboard/settings?billing=processing");
  }
}
