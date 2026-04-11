import { BillingAccessState, SubscriptionStatus } from "@evolve-edge/db";
import type { ActivationSnapshot } from "./activation";
import type { EntitlementSnapshot } from "./entitlements";
import type { OrganizationUsageMeteringSnapshot } from "./usage-metering";
import { getRevenuePlanDefinition, type RevenuePlanCode } from "./revenue-catalog";

export type RetentionHealthTone = "healthy" | "watch" | "at_risk" | "critical" | "reactivation";

export type RetentionSignal = {
  label: string;
  tone: "positive" | "warning" | "danger";
  detail: string;
};

export type RetentionAction =
  | {
      kind: "link";
      label: string;
      href: string;
      helperText?: string;
    }
  | {
      kind: "checkout" | "portal";
      label: string;
      action: string;
      source: string;
      helperText?: string;
      planCode?: RevenuePlanCode;
    };

export type RetentionSnapshot = {
  healthScore: number;
  healthTone: RetentionHealthTone;
  headline: string;
  summary: string;
  renewal: {
    label: string;
    dateLabel: string | null;
    daysRemaining: number | null;
    helperText: string;
  };
  usageDeclineWarning: {
    title: string;
    body: string;
  } | null;
  reactivationPrompt: {
    title: string;
    body: string;
    action: RetentionAction;
  } | null;
  saveOffer: {
    title: string;
    body: string;
    primaryAction: RetentionAction;
    secondaryAction?: RetentionAction;
  } | null;
  valueReminders: string[];
  signals: RetentionSignal[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getDaysUntil(date: Date | null | undefined) {
  if (!date) {
    return null;
  }

  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getTopUsagePressure(snapshot: OrganizationUsageMeteringSnapshot) {
  return snapshot.metrics
    .filter((metric) => metric.status === "warning" || metric.status === "exceeded")
    .sort((left, right) => (right.percentUsed ?? 0) - (left.percentUsed ?? 0))[0] ?? null;
}

function getRecommendedSavePlanCode(planCode: string | null): RevenuePlanCode | null {
  switch (planCode) {
    case "enterprise-annual":
      return "growth-annual";
    case "enterprise-monthly":
      return "growth-monthly";
    case "growth-annual":
      return "growth-monthly";
    default:
      return null;
  }
}

function buildRenewalSummary(input: {
  entitlements: EntitlementSnapshot;
}) {
  if (input.entitlements.isTrialing && input.entitlements.trialEndsAt) {
    const daysRemaining = getDaysUntil(input.entitlements.trialEndsAt);

    return {
      label: "Trial ends",
      dateLabel: formatDate(input.entitlements.trialEndsAt),
      daysRemaining,
      helperText:
        daysRemaining !== null && daysRemaining <= 5
          ? "Trial access is nearing the end of the current evaluation window."
          : "The current evaluation window is still open."
    };
  }

  if (input.entitlements.currentPeriodEnd) {
    const daysRemaining = getDaysUntil(input.entitlements.currentPeriodEnd);

    return {
      label: input.entitlements.cancelAtPeriodEnd ? "Access ends" : "Next renewal",
      dateLabel: formatDate(input.entitlements.currentPeriodEnd),
      daysRemaining,
      helperText: input.entitlements.cancelAtPeriodEnd
        ? "The subscription is scheduled to end at the close of the current billing period."
        : "The current subscription remains active through the end of this billing period."
    };
  }

  return {
    label: "Billing status",
    dateLabel: null,
    daysRemaining: null,
    helperText: "No future billing date is recorded for this workspace yet."
  };
}

function buildValueReminders(input: {
  activation: ActivationSnapshot;
  assessmentsCount: number;
  reportsCount: number;
  findingsCount: number;
  monitoredAssetsCount: number;
}) {
  const reminders: string[] = [];

  if (input.reportsCount > 0) {
    reminders.push(
      `${input.reportsCount} executive ${input.reportsCount === 1 ? "report has" : "reports have"} already been generated for this workspace.`
    );
  }

  if (input.findingsCount > 0) {
    reminders.push(
      `${input.findingsCount} compliance ${input.findingsCount === 1 ? "gap has" : "gaps have"} already been surfaced from live workflows.`
    );
  }

  if (input.monitoredAssetsCount > 0) {
    reminders.push(
      `${input.monitoredAssetsCount} monitored ${input.monitoredAssetsCount === 1 ? "asset is" : "assets are"} now tracked in the workspace.`
    );
  }

  if (!input.activation.isActivated && input.assessmentsCount > 0) {
    reminders.push(
      "This workspace already has live assessment data, so reaching the first executive report should take less setup than a brand-new account."
    );
  }

  return reminders;
}

function getHealthTone(score: number, input: { workspaceMode: EntitlementSnapshot["workspaceMode"] }) {
  if (input.workspaceMode === "INACTIVE" || input.workspaceMode === "READ_ONLY") {
    return "reactivation" as const;
  }

  if (score >= 80) {
    return "healthy" as const;
  }

  if (score >= 60) {
    return "watch" as const;
  }

  if (score >= 40) {
    return "at_risk" as const;
  }

  return "critical" as const;
}

export function getOrganizationRetentionSnapshot(input: {
  entitlements: EntitlementSnapshot;
  activation: ActivationSnapshot;
  usageMetering: OrganizationUsageMeteringSnapshot;
  assessmentsCount: number;
  reportsCount: number;
  findingsCount: number;
  monitoredAssetsCount: number;
  memberCount: number;
  currentPlanCode: string | null;
  hasStripeCustomer: boolean;
}): RetentionSnapshot {
  const renewal = buildRenewalSummary({
    entitlements: input.entitlements
  });
  const topUsagePressure = getTopUsagePressure(input.usageMetering);
  const daysSinceLastActivity = input.entitlements.lastActivityAt
    ? Math.floor((Date.now() - input.entitlements.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isUsageDeclining =
    input.activation.isActivated &&
    daysSinceLastActivity !== null &&
    daysSinceLastActivity >= 14;
  const isRenewalRisk =
    renewal.daysRemaining !== null &&
    renewal.daysRemaining <= 21 &&
    !input.entitlements.cancelAtPeriodEnd;
  const isCancellationScheduled = input.entitlements.cancelAtPeriodEnd;

  let healthScore = 55;
  if (input.activation.isActivated) healthScore += 18;
  if (input.reportsCount > 0) healthScore += 8;
  if (input.findingsCount > 0) healthScore += 5;
  if (input.monitoredAssetsCount > 0) healthScore += 4;
  if (input.memberCount > 1) healthScore += 4;
  if (daysSinceLastActivity !== null && daysSinceLastActivity <= 7) healthScore += 8;
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 21) healthScore -= 18;
  if (topUsagePressure?.status === "exceeded") healthScore -= 8;
  if (input.entitlements.billingAccessState === BillingAccessState.PAST_DUE) healthScore -= 18;
  if (isCancellationScheduled) healthScore -= 22;
  if (input.entitlements.workspaceMode === "INACTIVE") healthScore = 18;
  if (input.entitlements.workspaceMode === "READ_ONLY") healthScore = Math.min(healthScore, 38);
  healthScore = clampScore(healthScore);

  const healthTone = getHealthTone(healthScore, {
    workspaceMode: input.entitlements.workspaceMode
  });

  const signals: RetentionSignal[] = [
    {
      label: "Activation status",
      tone: input.activation.isActivated ? "positive" : "warning",
      detail: input.activation.isActivated
        ? "The workspace has already reached first value with a live executive report."
        : "The workspace has not yet reached the first-value milestone."
    },
    {
      label: "Recent product activity",
      tone:
        daysSinceLastActivity === null
          ? "warning"
          : daysSinceLastActivity <= 7
            ? "positive"
            : daysSinceLastActivity <= 14
              ? "warning"
              : "danger",
      detail:
        daysSinceLastActivity === null
          ? "No recent in-product activity has been recorded yet."
          : daysSinceLastActivity === 0
            ? "Product activity was recorded today."
            : `Last meaningful activity was ${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? "" : "s"} ago.`
    },
    {
      label: "Billing lifecycle",
      tone:
        input.entitlements.workspaceMode === "SUBSCRIPTION" && !isCancellationScheduled
          ? "positive"
          : input.entitlements.workspaceMode === "TRIAL"
            ? "warning"
            : "danger",
      detail: isCancellationScheduled
        ? "Cancellation is scheduled at the end of the current term."
        : input.entitlements.subscriptionStatus === SubscriptionStatus.TRIALING
          ? "The workspace is still in the evaluation window."
          : input.entitlements.workspaceMode === "READ_ONLY"
            ? "Billing friction is already reducing product access."
            : "Billing access is currently healthy."
    }
  ];

  if (topUsagePressure) {
    signals.push({
      label: "Capacity pressure",
      tone: topUsagePressure.status === "exceeded" ? "danger" : "warning",
      detail: `${topUsagePressure.label} is currently ${topUsagePressure.usageLabel.toLowerCase()}.`
    });
  }

  const savePlanCode = getRecommendedSavePlanCode(input.currentPlanCode);
  const savePlan = getRevenuePlanDefinition(savePlanCode);

  const shouldShowSaveOffer =
    isCancellationScheduled ||
    input.entitlements.workspaceMode === "READ_ONLY" ||
    ((isRenewalRisk || isUsageDeclining || topUsagePressure?.status === "exceeded") &&
      input.hasStripeCustomer &&
      Boolean(savePlanCode));

  const saveOffer =
    shouldShowSaveOffer
      ? {
          title: savePlan
            ? `Keep the workspace live on ${savePlan.name}`
            : "Keep the workspace accessible with a lower-friction plan",
          body: savePlan
            ? `${savePlan.name} keeps monitoring, reporting, and historical records available while lowering commitment compared with a full cancellation.`
            : "If the current plan is too large for this cycle, a lower-commitment billing option is usually safer than losing continuity across assessments and reports.",
          primaryAction:
            input.hasStripeCustomer
              ? {
                  kind: "portal" as const,
                  label: savePlan ? `Review ${savePlan.name} in Stripe` : "Review lower-commitment options",
                  action: "/api/billing/portal",
                  source: "retention-save-offer",
                  helperText: "Use the Stripe billing portal to switch plans or remove a scheduled cancellation."
                }
              : savePlanCode
                ? {
                    kind: "checkout" as const,
                    label: `Choose ${savePlan?.name ?? "new plan"}`,
                    action: "/api/billing/checkout",
                    planCode: savePlanCode,
                    source: "retention-save-offer",
                    helperText: "Start a new billing session on the lower-commitment plan."
                  }
                : {
                    kind: "link" as const,
                    label: "Review pricing options",
                    href: "/pricing",
                    helperText: "Compare current plan options before leaving the workspace inactive."
                  },
          secondaryAction: {
            kind: "link" as const,
            label: "Talk to support",
            href: "/contact-sales?intent=premium-support&source=retention-save-offer",
            helperText: "Ask for rollout help, procurement support, or a right-sized plan recommendation."
          }
        }
      : null;

  const reactivationPrompt =
    input.entitlements.workspaceMode === "READ_ONLY" || input.entitlements.workspaceMode === "INACTIVE"
      ? {
          title:
            input.entitlements.workspaceMode === "READ_ONLY"
              ? "Restore live workspace access"
              : "Reactivate the workspace before the next review cycle",
          body:
            input.entitlements.workspaceMode === "READ_ONLY"
              ? "Historical records remain available, but new assessments and fresh report generation are limited until billing is restored."
              : "The workspace is inactive today. Reactivating billing restores assessments, reporting, monitoring, and expansion paths without rebuilding the account.",
          action: input.hasStripeCustomer
            ? {
                kind: "portal" as const,
                label: "Open billing portal",
                action: "/api/billing/portal",
                source: "retention-reactivation",
                helperText: "Restore billing or adjust the current subscription in Stripe."
              }
            : {
                kind: "link" as const,
                label: "View pricing",
                href: "/pricing",
                helperText: "Choose a plan to restore full product access."
              }
        }
      : null;

  const usageDeclineWarning = isUsageDeclining
    ? {
        title: "Usage has cooled since the last value milestone",
        body:
          "The workspace has gone quiet for more than two weeks after reaching live product value. A reassessment, executive review, or inventory refresh is the fastest way to reinforce ongoing value."
      }
    : null;

  let headline = "Healthy renewal posture";
  let summary = "This workspace is showing the mix of product activity, live value, and billing continuity that supports a straightforward renewal.";

  if (input.entitlements.workspaceMode === "INACTIVE") {
    headline = "Workspace needs reactivation";
    summary = "The account is currently inactive. The priority is restoring billing before the next compliance or reporting cycle is missed.";
  } else if (input.entitlements.workspaceMode === "READ_ONLY") {
    headline = "Billing friction is reducing product access";
    summary = "The workspace still holds valuable history, but retention risk is elevated until billing is restored or the plan is right-sized.";
  } else if (isCancellationScheduled) {
    headline = "Cancellation risk is active";
    summary = "The subscription is already scheduled to end, so retention should focus on plan fit, procurement friction, and visible business value.";
  } else if (isUsageDeclining) {
    headline = "Activity is trending down";
    summary = "The account has already seen value, but recent usage has slowed enough that a renewal reminder or success motion is warranted.";
  } else if (isRenewalRisk) {
    headline = "Renewal window is approaching";
    summary = "The next billing milestone is close enough that plan clarity and value reminders should stay visible to the account owner.";
  }

  return {
    healthScore,
    healthTone,
    headline,
    summary,
    renewal,
    usageDeclineWarning,
    reactivationPrompt,
    saveOffer,
    valueReminders: buildValueReminders({
      activation: input.activation,
      assessmentsCount: input.assessmentsCount,
      reportsCount: input.reportsCount,
      findingsCount: input.findingsCount,
      monitoredAssetsCount: input.monitoredAssetsCount
    }),
    signals
  };
}
