import type { EntitlementSnapshot } from "./entitlements";
import type { UsageMetricSnapshot } from "./usage-metering";
import type { UsageQuotaKey, UsageRemainingSnapshot } from "./usage-quotas";

export type ProductSurfaceArea =
  | "dashboard"
  | "reports"
  | "evidence"
  | "monitoring";

export type ProductSurfaceCardStatus =
  | "ok"
  | "warning"
  | "exceeded"
  | "unlimited"
  | "locked";

export type ProductSurfaceCard = {
  key: string;
  label: string;
  value: string;
  helperText: string;
  status: ProductSurfaceCardStatus;
};

export type ProductSurfaceCalloutTone = "neutral" | "warning" | "danger";

export type ProductSurfaceCallout = {
  tone: ProductSurfaceCalloutTone;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
};

export type ProductSurfaceModel = {
  title: string;
  description: string;
  planName: string;
  planDetail: string;
  workspaceModeLabel: string;
  cards: ProductSurfaceCard[];
  callout: ProductSurfaceCallout | null;
};

type BuildProductSurfaceModelInput = {
  area: ProductSurfaceArea;
  entitlements: Pick<
    EntitlementSnapshot,
    | "planName"
    | "workspaceMode"
    | "trialEndsAt"
    | "currentPeriodEnd"
    | "canAccessReports"
    | "canGenerateReports"
    | "featureAccess"
  >;
  usageMetrics?: UsageMetricSnapshot[];
  quotas?: Array<{
    key: UsageQuotaKey;
    label: string;
    snapshot: UsageRemainingSnapshot;
  }>;
};

type AreaContent = {
  title: string;
  description: string;
  planDetail: string;
  lockedCallout: ProductSurfaceCallout | null;
};

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getQuotaActionLabel(key: UsageQuotaKey) {
  switch (key) {
    case "audits":
      return "Upgrade assessment capacity";
    case "evidence_uploads":
      return "Upgrade evidence capacity";
    case "documents_processed":
      return "Upgrade processing capacity";
  }
}

function formatQuotaValue(snapshot: UsageRemainingSnapshot) {
  if (snapshot.isUnlimited) {
    return `${formatCount(snapshot.used)} used`;
  }

  return `${formatCount(snapshot.used)} of ${formatCount(snapshot.limit ?? 0)}`;
}

function formatQuotaHelperText(snapshot: UsageRemainingSnapshot) {
  if (snapshot.isUnlimited) {
    return "Tracked for visibility on the current plan without a hard monthly cap.";
  }

  if (snapshot.remaining === 0) {
    return "No monthly capacity remains on the current plan.";
  }

  return `${formatCount(snapshot.remaining ?? 0)} remaining in the current monthly window.`;
}

function formatWorkspaceModeLabel(
  entitlements: Pick<
    EntitlementSnapshot,
    "workspaceMode" | "trialEndsAt" | "currentPeriodEnd"
  >
) {
  switch (entitlements.workspaceMode) {
    case "DEMO":
      return "Demo workspace";
    case "TRIAL":
      return `Trial until ${formatDate(entitlements.trialEndsAt)}`;
    case "SUBSCRIPTION":
      return entitlements.currentPeriodEnd
        ? `Active through ${formatDate(entitlements.currentPeriodEnd)}`
        : "Subscription active";
    case "READ_ONLY":
      return "Read-only billing state";
    case "INACTIVE":
    default:
      return "Inactive billing state";
  }
}

function getAreaContent(
  input: Pick<
    BuildProductSurfaceModelInput,
    "area" | "entitlements"
  >
): AreaContent {
  switch (input.area) {
    case "reports":
      return {
        title: "Plan and report capacity",
        description:
          "Keep report generation tied to the live billing and entitlement state without guessing from UI-only checks.",
        planDetail:
          "Executive report access and generation stay controlled by the workspace billing plan.",
        lockedCallout: !input.entitlements.canAccessReports
          ? {
              tone: "warning",
              title: "Reports are locked for this workspace",
              body:
                "The current workspace mode does not allow report access. Reactivate billing or move the workspace onto an eligible plan to restore report visibility.",
              actionHref: "/dashboard/settings",
              actionLabel: "Open billing"
            }
          : !input.entitlements.canGenerateReports
            ? {
                tone: "warning",
                title: "New report generation is unavailable",
                body:
                  "Existing reports remain visible, but generating new executive deliverables is locked by the current billing or workspace state.",
                actionHref: "/dashboard/settings",
                actionLabel: "Review billing state"
              }
            : null
      };
    case "evidence":
      return {
        title: "Plan and ingestion capacity",
        description:
          "Evidence uploads, document processing, and retained storage all reflect the backend quota and entitlement rules already enforcing ingestion safety.",
        planDetail:
          "Evidence management uses plan-based monthly upload and processing capacity, plus tracked storage visibility.",
        lockedCallout: !input.entitlements.featureAccess["evidence.view"]
          ? {
              tone: "warning",
              title: "Evidence access is unavailable",
              body:
                "This workspace cannot access the evidence library on the current plan or workspace state.",
              actionHref: "/dashboard/settings",
              actionLabel: "Open billing"
            }
          : !input.entitlements.featureAccess["uploads.manage"]
            ? {
                tone: "warning",
                title: "Evidence uploads are locked",
                body:
                  "Existing evidence remains visible, but uploading new evidence is not available on the current plan or workspace state.",
                actionHref: "/dashboard/settings",
                actionLabel: "Review plan access"
              }
            : null
      };
    case "monitoring":
      return {
        title: "Plan and monitoring capacity",
        description:
          "Monitoring access and tracked asset capacity should stay visible in the workspace so operators know when recurring coverage is available and healthy.",
        planDetail:
          "Continuous monitoring availability and monitored asset capacity are plan-driven and enforced in the backend.",
        lockedCallout: !input.entitlements.featureAccess["monitoring.view"]
          ? {
              tone: "warning",
              title: "Monitoring is not active on this workspace",
              body:
                "This workspace cannot access monitoring on the current plan or billing state.",
              actionHref: "/dashboard/settings",
              actionLabel: "Open billing"
            }
          : !input.entitlements.featureAccess["monitoring.manage"]
            ? {
                tone: "neutral",
                title: "Monitoring is view-only on this plan",
                body:
                  "Monitoring visibility is available, but remediation and management actions remain limited by the current plan or workspace mode.",
                actionHref: "/pricing",
                actionLabel: "Compare plans"
              }
            : null
      };
    case "dashboard":
    default:
      return {
        title: "Plan and workspace limits",
        description:
          "The dashboard should surface the current subscription posture and the most important capacity signals without interrupting normal work.",
        planDetail:
          "Workspace capacity is resolved from the current plan, entitlements, and monthly quota windows.",
        lockedCallout:
          input.entitlements.workspaceMode === "INACTIVE"
            ? {
                tone: "warning",
                title: "Workspace actions are limited until billing is restored",
                body:
                  "The workspace is in an inactive billing state. Historical records remain safe, but new activity stays gated until billing returns to an eligible state.",
                actionHref: "/dashboard/settings",
                actionLabel: "Open billing"
              }
            : null
      };
  }
}

