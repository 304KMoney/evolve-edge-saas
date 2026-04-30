import type { AppSession } from "./auth";
import type { EntitlementSnapshot } from "./entitlements";
import type {
  OrganizationUsageMeteringSnapshot,
  UsageMetricKey,
  UsageMetricSnapshot
} from "./usage-metering";
import {
  FeatureKey,
  RevenuePlanCode,
  getRevenuePlanCatalog,
  getRevenuePlanDefinition
} from "./revenue-catalog";
import { shouldBlockDemoExternalSideEffects } from "./demo-mode";
import { canManageBilling, canOperateWorkspace } from "./roles";

export type UpsellPlacement =
  | "dashboard"
  | "assessments"
  | "reports"
  | "settings";

export type UpsellAccountMaturity =
  | "new_user"
  | "active_user"
  | "limit_reached"
  | "admin_user";

export type UpsellOfferType =
  | "plan_upgrade"
  | "addon"
  | "premium_report"
  | "seat_pack"
  | "asset_pack"
  | "white_glove_onboarding"
  | "premium_support";

export type UpsellOfferPriority = "high" | "medium" | "low";

export type UpsellOfferCta =
  | {
      kind: "checkout";
      label: string;
      helperText: string;
      action: "/api/billing/checkout";
      planCode: RevenuePlanCode;
    }
  | {
      kind: "portal";
      label: string;
      helperText: string;
      action: "/api/billing/portal";
    }
  | {
      kind: "link";
      label: string;
      helperText: string;
      href: string;
    };

export type ResolvedUpsellOffer = {
  key: string;
  placement: UpsellPlacement;
  type: UpsellOfferType;
  priority: UpsellOfferPriority;
  accountMaturity: UpsellAccountMaturity;
  badge: string;
  title: string;
  body: string;
  bullets: string[];
  trigger: string;
  cta: UpsellOfferCta;
};

type ExpansionContext = {
  placement: UpsellPlacement;
  session: AppSession;
  entitlements: EntitlementSnapshot;
  usageMetering: OrganizationUsageMeteringSnapshot;
  currentPlanCode: string | null;
  hasStripeCustomer: boolean;
};

type ContactSalesIntent =
  | "seat-pack"
  | "asset-pack"
  | "premium-reports"
  | "premium-support"
  | "white-glove-onboarding"
  | "enterprise-expansion";

type AddOnCatalogEntry = {
  key: ContactSalesIntent;
  badge: string;
  title: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHelperText: string;
};

const ADD_ON_CATALOG: Record<ContactSalesIntent, AddOnCatalogEntry> = {
  "seat-pack": {
    key: "seat-pack",
    badge: "Seat expansion",
    title: "Add extra seats without redesigning the rollout.",
    body:
      "For workspaces growing beyond the standard seat envelope, route the expansion request into sales with clear team-sizing context.",
    bullets: [
      "Preserves role-based access without forcing seat workarounds.",
      "Creates a clean hook for future seat-pack billing."
    ],
    ctaLabel: "Request seat expansion",
    ctaHelperText: "Route this account to a commercial expansion conversation."
  },
  "asset-pack": {
    key: "asset-pack",
    badge: "Monitoring expansion",
    title: "Expand monitored asset capacity for broader production coverage.",
    body:
      "When the inventory outgrows the standard plan envelope, convert that operational need into a monitored-asset expansion path.",
    bullets: [
      "Supports broader vendor and model registry coverage.",
      "Keeps compliance tracking aligned with the real production estate."
    ],
    ctaLabel: "Request asset pack",
    ctaHelperText: "Capture demand for monitored asset expansion."
  },
  "premium-reports": {
    key: "premium-reports",
    badge: "Executive deliverables",
    title: "Offer premium reporting support for stakeholder-ready deliverables.",
    body:
      "Accounts producing more executive artifacts can be steered toward premium report packaging, workshops, or delivery support.",
    bullets: [
      "Supports board-ready and regulator-facing reporting motions.",
      "Creates a future monetization hook for premium report add-ons."
    ],
    ctaLabel: "Discuss premium reports",
    ctaHelperText: "Use the sales path for premium report packaging."
  },
  "premium-support": {
    key: "premium-support",
    badge: "Priority support",
    title: "Upgrade to premium support for faster compliance operations.",
    body:
      "Active programs often need quicker operational responses, implementation advice, and stakeholder coordination than standard support covers.",
    bullets: [
      "Creates a future path for support SLAs or named support tiers.",
      "Fits naturally for owners and admins running recurring governance cycles."
    ],
    ctaLabel: "Request premium support",
    ctaHelperText: "Start a support tier conversation."
  },
  "white-glove-onboarding": {
    key: "white-glove-onboarding",
    badge: "Implementation support",
    title: "Offer white-glove onboarding when the rollout needs extra certainty.",
    body:
      "Newer accounts with serious executive visibility can convert faster with a guided rollout, framework setup, and stakeholder planning support.",
    bullets: [
      "Reduces setup friction for regulated teams.",
      "Creates a monetizable implementation-services hook without moving product logic out of the app."
    ],
    ctaLabel: "Book onboarding help",
    ctaHelperText: "Route to sales for rollout support."
  },
  "enterprise-expansion": {
    key: "enterprise-expansion",
    badge: "Enterprise expansion",
    title: "Move this account into a broader enterprise rollout.",
    body:
      "When a team has outgrown standard plan mechanics, hand the opportunity to sales with clear commercial context instead of blocking the operator.",
    bullets: [
      "Supports enterprise custom commercial packaging.",
      "Keeps room for future custom plans and negotiated add-ons."
    ],
    ctaLabel: "Talk to sales",
    ctaHelperText: "Open an enterprise expansion path."
  }
};

