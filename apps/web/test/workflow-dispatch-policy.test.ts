import assert from "node:assert/strict";
import { WorkflowDispatchStatus } from "@evolve-edge/db";
import { resolveRecoveredWorkflowDispatchState } from "../lib/workflow-dispatch-policy";

function runWorkflowDispatchPolicyTests() {
  const now = new Date("2026-04-22T16:00:00.000Z");

  assert.deepEqual(
    resolveRecoveredWorkflowDispatchState({
      attemptCount: 2,
      now
    }),
    {
      status: WorkflowDispatchStatus.PENDING,
      nextRetryAt: now,
      lastError: "Workflow dispatch was recovered after exceeding the dispatch timeout."
    }
  );

  assert.deepEqual(
    resolveRecoveredWorkflowDispatchState({
      attemptCount: 5,
      now
    }),
    {
      status: WorkflowDispatchStatus.FAILED,
      nextRetryAt: null,
      lastError: "Workflow dispatch exhausted retries after becoming stale in dispatch."
    }
  );

  console.log("workflow-dispatch-policy tests passed");
}

runWorkflowDispatchPolicyTests();
