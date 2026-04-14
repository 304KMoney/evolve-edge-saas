import assert from "node:assert/strict";
import {
  buildDeliveryReconciliationSummary
} from "../lib/delivery-reconciliation";

function runDeliveryReconciliationTests() {
  const now = new Date("2026-04-12T16:30:00.000Z");
  const summary = buildDeliveryReconciliationSummary({
    id: "ds_123",
    organizationId: "org_123",
    userId: "user_123",
    billingEventId: "be_123",
    routingSnapshotId: "rs_123",
    workflowDispatchId: "wd_123",
    reportId: "rep_123",
    reportPackageId: "pkg_123",
    sourceSystem: "stripe",
    sourceEventType: "checkout.session.completed",
    sourceEventId: "evt_123",
    sourceRecordType: "checkoutSession",
    sourceRecordId: "cs_123",
    idempotencyKey: "delivery-state:evt_123",
    planCode: "SCALE",
    workflowCode: "AUDIT_SCALE",
    externalResultReference: "report-ref-123",
    entitlementsJson: null,
    routingHintsJson: null,
    statusReasonJson: null,
    latestExecutionResultJson: null,
    lastError: null,
    status: "DELIVERED",
    paidAt: now,
    routedAt: now,
    processingAt: now,
    awaitingReviewAt: now,
    reportGeneratedAt: now,
    deliveredAt: now,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
    billingEvent: {
      id: "be_123",
      stripeEventId: "evt_123",
      type: "checkout.session.completed",
      status: "PROCESSED",
      processingStartedAt: now,
      processedAt: now,
      failedAt: null,
      lastError: null,
      payload: {},
      createdAt: now
    },
    routingSnapshot: {
      id: "rs_123",
      organizationId: "org_123",
      userId: "user_123",
      billingEventId: "be_123",
      sourceSystem: "stripe",
      sourceEventType: "checkout.session.completed",
      sourceEventId: "evt_123",
      sourceRecordType: "checkoutSession",
      sourceRecordId: "cs_123",
      idempotencyKey: "routing-snapshot:evt_123",
      planCode: "SCALE",
      workflowCode: "AUDIT_SCALE",
      entitlementsJson: {},
      normalizedHintsJson: {},
      routingReasonJson: {},
      commercialStateJson: {},
      status: "REPORT_READY",
      createdAt: now,
      updatedAt: now
    },
    workflowDispatch: {
      id: "wd_123",
      routingSnapshotId: "rs_123",
      eventType: "audit.requested",
      destination: "auditRequested",
      idempotencyKey: "workflow-dispatch:rs_123:audit.requested",
      correlationId: "corr_123",
      status: "SUCCEEDED",
      attemptCount: 1,
      nextRetryAt: null,
      lastAttemptAt: now,
      dispatchedAt: now,
      deliveredAt: now,
      responseStatus: 200,
      lastError: null,
      externalExecutionId: "exec_123",
      requestPayload: {},
      responsePayload: {},
      metadata: null,
      dataClassification: "NON_SENSITIVE",
      createdAt: now,
      updatedAt: now
    },
    report: null,
    reportPackage: null
  } as any);

  assert.equal(summary.payment.billingEventId, "be_123");
  assert.equal(summary.payment.stripeEventId, "evt_123");
  assert.equal(summary.routing.routingSnapshotId, "rs_123");
  assert.equal(summary.routing.workflowCode, "AUDIT_SCALE");
  assert.equal(summary.execution.workflowDispatchId, "wd_123");
  assert.equal(summary.execution.externalExecutionId, "exec_123");
  assert.equal(summary.delivery.status, "DELIVERED");
  assert.equal(summary.delivery.reportId, "rep_123");

  console.log("delivery-reconciliation tests passed");
}

runDeliveryReconciliationTests();