function getOfferToneBadge(type: UpsellOfferType) {
  switch (type) {
    case "plan_upgrade":
      return "Plan upgrade";
    case "seat_pack":
      return "Seat add-on";
    case "asset_pack":
      return "Asset add-on";
    case "premium_report":
      return "Premium reports";
    case "premium_support":
      return "Premium support";
    case "white_glove_onboarding":
      return "White-glove onboarding";
    default:
      return "Expansion path";
  }
}

function buildContactSalesHref(intent: ContactSalesIntent, source: UpsellPlacement) {
  const searchParams = new URLSearchParams({
    intent,
    source
  });
  return `/contact-sales?${searchParams.toString()}`;
}

function buildContactSalesCta(
  intent: ContactSalesIntent,
  source: UpsellPlacement
): UpsellOfferCta {
  const entry = ADD_ON_CATALOG[intent];

  return {
    kind: "link",
    href: buildContactSalesHref(intent, source),
    label: entry.ctaLabel,
    helperText: entry.ctaHelperText
  };
}

function buildDemoModeBillingCta(): UpsellOfferCta {
  return {
    kind: "link",
    href: "/dashboard/settings?billing=demo-mode#billing-controls",
    label: "Review billing status",
    helperText:
      "Billing changes stay disabled in demo mode so the workspace can be explored safely without opening live Stripe flows."
  };
}

function getHighestUsageMetric(
  usageMetering: OrganizationUsageMeteringSnapshot,
  keys: UsageMetricKey[]
) {
  return keys
    .map((key) => usageMetering.metrics.find((metric) => metric.key === key) ?? null)
    .filter((metric): metric is UsageMetricSnapshot => Boolean(metric))
    .sort((left, right) => (right.percentUsed ?? 0) - (left.percentUsed ?? 0))[0] ?? null;
}

export function getUpsellAccountMaturity(input: {
  session: AppSession;
  entitlements: EntitlementSnapshot;
  usageMetering: OrganizationUsageMeteringSnapshot;
}) {
  if (input.usageMetering.topWarning) {
    return "limit_reached" as const;
  }

  if (
    input.entitlements.activeAssessments <= 1 &&
    input.entitlements.reportsGenerated === 0 &&
    input.usageMetering.metrics.every((metric) => metric.used <= 1)
  ) {
    return "new_user" as const;
  }

  if (canOperateWorkspace(input.session.organization?.role)) {
    return "admin_user" as const;
  }

  return "active_user" as const;
}

function selectUpgradePlan(input: {
  currentPlanCode: string | null;
  metricKey?: UsageMetricKey;
  featureKey?: FeatureKey;
}) {
  const currentPlan = getRevenuePlanDefinition(input.currentPlanCode);
  const allPlans = getRevenuePlanCatalog().filter((plan) => plan.isActive && plan.isPublic);

  if (!currentPlan) {
    return allPlans.find((plan) => plan.code === "growth-annual") ?? allPlans[0] ?? null;
  }

  const candidates = currentPlan.adminMetadata.upgradeTo
    .map((code) => getRevenuePlanDefinition(code))
    .filter((plan): plan is NonNullable<ReturnType<typeof getRevenuePlanDefinition>> =>
      Boolean(plan?.isActive && plan?.isPublic)
    );

  if (candidates.length === 0) {
    return null;
  }

  const improvedCandidates = candidates.filter((candidate) => {
    if (input.metricKey) {
      const currentLimit = currentPlan.usageLimits[input.metricKey];
      const candidateLimit = candidate.usageLimits[input.metricKey];

      if (candidateLimit === null) {
        return true;
      }

      return (currentLimit ?? 0) < candidateLimit;
    }

    if (input.featureKey) {
      return !currentPlan.features[input.featureKey] && candidate.features[input.featureKey];
    }

    return true;
  });

  return (improvedCandidates[0] ?? candidates[0]) ?? null;
}

