import assert from "node:assert/strict";
import { resolveWorkflowWritebackCustomerRunReconciliation } from "../lib/workflow-writeback-reconciliation";

function runWorkflowWritebackReconciliationTests() {
  assert.deepEqual(
    resolveWorkflowWritebackCustomerRunReconciliation({
      reportStatus: "ready",
      deliveryStatus: "generated"
    }),
    {
      reportGenerationFailed: false,
      reportGenerated: true,
      deliveryCompleted: false
    }
  );

  assert.deepEqual(
    resolveWorkflowWritebackCustomerRunReconciliation({
      reportStatus: "delivered",
      deliveryStatus: "briefing_completed"
    }),
    {
      reportGenerationFailed: false,
      reportGenerated: true,
      deliveryCompleted: true
    }
  );

  assert.deepEqual(
    resolveWorkflowWritebackCustomerRunReconciliation({
      reportStatus: "failed",
      deliveryStatus: null
    }),
    {
      reportGenerationFailed: true,
      reportGenerated: false,
      deliveryCompleted: false
    }
  );

  assert.deepEqual(
    resolveWorkflowWritebackCustomerRunReconciliation({
      reportStatus: "processing",
      deliveryStatus: null
    }),
    {
      reportGenerationFailed: false,
      reportGenerated: false,
      deliveryCompleted: false
    }
  );

  console.log("workflow-writeback-reconciliation tests passed");
}

runWorkflowWritebackReconciliationTests();
