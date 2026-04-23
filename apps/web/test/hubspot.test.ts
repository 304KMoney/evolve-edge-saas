import assert from "node:assert/strict";
import {
  assertHubSpotProjectionEvent,
  getHubSpotDestinations,
  shouldSyncHubSpotEvent
} from "../lib/hubspot";

function runHubSpotTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalSyncEnabled = env.HUBSPOT_SYNC_ENABLED;
  const originalAccessToken = env.HUBSPOT_ACCESS_TOKEN;

  assert.equal(shouldSyncHubSpotEvent("org.created"), true);
  assert.equal(shouldSyncHubSpotEvent("report.generated"), true);
  assert.equal(shouldSyncHubSpotEvent("routing.snapshot.created"), false);

  assert.doesNotThrow(() => assertHubSpotProjectionEvent("subscription.updated"));
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