function resolveUpgradeCta(input: ExpansionContext, targetPlanCode: RevenuePlanCode): UpsellOfferCta {
  if (shouldBlockDemoExternalSideEffects()) {
    return buildDemoModeBillingCta();
  }

  if (!canManageBilling(input.session.organization?.role)) {
    return {
      kind: "link",
      href: "/dashboard/settings",
      label: "Ask the workspace owner",
      helperText: "Only owners can make billing changes for this workspace."
    };
  }

  if (input.hasStripeCustomer && input.currentPlanCode) {
    return {
      kind: "portal",
      action: "/api/billing/portal",
      label: "Manage in Stripe",
      helperText: "Open the Stripe portal to update the subscription safely."
    };
  }

  return {
    kind: "checkout",
    action: "/api/billing/checkout",
    label: "Upgrade plan",
    helperText: "Launch Stripe checkout with the recommended plan pre-selected.",
    planCode: targetPlanCode
  };
}

function buildUpgradeOffer(input: ExpansionContext, metric: UsageMetricSnapshot): ResolvedUpsellOffer | null {
  const targetPlan = selectUpgradePlan({
    currentPlanCode: input.currentPlanCode,
    metricKey: metric.key
  });

  if (!targetPlan) {
    const fallbackCta = buildContactSalesCta("enterprise-expansion", input.placement);

    return {
      key: `${input.placement}-${metric.key}-enterprise-expansion`,
      placement: input.placement,
      type: "plan_upgrade",
      priority: metric.status === "exceeded" ? "high" : "medium",
      accountMaturity: getUpsellAccountMaturity(input),
      badge: "Enterprise expansion",
      title: "This account is ready for a broader commercial package.",
      body: `${metric.upgradeBody} Enterprise expansion can add more capacity without forcing the team into a dead end.`,
      bullets: [
        "Preserves operator momentum when the workspace outgrows standard limits.",
        "Creates room for custom packaging and future add-on billing."
      ],
      trigger: `${metric.key}:${metric.status}`,
      cta: fallbackCta
    };
  }

  return {
    key: `${input.placement}-${metric.key}-${targetPlan.code}`,
    placement: input.placement,
    type: "plan_upgrade",
    priority: metric.status === "exceeded" ? "high" : "medium",
    accountMaturity: getUpsellAccountMaturity(input),
    badge: getOfferToneBadge("plan_upgrade"),
    title: `Unlock more ${metric.label.toLowerCase()} with ${targetPlan.name}.`,
    body: `${metric.upgradeBody} ${targetPlan.name} gives this workspace more operating room without changing the product workflow.`,
    bullets: [
      `${metric.label} expands from ${metric.limit ?? "the current allowance"} to ${targetPlan.usageLimits[metric.key] ?? "a higher custom threshold"}.`,
      "Preserves the current billing and entitlement flow with a plan-aware upgrade path."
    ],
    trigger: `${metric.key}:${metric.status}`,
    cta: resolveUpgradeCta(input, targetPlan.code)
  };
}

function buildFeatureUpgradeOffer(
  input: ExpansionContext,
  featureKey: FeatureKey,
  offerType: UpsellOfferType,
  title: string,
  body: string,
  bullets: string[]
): ResolvedUpsellOffer | null {
  if (input.entitlements.features[featureKey]) {
    return null;
  }

  const targetPlan = selectUpgradePlan({
    currentPlanCode: input.currentPlanCode,
    featureKey
  });

  if (!targetPlan) {
    return null;
  }

  return {
    key: `${input.placement}-${featureKey}-${targetPlan.code}`,
    placement: input.placement,
    type: offerType,
    priority: "medium",
    accountMaturity: getUpsellAccountMaturity(input),
    badge: getOfferToneBadge(offerType),
    title,
    body,
    bullets,
    trigger: `feature:${featureKey}`,
    cta: resolveUpgradeCta(input, targetPlan.code)
  };
}

function buildAddOnOffer(
  input: ExpansionContext,
  intent: ContactSalesIntent,
  type: UpsellOfferType,
  trigger: string,
  priority: UpsellOfferPriority
): ResolvedUpsellOffer {
  const entry = ADD_ON_CATALOG[intent];

  return {
    key: `${input.placement}-${entry.key}`,
    placement: input.placement,
    type,
    priority,
    accountMaturity: getUpsellAccountMaturity(input),
    badge: entry.badge,
    title: entry.title,
    body: entry.body,
    bullets: entry.bullets,
    trigger,
    cta: buildContactSalesCta(intent, input.placement)
  };
}

