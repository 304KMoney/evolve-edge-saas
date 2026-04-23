import assert from "node:assert/strict";
import {
  readWorkflowStatusCallbackDispatchId,
  readWorkflowStatusCallbackStatus
} from "../lib/workflow-status-callback";
import { ValidationError } from "../lib/security-validation";

function runWorkflowStatusCallbackTests() {
  assert.equal(
    readWorkflowStatusCallbackDispatchId({
      workflowDispatchId: "wd_123"
    }),
    "wd_123"
  );

  assert.equal(
    readWorkflowStatusCallbackDispatchId({
      dispatchId: "wd_456"
    }),
    "wd_456"
  );

  assert.equal(
    readWorkflowStatusCallbackStatus({
      executionStatus: "running"
    }),
    "running"
  );

  assert.equal(
    readWorkflowStatusCallbackStatus({
      executionStage: "dispatch_accepted"
    }),
    "running"
  );

  assert.throws(
    () => readWorkflowStatusCallbackDispatchId({}),
    (error) =>
      error instanceof ValidationError &&
      error.message ===
        "dispatchId, workflowDispatchId, dispatch_id, or request_id is required."
  );

  assert.throws(
    () => readWorkflowStatusCallbackStatus({}),
    (error) =>
      error instanceof ValidationError &&
      error.message ===
        "status or executionStatus must be one of: acknowledged, running, succeeded, failed."
  );

  console.log("workflow-status-callback tests passed");
}

runWorkflowStatusCallbackTests();
