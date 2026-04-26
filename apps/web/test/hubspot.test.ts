import assert from "node:assert/strict";
import {
  assertHubSpotProjectionEvent,
  buildHubSpotMilestoneProperties,
  getHubSpotDestinations,
  shouldSyncHubSpotEvent
} from "../lib/hubspot";

function runHubSpotTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalSyncEnabled = env.HUBSPOT_SYNC_ENABLED;
  const originalAccessToken = env.HUBSPOT_ACCESS_TOKEN;

  assert.equal(shouldSyncHubSpotEvent("org.created"), true);
  assert.equal(shouldSyncHubSpotEvent("report.generated"), true);
  assert.equal(shouldSyncHubSpotEvent("report.delivered"), true);
  assert.equal(shouldSyncHubSpotEvent("routing.snapshot.created"), false);

  assert.doesNotThrow(() => assertHubSpotProjectionEvent("subscription.updated"));
  assert.doesNotThrow(() => assertHubSpotProjectionEvent("report.delivered"));
  assert.throws(
    () => assertHubSpotProjectionEvent("routing.snapshot.created"),
    /HubSpot projection is not enabled/
  );

  delete env.HUBSPOT_SYNC_ENABLED;
  delete env.HUBSPOT_ACCESS_TOKEN;
  assert.equal(getHubSpotDestinations().length, 0);

  env.HUBSPOT_ACCESS_TOKEN = "hubspot_token";
  assert.equal(getHubSpotDestinations().length, 1);

  env.HUBSPOT_SYNC_ENABLED = "false";
  assert.equal(getHubSpotDestinations().length, 0);

  env.HUBSPOT_SYNC_ENABLED = "true";
  assert.equal(getHubSpotDestinations().length, 1);

  delete env.HUBSPOT_ACCESS_TOKEN;
  assert.equal(getHubSpotDestinations().length, 0);

  const reportGeneratedMilestones = buildHubSpotMilestoneProperties(
    "report.generated",
    {
      type: "report.generated",
      occurredAt: new Date("2026-04-26T14:00:00.000Z"),
      payload: {
        riskLevel: "moderate",
        topConcerns: ["Vendor review debt", "Access control drift"]
      }
    } as any
  );
  assert.equal(reportGeneratedMilestones.evolve_edge_report_generated, "true");
  assert.equal(
    "evolve_edge_report_delivered_at" in reportGeneratedMilestones,
    false
  );
  assert.equal(reportGeneratedMilestones.evolve_edge_risk_level, "moderate");
  assert.equal(
    reportGeneratedMilestones.evolve_edge_top_concerns,
    "Vendor review debt | Access control drift"
  );

  const reportDeliveredMilestones = buildHubSpotMilestoneProperties(
    "report.delivered",
    {
      type: "report.delivered",
      occurredAt: new Date("2026-04-26T15:00:00.000Z"),
      payload: {
        riskLevel: "moderate",
        top_concerns: ["Vendor review debt"]
      }
    } as any
  );
  assert.equal(reportDeliveredMilestones.evolve_edge_report_generated, "true");
  assert.equal(
    reportDeliveredMilestones.evolve_edge_report_delivered_at,
    "2026-04-26T15:00:00.000Z"
  );

  if (originalSyncEnabled === undefined) {
    delete env.HUBSPOT_SYNC_ENABLED;
  } else {
    env.HUBSPOT_SYNC_ENABLED = originalSyncEnabled;
  }

  if (originalAccessToken === undefined) {
    delete env.HUBSPOT_ACCESS_TOKEN;
  } else {
    env.HUBSPOT_ACCESS_TOKEN = originalAccessToken;
  }

  console.log("hubspot tests passed");
}

runHubSpotTests();
