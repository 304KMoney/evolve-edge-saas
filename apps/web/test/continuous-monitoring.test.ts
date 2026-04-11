import assert from "node:assert/strict";
import { MonitoringFindingStatus } from "@evolve-edge/db";
import {
  buildMonitoringFindingDedupeKey,
  getDefaultMonitoringCheckKeys,
  resolveMonitoringFindingStatusOnSync
} from "../lib/continuous-monitoring";

function runContinuousMonitoringTests() {
  {
    const key = buildMonitoringFindingDedupeKey({
      title: " PHI handling guidance missing for AI copilots ",
      riskDomain: "Privacy"
    });

    assert.equal(key, "privacy:phi-handling-guidance-missing-for-ai-copilots");
  }

  {
    assert.equal(
      resolveMonitoringFindingStatusOnSync(MonitoringFindingStatus.RESOLVED),
      MonitoringFindingStatus.OPEN
    );
    assert.equal(
      resolveMonitoringFindingStatusOnSync(MonitoringFindingStatus.IN_REMEDIATION),
      MonitoringFindingStatus.IN_REMEDIATION
    );
    assert.equal(
      resolveMonitoringFindingStatusOnSync(undefined),
      MonitoringFindingStatus.OPEN
    );
  }

  {
    const keys = getDefaultMonitoringCheckKeys();

    assert.deepEqual(keys, [
      "policy-attestation",
      "vendor-risk-review",
      "access-control-review",
      "executive-reporting-refresh"
    ]);
  }

  console.log("continuous-monitoring tests passed");
}

runContinuousMonitoringTests();
