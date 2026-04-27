import assert from "node:assert/strict";
import { WorkflowDispatchStatus } from "@evolve-edge/db";
import {
  shouldSkipWorkflowReportReady,
  shouldSkipWorkflowStatusCallback
} from "../lib/workflow-callback-policy";

function runWorkflowCallbackPolicyTests() {
  assert.equal(
    shouldSkipWorkflowStatusCallback({
      currentStatus: WorkflowDispatchStatus.SUCCEEDED,
      currentExternalExecutionId: "exec_123",
      currentLastError: null,
      incomingStatus: "succeeded",
      incomingExternalExecutionId: "exec_123",
      incomingMessage: null
    }),
    true
  );

  assert.equal(
    shouldSkipWorkflowStatusCallback({
      currentStatus: WorkflowDispatchStatus.FAILED,
      currentExternalExecutionId: "exec_123",
      currentLastError: "Timed out",
      incomingStatus: "failed",
      incomingExternalExecutionId: "exec_123",
      incomingMessage: "Timed out"
    }),
    true
  );

  assert.equal(
    shouldSkipWorkflowStatusCallback({
      currentStatus: WorkflowDispatchStatus.FAILED,
      currentExternalExecutionId: "exec_123",
      currentLastError: "Older failure",
      incomingStatus: "failed",
      incomingExternalExecutionId: "exec_123",
      incomingMessage: "New failure"
    }),
    false
  );

  assert.equal(
    shouldSkipWorkflowReportReady({
      currentStatus: WorkflowDispatchStatus.SUCCEEDED,
      currentExternalExecutionId: "exec_123",
      currentResponsePayload: {
        reportReference: "rpt_123",
        reportUrl: "https://example.com/report",
        executiveSummary: "Ready",
        riskLevel: "Moderate",
        topConcerns: ["Identity", "Logging"]
      },
      incomingExternalExecutionId: "exec_123",
      reportReference: "rpt_123",
      reportUrl: "https://example.com/report",
      executiveSummary: "Ready",
      riskLevel: "Moderate",
      topConcerns: ["Identity", "Logging"]
    }),
    true
  );

  assert.equal(
    shouldSkipWorkflowReportReady({
      currentStatus: WorkflowDispatchStatus.SUCCEEDED,
      currentExternalExecutionId: "exec_123",
      currentResponsePayload: {
        reportReference: "rpt_123",
        reportUrl: "https://example.com/report",
        executiveSummary: "Ready",
        riskLevel: "Moderate",
        topConcerns: ["Identity", "Logging"]
      },
      incomingExternalExecutionId: "exec_123",
      reportReference: "rpt_123",
      reportUrl: "https://example.com/report",
      executiveSummary: "Ready",
      riskLevel: "Moderate",
      topConcerns: ["Identity", "Backups"]
    }),
    false
  );

  console.log("workflow-callback-policy tests passed");
}

runWorkflowCallbackPolicyTests();
