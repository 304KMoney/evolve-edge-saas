import {
  readOptionalEnumValue,
  readOptionalString,
  ValidationError,
  type JsonObject
} from "./security-validation";

export const WORKFLOW_STATUS_CALLBACK_VALUES = [
  "acknowledged",
  "running",
  "succeeded",
  "failed"
] as const;

export function readWorkflowStatusCallbackDispatchId(payload: JsonObject) {
  const dispatchId =
    readOptionalString(payload, "dispatchId", { maxLength: 200 }) ??
    readOptionalString(payload, "workflowDispatchId", { maxLength: 200 }) ??
    readOptionalString(payload, "dispatch_id", { maxLength: 200 }) ??
    readOptionalString(payload, "request_id", { maxLength: 200 });

  if (!dispatchId) {
    throw new ValidationError(
      "dispatchId, workflowDispatchId, dispatch_id, or request_id is required."
    );
  }

  return dispatchId;
}

export function readWorkflowStatusCallbackStatus(payload: JsonObject) {
  const explicitStatus =
    readOptionalEnumValue(payload, "status", WORKFLOW_STATUS_CALLBACK_VALUES) ??
    readOptionalEnumValue(payload, "executionStatus", WORKFLOW_STATUS_CALLBACK_VALUES);

  if (explicitStatus) {
    return explicitStatus;
  }

  const executionStage = readOptionalString(payload, "executionStage", {
    maxLength: 200
  });
  if (executionStage === "dispatch_accepted") {
    return "running";
  }

  throw new ValidationError(
    "status or executionStatus must be one of: acknowledged, running, succeeded, failed."
  );
}
