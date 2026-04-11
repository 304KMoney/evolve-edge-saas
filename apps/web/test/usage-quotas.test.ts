import assert from "node:assert/strict";
import { CanonicalPlanKey } from "@evolve-edge/db";
import { resolveEntitlementConfig } from "../lib/entitlements";
import {
  buildUsageRemainingSnapshot,
  getQuotaExceededMessage,
  getUsageMeterKeyValue,
  getUsagePeriodWindow,
  isQuotaExceeded,
  resolveQuotaLimit
} from "../lib/usage-quotas";

function runUsageQuotaTests() {
  {
    const window = getUsagePeriodWindow(new Date("2026-04-10T15:45:12.000Z"));

    assert.equal(window.periodStart.toISOString(), "2026-04-01T00:00:00.000Z");
    assert.equal(window.periodEnd.toISOString(), "2026-05-01T00:00:00.000Z");
  }

  {
    const entitlements = resolveEntitlementConfig({
      canonicalPlanKey: CanonicalPlanKey.GROWTH,
      revenuePlanCode: "growth-annual",
      workspaceMode: "SUBSCRIPTION"
    });

    assert.equal(resolveQuotaLimit(entitlements, "audits"), 5);
    assert.equal(resolveQuotaLimit(entitlements, "evidence_uploads"), 250);
    assert.equal(resolveQuotaLimit(entitlements, "documents_processed"), 60);
  }

  {
    const snapshot = buildUsageRemainingSnapshot({
      organizationId: "org_test",
      meterKey: "evidence_uploads",
      limit: 50,
      used: 45,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z")
    });

    assert.equal(snapshot.remaining, 5);
    assert.equal(snapshot.percentUsed, 90);
    assert.equal(snapshot.isUnlimited, false);
    assert.equal(getUsageMeterKeyValue("evidence_uploads"), "EVIDENCE_UPLOADS");
    assert.equal(isQuotaExceeded(snapshot, 5), false);
    assert.equal(isQuotaExceeded(snapshot, 6), true);
  }

  {
    const unlimited = buildUsageRemainingSnapshot({
      organizationId: "org_test",
      meterKey: "documents_processed",
      limit: null,
      used: 250,
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-01T00:00:00.000Z")
    });

    assert.equal(unlimited.remaining, null);
    assert.equal(unlimited.percentUsed, null);
    assert.equal(unlimited.isUnlimited, true);
    assert.equal(isQuotaExceeded(unlimited, 100), false);
  }

  {
    assert.equal(
      getQuotaExceededMessage("audits"),
      "Monthly audit quota reached. Upgrade required to create another assessment."
    );
    assert.equal(
      getQuotaExceededMessage("documents_processed"),
      "Monthly document processing quota reached. Upgrade required to process more evidence this month."
    );
  }

  console.log("usage-quotas tests passed");
}

runUsageQuotaTests();
