export type WorkflowCallbackRouteErrorCode =
  | "unauthorized_callback"
  | "malformed_payload"
  | "callback_processing_failed";

export type WorkflowCallbackRouteErrorClass =
  | "non_retryable_validation"
  | "retryable";

export function buildWorkflowCallbackErrorBody(input: {
  code: WorkflowCallbackRouteErrorCode;
  errorClass: WorkflowCallbackRouteErrorClass;
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
