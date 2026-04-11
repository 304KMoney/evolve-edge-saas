import assert from "node:assert/strict";
import type { EntitlementSnapshot } from "../lib/entitlements";
import {
  buildProductSurfaceModel,
  type ProductSurfaceArea
} from "../lib/product-surface";
import type { UsageMetricSnapshot } from "../lib/usage-metering";
import type { UsageRemainingSnapshot } from "../lib/usage-quotas";

function createEntitlements(
  overrides: Partial<
    Pick<
      EntitlementSnapshot,
      | "planName"
      | "workspaceMode"
      | "trialEndsAt"
      | "currentPeriodEnd"
      | "canAccessReports"
      | "canGenerateReports"
      | "featureAccess"
    >
  > = {}
) {
  return {
    planName: "Growth",
    workspaceMode: "SUBSCRIPTION",
    trialEndsAt: null,
    currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
    canAccessReports: true,
    canGenerateReports: true,
    featureAccess: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": true,
      "executive.reviews": false,
      "executive.delivery": true,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": false,
      "api.access": false,
      "priority.support": false
    },
    ...overrides
  } satisfies Pick<
    EntitlementSnapshot,
    | "planName"
    | "workspaceMode"
    | "trialEndsAt"
    | "currentPeriodEnd"
    | "canAccessReports"
    | "canGenerateReports"
    | "featureAccess"
  >;
}

function createMetric(
  overrides: Partial<UsageMetricSnapshot> = {}
): UsageMetricSnapshot {
  return {
    key: "reportsGenerated",
    label: "Reports generated",
    description: "Executive reports created.",
    unit: "count",
    used: 28,
    limit: 36,
    remaining: 8,
    percentUsed: 78,
    enforcement: "soft",
    warningThresholdPercent: 80,
    status: "ok",
    isConfigured: true,
    shortLabel: "Reports",
    usageLabel: "28 of 36",
    helperText: "8 remaining on the current plan.",
    upgradeTitle: "Reports nearing plan capacity",
    upgradeBody: "The workspace is using most of its report allowance.",
    actionHref: "/pricing",
    actionLabel: "Compare plans",
    ...overrides
  };
}

function createQuota(
  overrides: Partial<UsageRemainingSnapshot> = {}
): UsageRemainingSnapshot {
  return {
    organizationId: "org_test",
    meterKey: "evidence_uploads",
    meterKeyValue: "EVIDENCE_UPLOADS",
    limit: 50,
    used: 25,
    remaining: 25,
    percentUsed: 50,
    periodStart: new Date("2026-04-01T00:00:00.000Z"),
    periodEnd: new Date("2026-05-01T00:00:00.000Z"),
    isUnlimited: false,
    ...overrides
  };
}

function runProductSurfaceTests() {
  {
    const model = buildProductSurfaceModel({
      area: "reports",
      entitlements: createEntitlements({
        canGenerateReports: false
      })
    });

    assert.equal(model.callout?.title, "New report generation is unavailable");
    assert.equal(model.callout?.actionHref, "/dashboard/settings");
  }

  {
    const model = buildProductSurfaceModel({
      area: "evidence",
      entitlements: createEntitlements(),
      quotas: [
        {
          key: "evidence_uploads",
          label: "Monthly evidence uploads",
          snapshot: createQuota({
            used: 50,
            remaining: 0,
            percentUsed: 100
          })
        }
      ]
    });

    assert.equal(model.callout?.title, "Monthly evidence uploads limit reached");
    assert.equal(model.callout?.tone, "danger");
    assert.equal(model.cards[0]?.status, "exceeded");
  }

  {
    const model = buildProductSurfaceModel({
      area: "monitoring",
      entitlements: createEntitlements({
        featureAccess: {
          ...createEntitlements().featureAccess,
          "monitoring.view": false
        }
      })
    });

    assert.equal(model.callout?.title, "Monitoring is not active on this workspace");
  }

  {
    const model = buildProductSurfaceModel({
      area: "dashboard" as ProductSurfaceArea,
      entitlements: createEntitlements(),
      usageMetrics: [
        createMetric({
          status: "warning",
          percentUsed: 84,
          helperText: "Approaching the recommended threshold."
        })
      ]
    });

    assert.equal(model.callout?.title, "Reports nearing plan capacity");
    assert.equal(model.cards[0]?.label, "Reports generated");
  }

  console.log("product surface tests passed");
}

runProductSurfaceTests();
