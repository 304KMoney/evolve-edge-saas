import assert from "node:assert/strict";
import {
  assertHubSpotProjectionEvent,
  shouldSyncHubSpotEvent
} from "../lib/hubspot";

function runHubSpotTests() {
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

  console.log("hubspot tests passed");
}

runHubSpotTests();
