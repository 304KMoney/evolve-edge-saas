import assert from "node:assert/strict";
import { DeliveryStateStatus } from "@evolve-edge/db";
import {
  applyDeliveryStateTransition
} from "../lib/delivery-state";

function runDeliveryStateTests() {
  const now = new Date("2026-04-12T14:00:00.000Z");
  const base = {
    status: DeliveryStateStatus.PAID,
    paidAt: now,
    routedAt: null,
    processingAt: null,
    awaitingReviewAt: null,
    reportGeneratedAt: null,
    deliveredAt: null,
    failedAt: null
  };

  const routed = applyDeliveryStateTransition(
    DeliveryStateStatus.PAID,
    DeliveryStateStatus.ROUTED,
    base,
    now
  );
  assert.equal(routed.changed, true);
  assert.equal(routed.status, DeliveryStateStatus.ROUTED);
  assert.equal(routed.timestamps.routedAt?.toISOString(), now.toISOString());

  const noRegression = applyDeliveryStateTransition(
    DeliveryStateStatus.REPORT_GENERATED,
    DeliveryStateStatus.ROUTED,
    {
      ...base,
      status: DeliveryStateStatus.REPORT_GENERATED,
      routedAt: now,
      reportGeneratedAt: now
    },
    now
  );
  assert.equal(noRegression.changed, false);
  assert.equal(noRegression.status, DeliveryStateStatus.REPORT_GENERATED);

  const failed = applyDeliveryStateTransition(
    DeliveryStateStatus.PROCESSING,
    DeliveryStateStatus.FAILED,
    {
      ...base,
      status: DeliveryStateStatus.PROCESSING,
      routedAt: now,
      processingAt: now
    },
    now
  );
  assert.equal(failed.changed, true);
  assert.equal(failed.status, DeliveryStateStatus.FAILED);
  assert.equal(failed.timestamps.failedAt?.toISOString(), now.toISOString());

  const delivered = applyDeliveryStateTransition(
    DeliveryStateStatus.AWAITING_REVIEW,
    DeliveryStateStatus.DELIVERED,
    {
      ...base,
      status: DeliveryStateStatus.AWAITING_REVIEW,
      routedAt: now,
      processingAt: now,
      reportGeneratedAt: now,
      awaitingReviewAt: now
    },
    now
  );
  assert.equal(delivered.changed, true);
  assert.equal(delivered.status, DeliveryStateStatus.DELIVERED);
  assert.equal(delivered.timestamps.deliveredAt?.toISOString(), now.toISOString());

  console.log("delivery-state tests passed");
}

runDeliveryStateTests();
