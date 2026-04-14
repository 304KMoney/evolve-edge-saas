import assert from "node:assert/strict";
import { BillingEventStatus, CanonicalPlanKey } from "@evolve-edge/db";
import {
  getEntitlementBreakdown,
  resolveSupportSafeBillingPlan,
  summarizeBillingWebhookHealth
} from "../lib/billing-admin";
import type { EntitlementSnapshot } from "../lib/entitlements";

function runBillingAdminTests() {
  const snapshot = {
    featureAccess: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": false,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": false,
      "executive.reviews": false,
      "executive.delivery": true,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": true,
      "api.access": false,
      "priority.support": true
    },
    limits: {
      users: 15,
      audits: 12,
      uploads: 1000,
      monitoring_assets: 75,
      frameworks: 12,
      reports_generated: 96,
      storage_bytes: 10_000_000_000,
      ai_processing_runs: 180
    },
    appliedOverrides: [
      {
        key: "custom.frameworks",
        source: "ENTERPRISE",
        reason: "Custom program",
        expiresAt: null
      },
      {
        key: "users",
        source: "PROMO",
        reason: "Temporary seat expansion",
        expiresAt: null
      }
    ]
  } satisfies Pick<
    EntitlementSnapshot,
    "featureAccess" | "limits" | "appliedOverrides"
  >;

  const breakdown = getEntitlementBreakdown(snapshot);
  const customFrameworks = breakdown.find(
    (entry) => entry.kind === "feature" && entry.key === "custom.frameworks"
  );
  const usersLimit = breakdown.find(
    (entry) => entry.kind === "limit" && entry.key === "users"
  );

  assert.ok(customFrameworks);
  assert.ok(usersLimit);
  assert.deepEqual(customFrameworks.overrideSources, ["ENTERPRISE"]);
  assert.deepEqual(usersLimit.overrideSources, ["PROMO"]);
  assert.equal(usersLimit.value, 15);

  const webhookHealth = summarizeBillingWebhookHealth([
    {
      status: BillingEventStatus.PROCESSED,
      processedAt: new Date("2026-04-10T14:00:00.000Z"),
      failedAt: null,
      lastError: null
    },
    {
      status: BillingEventStatus.FAILED,
      processedAt: null,
      failedAt: new Date("2026-04-10T15:00:00.000Z"),
      lastError: "Temporary network timeout contacting Stripe."
    },
    {
      status: BillingEventStatus.PENDING,
      processedAt: null,
      failedAt: null,
      lastError: null
    }
  ]);

  assert.equal(webhookHealth.openFailureCount, 1);
  assert.equal(webhookHealth.retryableFailureCount, 1);
  assert.equal(webhookHealth.pendingCount, 1);
  assert.equal(
    webhookHealth.recommendedAction?.includes("manual billing resync"),
    true
  );

  assert.deepEqual(
    resolveSupportSafeBillingPlan({
      planCodeSnapshot: "scale-annual",
      canonicalPlanKey: CanonicalPlanKey.SCALE
    }),
    {
      supportSafePlanCode: "scale",
      supportSafePlanName: "Scale"
    }
  );

  assert.deepEqual(
    resolveSupportSafeBillingPlan({
      planCodeSnapshot: "growth-annual",
      canonicalPlanKey: CanonicalPlanKey.GROWTH
    }),
    {
      supportSafePlanCode: "scale",
      supportSafePlanName: "Scale"
    }
  );

  assert.deepEqual(
    resolveSupportSafeBillingPlan({
      planCodeSnapshot: null,
      canonicalPlanKey: CanonicalPlanKey.ENTERPRISE
    }),
    {
      supportSafePlanCode: "enterprise",
      supportSafePlanName: "Enterprise"
    }
  );

  console.log("billing admin tests passed");
}

runBillingAdminTests();
