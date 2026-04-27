import { getOptionalCurrentSession, isPasswordAuthEnabled } from "./auth";
import { getCurrentSubscription } from "./billing";
import {
  CANONICAL_COMMERCIAL_PLAN_CATALOG,
  type CanonicalPlanCode,
  getCanonicalCommercialPlanDefinition,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import { canManageBilling } from "./roles";
import {
  getFoundingRiskAuditCallUrl,
  getFoundingRiskAuditOfferUrl,
  getSalesContactEmail
} from "./runtime-config";
import { buildPricingAccessOnboardingPath, buildPricingAccessStartPath } from "./pricing-access";

export type PricingPlanCard = {
  code: CanonicalPlanCode;
  name: string;
  headline: string;
  description: string;
  publicDescription: string;
  priceLabel: string;
  priceUsd: number | null;
  billingMotion: "stripe_checkout" | "contact_sales";
  workflowCode: string;
  reportTemplate: string;
  processingDepth: string;
  isRecommended: boolean;
  recommendationLabel: string | null;
  highlights: string[];
};

export type PricingCta =
  | {
      kind: "link";
      href: string;
      label: string;
      helperText: string;
    }
  | {
      kind: "checkout";
      action: string;
      label: string;
      helperText: string;
      planCode: CanonicalPlanCode;
      disabled?: boolean;
    }
  | {
      kind: "portal";
      action: string;
      label: string;
      helperText: string;
    };

export type PricingPageData = {
  plans: PricingPlanCard[];
  sessionState: {
    isAuthenticated: boolean;
    onboardingRequired: boolean;
    organizationName: string | null;
    organizationRole: string | null;
    currentPlanCode: CanonicalPlanCode | null;
    currentPlanName: string | null;
  };
  ctasByPlanCode: Record<CanonicalPlanCode, PricingCta>;
  salesEmail: string;
  marketingLinks: {
    foundingRiskAuditHref: string;
    foundingRiskAuditCallHref: string;
  };
};

function buildPlanHighlights(planCode: CanonicalPlanCode) {
  switch (planCode) {
    case "starter":
      return [
        "Backend-owned audit routing",
        "Executive-ready snapshot delivery",
        "Evidence-backed assessment flow",
        "Stripe-hosted checkout"
      ];
    case "enterprise":
      return [
        "Sales-led rollout",
        "Custom governance motion",
        "Enterprise coordination",
        "Priority onboarding path"
      ];
    case "scale":
    default:
      return [
        "Primary audit operating path",
        "Deeper report delivery",
        "Monitoring and control scoring support",
        "Premium workflow depth"
      ];
  }
}

function buildPlanHeadline(planCode: CanonicalPlanCode) {
  switch (planCode) {
    case "starter":
      return "For lean teams that need a credible AI governance starting point without operational sprawl.";
    case "enterprise":
      return "For larger regulated programs that need custom rollout, stakeholder coordination, and sales-led packaging.";
    case "scale":
    default:
      return "For serious regulated teams that want the full operating path, deeper reporting, and stronger workflow coverage.";
  }
}

function buildPricingCta(input: {
  planCode: CanonicalPlanCode;
  isAuthenticated: boolean;
  onboardingRequired: boolean;
  organizationRole: string | null;
  currentPlanCode: CanonicalPlanCode | null;
  hasStripeCustomer: boolean;
}): PricingCta {
  const plan = getCanonicalCommercialPlanDefinition(input.planCode)!;

  if (plan.billingMotion === "contact_sales") {
    return {
      kind: "link",
      href: "/contact-sales?intent=enterprise-plan&source=pricing-page",
      label: "Contact sales",
      helperText: "Enterprise stays sales-led so scope, rollout, and commercial terms remain explicit."
    };
  }

  if (!input.isAuthenticated) {
    if (!isPasswordAuthEnabled()) {
      return {
        kind: "link",
        href: "/dashboard",
        label: plan.ctaLabel,
        helperText: "Demo mode routes directly into the workspace."
      };
    }

    return {
      kind: "link",
      href: buildPricingAccessStartPath(plan.code),
      label: plan.ctaLabel,
      helperText:
        "We will email secure login instructions and temporary credentials so you can start onboarding without waiting on a manual handoff."
    };
  }

  if (input.onboardingRequired) {
    return {
      kind: "link",
      href: buildPricingAccessOnboardingPath(plan.code),
      label: `Continue with ${plan.displayName}`,
      helperText: "Finish workspace setup and keep this plan selection attached to onboarding."
    };
  }

  if (input.currentPlanCode === plan.code) {
    if (canManageBilling(input.organizationRole) && input.hasStripeCustomer) {
      return {
        kind: "portal",
        action: "/api/billing/portal",
        label: "Manage in billing portal",
        helperText: "Review invoices and billing details in Stripe."
      };
    }

    return {
      kind: "link",
      href: "/dashboard/settings",
      label: "Current plan",
      helperText: "This workspace already aligns to this commercial plan."
    };
  }

  if (!canManageBilling(input.organizationRole)) {
    return {
      kind: "link",
      href: "/dashboard/settings",
      label: "View billing settings",
      helperText: "Only workspace owners and billing admins can start checkout."
    };
  }

  if (input.hasStripeCustomer && input.currentPlanCode) {
    return {
      kind: "portal",
      action: "/api/billing/portal",
      label: "Manage plan in billing portal",
      helperText: "Existing subscriptions stay managed through Stripe to avoid duplicate billing state."
    };
  }

  return {
    kind: "checkout",
    action: "/api/billing/checkout",
    label: plan.ctaLabel,
    helperText: "The app resolves the canonical plan and routes checkout safely through Stripe.",
    planCode: plan.code
  };
}

export async function getPricingPageData(): Promise<PricingPageData> {
  const session = await getOptionalCurrentSession();
  const hasWorkspaceSession =
    Boolean(session) && session?.authMode === "password";
  const workspaceOrganization = hasWorkspaceSession ? session?.organization : null;
  // Keep the public pricing route resilient even if a demo workspace is active.
  // The marketing page should not depend on seeded/demo Prisma reads to render.
  const currentSubscription = workspaceOrganization
    ? await getCurrentSubscription(workspaceOrganization.id)
    : null;
  const currentPlanCode =
    resolveCanonicalPlanCode(currentSubscription?.plan.code ?? null) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(currentSubscription?.plan.code ?? null);

  const plans = CANONICAL_COMMERCIAL_PLAN_CATALOG.map((plan) => ({
    code: plan.code,
    name: plan.displayName,
    headline: buildPlanHeadline(plan.code),
    description: plan.publicDescription,
    publicDescription: plan.publicDescription,
    priceLabel: plan.publicPriceLabel,
    priceUsd: plan.publicPriceUsd,
    billingMotion: plan.billingMotion,
    workflowCode: plan.workflowCode,
    reportTemplate: plan.reportTemplate,
    processingDepth: plan.processingDepth,
    isRecommended: plan.code === "scale",
    recommendationLabel: plan.code === "scale" ? "Primary offer" : null,
    highlights: buildPlanHighlights(plan.code)
  }));

  const ctasByPlanCode = Object.fromEntries(
    plans.map((plan) => [
      plan.code,
      buildPricingCta({
        planCode: plan.code,
        isAuthenticated: hasWorkspaceSession,
        onboardingRequired:
          hasWorkspaceSession ? (session?.onboardingRequired ?? false) : false,
        organizationRole: workspaceOrganization?.role ?? null,
        currentPlanCode,
        hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
      })
    ])
  ) as Record<CanonicalPlanCode, PricingCta>;

  return {
    plans,
    sessionState: {
      isAuthenticated: hasWorkspaceSession,
      onboardingRequired:
        hasWorkspaceSession ? (session?.onboardingRequired ?? false) : false,
      organizationName: workspaceOrganization?.name ?? null,
      organizationRole: workspaceOrganization?.role ?? null,
      currentPlanCode,
      currentPlanName:
        currentPlanCode
          ? getCanonicalCommercialPlanDefinition(currentPlanCode)?.displayName ?? null
          : null
    },
    ctasByPlanCode,
    salesEmail: getSalesContactEmail(),
    marketingLinks: {
      foundingRiskAuditHref: getFoundingRiskAuditOfferUrl(),
      foundingRiskAuditCallHref: getFoundingRiskAuditCallUrl()
    }
  };
}
