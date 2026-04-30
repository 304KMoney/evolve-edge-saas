import { WorkflowDispatchStatus } from "@evolve-edge/db";

const MAX_DISPATCH_ATTEMPTS = 5;

export function resolveRecoveredWorkflowDispatchState(input: {
  attemptCount: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const exhausted = input.attemptCount >= MAX_DISPATCH_ATTEMPTS;

  return {
    status: exhausted
      ? WorkflowDispatchStatus.FAILED
      : WorkflowDispatchStatus.PENDING,
    nextRetryAt: exhausted ? null : now,
    lastError: exhausted
      ? "Workflow dispatch exhausted retries after becoming stale in dispatch."
      : "Workflow dispatch was recovered after exceeding the dispatch timeout."
  };
}
