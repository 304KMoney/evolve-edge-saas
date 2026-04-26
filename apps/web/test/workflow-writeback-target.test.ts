import assert from "node:assert/strict";
import type { Prisma } from "@evolve-edge/db";
import {
  evaluateWorkflowWritebackTargetBinding,
  extractWorkflowDispatchIdFromReportJson,
} from "../lib/workflow-writeback-target";

function buildReportCandidate(overrides?: Partial<{
  id: string;
  organizationId: string;
  reportJson: Prisma.JsonValue;
}>) {
  return {
    id: overrides?.id ?? "rpt_123",
    organizationId: overrides?.organizationId ?? "org_123",
    reportJson:
      overrides?.reportJson ?? {
        workflowMetadata: {
          workflowDispatchId: "wd_123"
        }
      }
  };
}

function runWorkflowWritebackTargetTests() {
  assert.equal(
    extractWorkflowDispatchIdFromReportJson({
      workflowMetadata: {
        workflowDispatchId: "wd_123"
      }
    }),
    "wd_123"
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      reportCandidate: buildReportCandidate()
    }),
    {
      valid: true,
      reason: null
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      payloadReportReference: "external-report-123",
      reportCandidate: buildReportCandidate({
        reportJson: {}
      }),
      deliveryState: {
        organizationId: "org_123",
        reportId: null,
        externalResultReference: "external-report-123"
      }
    }),
    {
      valid: true,
      reason: null
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      payloadOrganizationId: "org_other",
      reportCandidate: buildReportCandidate()
    }),
    {
      valid: false,
      reason: "payload_organization_mismatch"
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      reportCandidate: buildReportCandidate({
        reportJson: {
          workflowMetadata: {
            workflowDispatchId: "wd_other"
          }
        }
      })
    }),
    {
      valid: false,
      reason: "report_dispatch_mismatch"
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      reportCandidate: buildReportCandidate({
        reportJson: {}
      }),
      deliveryState: {
        organizationId: "org_123",
        reportId: "rpt_other",
        externalResultReference: null
      }
    }),
    {
      valid: false,
      reason: "delivery_state_report_mismatch"
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      payloadReportReference: "external-report-123",
      reportCandidate: buildReportCandidate({
        reportJson: {}
      }),
      deliveryState: {
        organizationId: "org_123",
        reportId: null,
        externalResultReference: "external-report-other"
      }
    }),
    {
      valid: false,
      reason: "delivery_state_reference_mismatch"
    }
  );

  assert.deepEqual(
    evaluateWorkflowWritebackTargetBinding({
      dispatchId: "wd_123",
      dispatchOrganizationId: "org_123",
      reportCandidate: buildReportCandidate({
        reportJson: {}
      })
    }),
    {
      valid: false,
      reason: "missing_binding_proof"
    }
  );

  console.log("workflow-writeback-target tests passed");
}

runWorkflowWritebackTargetTests();
