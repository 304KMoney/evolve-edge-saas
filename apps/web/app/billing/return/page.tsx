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
import {
  resolveBillingReturnDestination,
  resumeFirstCustomerJourneyAfterReadiness
} from "../../../lib/first-customer-journey";
import { getOrganizationAuditReadiness } from "../../../lib/audit-intake";

export const dynamic = "force-dynamic";

export default async function BillingReturnPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    session_id?: string;
    planCode?: string;
    billingCadence?: string;
  }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const params = await searchParams;
  const status = String(params.status ?? "");
  const checkoutSessionId = String(params.session_id ?? "");
  const planCode = String(params.planCode ?? "");
  const billingCadence = String(params.billingCadence ?? "");
  const retryParams = new URLSearchParams({ billing: "cancelled" });

  if (planCode) {
    retryParams.set("planCode", planCode);
  }

  if (billingCadence) {
    retryParams.set("billingCadence", billingCadence);
  }

  if (status === "cancelled") {
    redirect(
      resolveBillingReturnDestination({
        status: "cancelled",
        intakeComplete: true,
        queryString: retryParams.toString()
      }) as never
    );
  }

  if (status === "portal") {
    redirect(
      resolveBillingReturnDestination({
        status: "portal",
        intakeComplete: true
      }) as never
    );
  }

  if (status !== "success") {
    redirect(
      resolveBillingReturnDestination({
        status: "error",
        intakeComplete: true
      }) as never
    );
  }

  if (!checkoutSessionId || !hasStripeBillingConfig()) {
    const readiness = await getOrganizationAuditReadiness({
      organizationId: session.organization!.id
    });
    redirect(
      resolveBillingReturnDestination({
        status: "processing",
        intakeComplete: readiness.readyForAudit
      }) as never
    );
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

    const readiness = await getOrganizationAuditReadiness({
      organizationId: session.organization!.id
    });

    if (readiness.readyForAudit) {
      try {
        await resumeFirstCustomerJourneyAfterReadiness({
          organizationId: session.organization!.id,
          userId: session.user.id,
          source: "billing_return"
        });
      } catch (error) {
        logServerEvent("warn", "billing.return.first_customer_resume_failed", {
          org_id: session.organization!.id,
          user_id: session.user.id,
          status: "deferred",
          source: "billing-return",
          metadata: {
            message: error instanceof Error ? error.message : "Unknown resume error"
          }
        });
      }
    }

    redirect(
      resolveBillingReturnDestination({
        status: "success",
        intakeComplete: readiness.readyForAudit
      }) as never
    );
  } catch (error) {
    console.error("Failed to reconcile Stripe checkout return", error);
    const readiness = await getOrganizationAuditReadiness({
      organizationId: session.organization!.id
    });
    redirect(
      resolveBillingReturnDestination({
        status: "processing",
        intakeComplete: readiness.readyForAudit
      }) as never
    );
  }
}
