import assert from "node:assert/strict";
import {
  CanonicalWorkflowCode,
  CommercialPlanCode,
  RoutingSnapshotStatus
} from "@evolve-edge/db";
import {
  backfillAuditRequestedExecutionTargets,
  buildAuditRequestedPayload
} from "../lib/n8n";

function runWorkflowDispatchTests() {
  const payload = buildAuditRequestedPayload({
    routingSnapshot: {
      id: "rs_123",
      organizationId: "org_123",
      userId: "usr_123",
      sourceSystem: "stripe",
      sourceEventType: "checkout.session.completed",
      sourceEventId: "evt_123",
      sourceRecordType: "checkoutSession",
      sourceRecordId: "cs_test_123",
      planCode: CommercialPlanCode.SCALE,
      workflowCode: CanonicalWorkflowCode.AUDIT_SCALE,
      status: RoutingSnapshotStatus.DISPATCH_QUEUED,
      normalizedHintsJson: {
        route_key: "report.scale_enhanced",
        route_disposition: "upgraded",
        processing_tier: "enhanced",
        report_template: "scale_operating_report_from_snapshot",
        processing_depth: "scale",
        entitlement_summary: {
          workspace_access: true
        },
        quota_state: {
          audits_remaining: 9
        },
        feature_flags: {
          monitoring_enabled: true
        }
      },
      routingReasonJson: {
        codes: ["plan.scale"]
      }
    },
    dispatchId: "wd_123",
    correlationId: "corr_123"
  });

  assert.equal(payload.event_type, "audit.requested");
  assert.equal(payload.routing_snapshot_id, "rs_123");
  assert.equal(payload.dispatch_id, "wd_123");
  assert.equal(payload.routing.plan_code, "scale");
  assert.equal(payload.routing.workflow_code, "audit_scale");
  assert.equal(
    payload.routing.report_template,
    "scale_operating_report_from_snapshot"
  );
  assert.equal(payload.routing.processing_depth, "scale");
  assert.deepEqual(payload.routing.reason, {
    codes: ["plan.scale"]
  });
  assert.equal(payload.callbackAuth.scheme, "bearer");
  assert.equal(payload.callback_auth.scheme, "bearer");
  assert.equal(payload.statusCallbackUrl, payload.callbacks.status_url);
  assert.equal(payload.reportWritebackUrl, payload.callbacks.report_writeback_url);
  assert.equal(payload.workflow_code, "audit_scale");
  assert.equal(payload.routeKey, "report.scale_enhanced");
  assert.equal(payload.route_key, "report.scale_enhanced");
  assert.equal(payload.routeDisposition, "upgraded");
  assert.equal(payload.processingTier, "enhanced");
  assert.equal(payload.processing_tier, "enhanced");
  assert.equal(payload.report_template, "scale_operating_report_from_snapshot");
  assert.equal(payload.processing_depth, "scale");
  assert.deepEqual(payload.routing.quota_state, {
    audits_remaining: 9
  });
  assert.equal(payload.analysisProvider, "dify");
  assert.equal(payload.analysisModel, "dify-workflow");

  const repairedPayload = backfillAuditRequestedExecutionTargets(
    {
      workflowDispatchId: "wd_123",
      analysisProvider: " ",
      analysisModel: ""
    },
    {}
  );

  assert.equal(repairedPayload.repaired, true);
  assert.equal(repairedPayload.payload.analysisProvider, "dify");
  assert.equal(repairedPayload.payload.analysisModel, "dify-workflow");

  console.log("workflow-dispatch tests passed");
}

runWorkflowDispatchTests();