function buildQuotaCard(input: {
  key: UsageQuotaKey;
  label: string;
  snapshot: UsageRemainingSnapshot;
}): ProductSurfaceCard {
  const status: ProductSurfaceCardStatus = input.snapshot.isUnlimited
    ? "unlimited"
    : input.snapshot.remaining === 0
      ? "exceeded"
      : (input.snapshot.percentUsed ?? 0) >= 80
        ? "warning"
        : "ok";

  return {
    key: `quota:${input.key}`,
    label: input.label,
    value: formatQuotaValue(input.snapshot),
    helperText: formatQuotaHelperText(input.snapshot),
    status
  };
}

function buildMetricCard(metric: UsageMetricSnapshot): ProductSurfaceCard {
  return {
    key: `metric:${metric.key}`,
    label: metric.label,
    value: metric.usageLabel,
    helperText: metric.helperText,
    status: metric.status
  };
}

function getMetricCallout(metric: UsageMetricSnapshot): ProductSurfaceCallout {
  return {
    tone: metric.status === "exceeded" ? "danger" : "warning",
    title: metric.upgradeTitle,
    body: `${metric.upgradeBody} ${metric.helperText}`,
    actionHref: metric.actionHref,
    actionLabel: metric.actionLabel
  };
}

function getQuotaCallout(input: {
  key: UsageQuotaKey;
  snapshot: UsageRemainingSnapshot;
  label: string;
}): ProductSurfaceCallout {
  return {
    tone: input.snapshot.remaining === 0 ? "danger" : "warning",
    title:
      input.snapshot.remaining === 0
        ? `${input.label} limit reached`
        : `${input.label} nearing monthly capacity`,
    body:
      input.snapshot.remaining === 0
        ? `The workspace has exhausted the current monthly ${input.label.toLowerCase()} allowance. ${formatQuotaHelperText(
            input.snapshot
          )}`
        : `The workspace is approaching the current monthly ${input.label.toLowerCase()} allowance. ${formatQuotaHelperText(
            input.snapshot
          )}`,
    actionHref: "/pricing",
    actionLabel: getQuotaActionLabel(input.key)
  };
}

function getMostImportantCallout(input: {
  metrics: UsageMetricSnapshot[];
  quotas: Array<{ key: UsageQuotaKey; label: string; snapshot: UsageRemainingSnapshot }>;
}) {
  const exceededMetric = input.metrics.find((metric) => metric.status === "exceeded");
  if (exceededMetric) {
    return getMetricCallout(exceededMetric);
  }

  const exceededQuota = input.quotas.find((quota) => quota.snapshot.remaining === 0);
  if (exceededQuota) {
    return getQuotaCallout(exceededQuota);
  }

  const warningMetric = input.metrics.find((metric) => metric.status === "warning");
  if (warningMetric) {
    return getMetricCallout(warningMetric);
  }

  const warningQuota = input.quotas.find(
    (quota) =>
      !quota.snapshot.isUnlimited && (quota.snapshot.percentUsed ?? 0) >= 80
  );

  return warningQuota ? getQuotaCallout(warningQuota) : null;
}

export function buildProductSurfaceModel(
  input: BuildProductSurfaceModelInput
): ProductSurfaceModel {
  const areaContent = getAreaContent(input);
  const usageMetrics = input.usageMetrics ?? [];
  const quotas = input.quotas ?? [];

  return {
    title: areaContent.title,
    description: areaContent.description,
    planName: input.entitlements.planName,
    planDetail: areaContent.planDetail,
    workspaceModeLabel: formatWorkspaceModeLabel(input.entitlements),
    cards: [
      ...quotas.map((quota) => buildQuotaCard(quota)),
      ...usageMetrics.map((metric) => buildMetricCard(metric))
    ],
    callout:
      areaContent.lockedCallout ??
      getMostImportantCallout({
        metrics: usageMetrics,
        quotas
      })
  };
}
