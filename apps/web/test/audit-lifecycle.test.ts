import assert from "node:assert/strict";
import {
  buildAuditLifecycleTimeline,
  validateAuditLifecycleTransition
} from "../lib/audit-lifecycle";

function runAuditLifecycleTests() {
  assert.equal(
    validateAuditLifecycleTransition({
      fromStatus: "intake_pending",
      toStatus: "routing_complete",
      evidence: { routingSnapshotId: "rs_123" }
    }).ok,
    false
  );

  assert.deepEqual(
    validateAuditLifecycleTransition({
      fromStatus: "intake_pending",
      toStatus: "intake_complete",
      evidence: { intakeComplete: true }
    }),
    { ok: true, idempotent: false }
  );

  assert.equal(
    validateAuditLifecycleTransition({
      fromStatus: "analysis_running",
      toStatus: "analysis_complete",
      evidence: {}
    }).ok,
    false
  );

  assert.equal(
    validateAuditLifecycleTransition({
      fromStatus: "analysis_running",
      toStatus: "failed_review_required",
      evidence: { failureReason: "AI output validation failed." }
    }).ok,
    true
  );

  assert.equal(
    validateAuditLifecycleTransition({
      fromStatus: "report_ready",
      toStatus: "briefing_ready",
      evidence: { briefingId: "briefing_123" }
    }).ok,
    true
  );

  const stages = buildAuditLifecycleTimeline({
    currentStatus: "briefing_ready",
    timestamps: {
      intake_complete: new Date("2026-04-29T12:00:00.000Z"),
      briefing_ready: new Date("2026-04-29T12:05:00.000Z")
    }
  });

  assert.equal(stages.find((stage) => stage.status === "report_ready")?.completed, true);
  assert.equal(stages.find((stage) => stage.status === "briefing_ready")?.active, true);
  assert.equal(stages.find((stage) => stage.status === "delivered")?.completed, false);

  console.log("audit lifecycle tests passed");
}

runAuditLifecycleTests();
