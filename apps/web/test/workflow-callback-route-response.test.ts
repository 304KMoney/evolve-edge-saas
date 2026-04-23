import assert from "node:assert/strict";
import { buildWorkflowCallbackSuccessBody } from "../lib/workflow-callback-route-response";

function runWorkflowCallbackRouteResponseTests() {
  assert.deepEqual(
    buildWorkflowCallbackSuccessBody({
      dispatchId: "wd_123",
      status: "SUCCEEDED"
    }),
    {
      ok: true,
      dispatchId: "wd_123",
      status: "SUCCEEDED"
    }
  );

  assert.deepEqual(
    buildWorkflowCallbackSuccessBody({
      dispatchId: "wd_123",
      status: "FAILED",
      deduplicated: true
    }),
    {
      ok: true,
      dispatchId: "wd_123",
      status: "FAILED",
      deduplicated: true
    }
  );

  console.log("workflow-callback-route-response tests passed");
}

runWorkflowCallbackRouteResponseTests();
