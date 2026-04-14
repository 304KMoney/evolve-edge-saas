import assert from "node:assert/strict";
import { DeliveryStateStatus } from "@evolve-edge/db";
import {
  detectDeliveryMismatchForRecord,
  getDeliveryMismatchDetectionGuide
} from "../lib/delivery-mismatch-detection";

const now = new Date("2026-04-12T18:00:00.000Z");

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "ds_123",
    organizationId: "org_123",
    userId: "user_123",
    billingEventId: "be_123",
    routingSnapshotId: "rs_123",
    workflowDispatchId: "wd_123",
    reportId: null,
    reportPackageId: null,
    sourceSystem: "stripe",
    sourceEventType: "checkout.session.completed",
    sourceEventId: "evt_123",
    sourceRecordType: "checkoutSession",
    sourceRecordId: "cs_123",
    idempotencyKey: "delivery-state:evt_123",
    planCode: "SCALE",
    workflowCode: "AUDIT_SCALE",
    externalResultReference: null,
    entitlementsJson: null,
    routingHintsJson: null,
    statusReasonJson: null,
    latestExecutionResultJson: null,
    lastError: null,
    status: DeliveryStateStatus.PAID,
    paidAt: new Date("2026-04-12T17:00:00.000Z"),
    routedAt: null,
    processingAt: null,
    awaitingReviewAt: null,
    reportGeneratedAt: null,
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date("2026-04-12T17:00:00.000Z"),
    updatedAt: new Date("2026-04-12T17:00:00.000Z"),
    organization: {
      id: "org_123",
      name: "Northbridge Legal",
      slug: "northbridge-legal"
    },
    billingEvent: {
      id: "be_123",
      stripeEventId: "evt_123",
      type: "checkout.session.completed",
      status: "PROCESSED",
      createdAt: new Date("2026-04-12T17:00:00.000Z")
    },
    routingSnapshot: {
      id: "rs_123",
      billingEventId: "be_123",
      status: "DISPATCHED",
      workflowCode: "AUDIT_SCALE",
      planCode: "SCALE",
      createdAt: new Date("2026-04-12T17:05:00.000Z")
    },
    workflowDispatch: {
      id: "wd_123",
      status: "SUCCEEDED",
      externalExecutionId: "exec_123",
      createdAt: new Date("2026-04-12T17:10:00.000Z"),
      updatedAt: new Date("2026-04-12T17:20:00.000Z")
    },
    ...overrides
  } as any;
}

function runDeliveryMismatchDetectionTests() {
  const paidNotRouted = detectDeliveryMismatchForRecord(
    buildRecord({
      status: DeliveryStateStatus.PAID,
      routingSnapshotId: null,
      workflowDispatchId: null,
      routingSnapshot: null,
      paidAt: new Date("2026-04-12T17:00:00.000Z")
    }),
    now
  );
  assert.equal(paidNotRouted.length, 1);
  assert.equal(paidNotRouted[0]?.code, "paid_not_routed");

  const routedNotDelivered = detectDeliveryMismatchForRecord(
    buildRecord({
      status: DeliveryStateStatus.REPORT_GENERATED,
      reportGeneratedAt: new Date("2026-04-12T14:00:00.000Z"),
      deliveredAt: null,
      failedAt: null
    }),
    now
  );
  assert.equal(routedNotDelivered.length, 1);
  assert.equal(routedNotDelivered[0]?.code, "routed_not_delivered");

  const deliveredWithoutPayment = detectDeliveryMismatchForRecord(
    buildRecord({
      status: DeliveryStateStatus.DELIVERED,
      billingEventId: null,
      billingEvent: null,
      routingSnapshot: {
        id: "rs_123",
        billingEventId: null,
        status: "REPORT_READY",
        workflowCode: "AUDIT_SCALE",
        planCode: "SCALE",
        createdAt: new Date("2026-04-12T17:05:00.000Z")
      },
      deliveredAt: new Date("2026-04-12T17:40:00.000Z")
    }),
    now
  );
  assert.equal(deliveredWithoutPayment.length, 1);
  assert.equal(deliveredWithoutPayment[0]?.code, "delivered_without_matching_payment");

  const clean = detectDeliveryMismatchForRecord(
    buildRecord({
      status: DeliveryStateStatus.DELIVERED,
      deliveredAt: new Date("2026-04-12T17:40:00.000Z")
    }),
    now
  );
  assert.equal(clean.length, 0);

  const guide = getDeliveryMismatchDetectionGuide();
  assert.equal(guide.mismatchCodes.includes("paid_not_routed"), true);
  assert.equal(guide.sourceOfTruth.delivery, "DeliveryStateRecord");

  console.log("delivery-mismatch-detection tests passed");
}

runDeliveryMismatchDetectionTests();