export function getExpansionOffers(input: ExpansionContext): ResolvedUpsellOffer[] {
  const offers: ResolvedUpsellOffer[] = [];
  const accountMaturity = getUpsellAccountMaturity(input);
  const topWarning = input.usageMetering.topWarning;

  if (input.placement === "dashboard" && topWarning) {
    const upgradeOffer = buildUpgradeOffer(input, topWarning);
    if (upgradeOffer) {
      offers.push(upgradeOffer);
    }
  }

  if (input.placement === "assessments") {
    const metric = getHighestUsageMetric(input.usageMetering, ["activeAssessments"]);
    if (metric && (metric.status === "warning" || metric.status === "exceeded")) {
      const offer = buildUpgradeOffer(input, metric);
      if (offer) {
        offers.push(offer);
      }
    } else if (accountMaturity === "new_user") {
      offers.push(
        buildAddOnOffer(
          input,
          "white-glove-onboarding",
          "white_glove_onboarding",
          "maturity:new-user",
          "low"
        )
      );
    }
  }

  if (input.placement === "reports") {
    const metric = getHighestUsageMetric(input.usageMetering, [
      "reportsGenerated",
      "aiProcessingRuns"
    ]);
    if (metric && (metric.status === "warning" || metric.status === "exceeded")) {
      const offer = buildUpgradeOffer(input, metric);
      if (offer) {
        offers.push(offer);
      }
    } else {
      const featureOffer = buildFeatureUpgradeOffer(
        input,
        "executiveReviews",
        "premium_report",
        "Unlock executive review workflows for stakeholder-ready reports.",
        "Premium report packaging belongs where executive reporting already happens, so the offer appears only when the account is actively producing deliverables.",
        [
          "Supports higher-trust reporting motions for leadership and external stakeholders.",
          "Creates a direct path into enterprise-tier reporting workflows."
        ]
      );

      if (featureOffer) {
        offers.push(featureOffer);
      } else if (accountMaturity !== "new_user") {
        offers.push(
          buildAddOnOffer(
            input,
            "premium-reports",
            "premium_report",
            "reports:premium-package",
            "low"
          )
        );
      }
    }
  }

  if (input.placement === "settings") {
    const seatsMetric = getHighestUsageMetric(input.usageMetering, ["seats"]);
    const assetsMetric = getHighestUsageMetric(input.usageMetering, ["monitoredAssets"]);

    if (seatsMetric && (seatsMetric.status === "warning" || seatsMetric.status === "exceeded")) {
      const seatUpgradeOffer = buildUpgradeOffer(input, seatsMetric);
      if (seatUpgradeOffer) {
        offers.push(seatUpgradeOffer);
      }

      offers.push(
        buildAddOnOffer(
          input,
          "seat-pack",
          "seat_pack",
          `usage:${seatsMetric.key}:${seatsMetric.status}`,
          seatsMetric.status === "exceeded" ? "high" : "medium"
        )
      );
    }

    if (assetsMetric && (assetsMetric.status === "warning" || assetsMetric.status === "exceeded")) {
      offers.push(
        buildAddOnOffer(
          input,
          "asset-pack",
          "asset_pack",
          `usage:${assetsMetric.key}:${assetsMetric.status}`,
          assetsMetric.status === "exceeded" ? "high" : "medium"
        )
      );
    }

    if (canOperateWorkspace(input.session.organization?.role)) {
      if (!input.entitlements.features.prioritySupport) {
        const supportUpgradeOffer = buildFeatureUpgradeOffer(
          input,
          "prioritySupport",
          "premium_support",
          "Add priority support for a faster operating rhythm.",
          "Owners and admins are the right audience for support-tier expansion, because they feel operational friction first.",
          [
            "Creates a monetization path for named support or support SLAs.",
            "Fits recurring governance programs better than generic help-center prompts."
          ]
        );

        if (supportUpgradeOffer) {
          offers.push(supportUpgradeOffer);
        } else {
          offers.push(
            buildAddOnOffer(
              input,
              "premium-support",
              "premium_support",
              "feature:priority-support",
              "low"
            )
          );
        }
      }

      if (accountMaturity === "new_user") {
        offers.push(
          buildAddOnOffer(
            input,
            "white-glove-onboarding",
            "white_glove_onboarding",
            "maturity:new-user-admin",
            "low"
          )
        );
      }
    }
  }

  if (input.placement === "dashboard" && offers.length === 0) {
    if (accountMaturity === "new_user") {
      offers.push(
        buildAddOnOffer(
          input,
          "white-glove-onboarding",
          "white_glove_onboarding",
          "dashboard:new-user",
          "low"
        )
      );
    } else if (accountMaturity === "admin_user") {
      offers.push(
        buildAddOnOffer(
          input,
          "premium-support",
          "premium_support",
          "dashboard:admin-user",
          "low"
        )
      );
    }
  }

  return offers
    .slice()
    .sort((left, right) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[right.priority] - priorityWeight[left.priority];
    })
    .slice(0, input.placement === "settings" ? 3 : 2);
}
