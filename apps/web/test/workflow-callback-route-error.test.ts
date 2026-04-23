import assert from "node:assert/strict";
import { buildWorkflowCallbackErrorBody } from "../lib/workflow-callback-route-error";

function runWorkflowCallbackRouteErrorTests() {
  assert.deepEqual(
    buildWorkflowCallbackErrorBody({
      code: "unauthorized_callback",
      errorClass: "non_retryable_validation",
      retryable: false,
      operatorVisible: false,
      message: "Unauthorized workflow callback request."
    }),
    {
      ok: false,
      error: {
        code: "unauthorized_callback",
        class: "non_retryable_validation",
        retryable: false,
        operatorVisible: false,
        message: "Unauthorized workflow callback request."
      }
    }
  );

  assert.deepEqual(
    buildWorkflowCallbackErrorBody({
      code: "callback_processing_failed",
      errorClass: "retryable",
      retryable: true,
      operatorVisible: true,
      message: "Unknown error"
    }),
    {
      ok: false,
      error: {
        code: "callback_processing_failed",
        class: "retryable",
        retryable: true,
        operatorVisible: true,
        message: "Unknown error"
      }
    }
  );

  console.log("workflow-callback-route-error tests passed");
}

runWorkflowCallbackRouteErrorTests();
