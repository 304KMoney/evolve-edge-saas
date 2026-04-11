import assert from "node:assert/strict";
import { CanonicalPlanKey } from "@evolve-edge/db";
import {
  compareCanonicalPlans,
  hasFeature,
  resolveEntitlementConfig,
  type EntitlementSnapshot
} from "../lib/entitlements";

function runEntitlementTests() {
  assert.equal(
    compareCanonicalPlans(CanonicalPlanKey.ENTERPRISE, CanonicalPlanKey.GROWTH) > 0,
    true
  );
  assert.equal(
    compareCanonicalPlans(CanonicalPlanKey.GROWTH, CanonicalPlanKey.ENTERPRISE) < 0,
    true
  );
  assert.equal(
    compareCanonicalPlans(CanonicalPlanKey.SCALE, CanonicalPlanKey.SCALE),
    0
  );

  {
    const growth = resolveEntitlementConfig({
      canonicalPlanKey: CanonicalPlanKey.GROWTH,
      revenuePlanCode: "growth-annual",
      workspaceMode: "SUBSCRIPTION"
    });

    assert.equal(growth.featureAccess["assessments.create"], true);
    assert.equal(growth.featureAccess["members.manage"], true);
    assert.equal(growth.featureAccess["custom.frameworks"], false);
    assert.equal(growth.limits.users, 8);
    assert.equal(growth.limits.reports_generated, 36);
  }

  {
    const readOnly = resolveEntitlementConfig({
      canonicalPlanKey: CanonicalPlanKey.ENTERPRISE,
      revenuePlanCode: "enterprise-annual",
      workspaceMode: "READ_ONLY"
    });

    assert.equal(readOnly.featureAccess["reports.view"], true);
    assert.equal(readOnly.featureAccess["reports.generate"], false);
    assert.equal(readOnly.featureAccess["uploads.manage"], false);
    assert.equal(readOnly.featureAccess["frameworks.manage"], false);
  }

  {
    const overridden = resolveEntitlementConfig({
      canonicalPlanKey: CanonicalPlanKey.GROWTH,
      revenuePlanCode: "growth-annual",
      workspaceMode: "SUBSCRIPTION",
      overrides: [
        {
          entitlementKey: "custom.frameworks",
          enabled: true,
          limitOverride: null,
          reason: "Enterprise exception",
          expiresAt: null,
          source: "ENTERPRISE"
        },
        {
          entitlementKey: "users",
          enabled: null,
          limitOverride: "15",
          reason: "Promo expansion seat pack",
          expiresAt: null,
          source: "PROMO"
        }
      ]
    });

    assert.equal(overridden.featureAccess["custom.frameworks"], true);
    assert.equal(overridden.limits.users, 15);
    assert.equal(overridden.appliedOverrides.length, 2);
  }

  {
    const expired = resolveEntitlementConfig({
      canonicalPlanKey: CanonicalPlanKey.GROWTH,
      revenuePlanCode: "growth-annual",
      workspaceMode: "SUBSCRIPTION",
      now: new Date("2026-04-10T15:00:00.000Z"),
      overrides: [
        {
          entitlementKey: "priority.support",
          enabled: true,
          limitOverride: null,
          reason: "Expired promo",
          expiresAt: new Date("2026-04-01T00:00:00.000Z"),
          source: "PROMO"
        }
      ]
    });

    assert.equal(expired.featureAccess["priority.support"], false);
    assert.equal(expired.appliedOverrides.length, 0);
  }

  {
    const snapshot = {
      featureAccess: {
        "workspace.access": true,
        "assessments.create": true,
        "reports.view": true,
        "reports.generate": true,
        "roadmap.view": true,
        "members.manage": false,
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
        "custom.frameworks": false,
        "api.access": false,
        "priority.support": false
      }
    } satisfies Pick<EntitlementSnapshot, "featureAccess">;

    assert.equal(hasFeature(snapshot, "billing.portal"), true);
    assert.equal(hasFeature(snapshot, "monitoring.manage"), false);
  }

  console.log("entitlements tests passed");
}

runEntitlementTests();
