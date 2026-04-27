import type {
  WorkflowWritebackErrorClass,
  WorkflowWritebackErrorCode,
  WorkflowWritebackOutcomeCode
} from "./workflow-writeback-errors";

export function buildWorkflowWritebackErrorBody(input: {
  code: WorkflowWritebackErrorCode;
  errorClass: WorkflowWritebackErrorClass;
  retryable: boolean;
  operatorVisible: boolean;
  message: string;
}) {
  return {
    ok: false,
    error: {
      code: input.code,
      class: input.errorClass,
      retryable: input.retryable,
      operatorVisible: input.operatorVisible,
      message: input.message
    }
  };
}

export function buildWorkflowWritebackDuplicateBody(input: {
  dispatchId: string;
  correlationId: string;
  reportId: string;
  reportReference: string | null;
  outcomeCode?: WorkflowWritebackOutcomeCode;
}) {
  return {
    ok: true,
    accepted: true,
    deduplicated: true,
    dispatchId: input.dispatchId,
    correlationId: input.correlationId,
    reportId: input.reportId,
    reportReference: input.reportReference,
    outcome: {
      code: input.outcomeCode ?? "duplicate_callback",
      class: "ignore_safely" as const,
      retryable: false,
      operatorVisible: false,
      message:
        "This workflow writeback milestone was already processed and was ignored safely."
    }
  };
}
