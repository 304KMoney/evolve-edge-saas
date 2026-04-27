import assert from "node:assert/strict";
import {
  buildWorkflowWritebackDuplicateBody,
  buildWorkflowWritebackErrorBody
} from "../lib/workflow-writeback-response-contract";

function runWorkflowWritebackResponseContractTests() {
  assert.deepEqual(
    buildWorkflowWritebackErrorBody({
      code: "malformed_payload",
      errorClass: "non_retryable_validation",
      retryable: false,
      operatorVisible: false,
      message: "dispatchId is required."
    }),
    {
      ok: false,
      error: {
        code: "malformed_payload",
        class: "non_retryable_validation",
        retryable: false,
        operatorVisible: false,
        message: "dispatchId is required."
      }
    }
  );

  assert.deepEqual(
    buildWorkflowWritebackDuplicateBody({
      dispatchId: "wd_123",
      correlationId: "corr_123",
      reportId: "rpt_123",
      reportReference: "report-123"
    }),
    {
      ok: true,
      accepted: true,
      deduplicated: true,
      dispatchId: "wd_123",
      correlationId: "corr_123",
      reportId: "rpt_123",
      reportReference: "report-123",
      outcome: {
        code: "duplicate_callback",
        class: "ignore_safely",
        retryable: false,
        operatorVisible: false,
        message:
          "This workflow writeback milestone was already processed and was ignored safely."
      }
    }
  );

  console.log("workflow-writeback-response-contract tests passed");
}

runWorkflowWritebackResponseContractTests();
