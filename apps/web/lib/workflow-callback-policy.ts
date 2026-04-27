import { WorkflowDispatchStatus } from "@evolve-edge/db";

type WorkflowStatusCallbackInputStatus =
  | "acknowledged"
  | "running"
  | "succeeded"
  | "failed";

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(values: string[] | null | undefined) {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

function readResponsePayloadRecord(
  value: unknown
): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function shouldSkipWorkflowStatusCallback(input: {
  currentStatus: WorkflowDispatchStatus;
  currentExternalExecutionId?: string | null;
  currentLastError?: string | null;
  incomingStatus: WorkflowStatusCallbackInputStatus;
  incomingExternalExecutionId?: string | null;
  incomingMessage?: string | null;
}) {
  if (input.incomingStatus === "succeeded") {
    return input.currentStatus === WorkflowDispatchStatus.SUCCEEDED;
  }

  if (input.incomingStatus === "failed") {
    return (
      input.currentStatus === WorkflowDispatchStatus.FAILED &&
      normalizeString(input.currentExternalExecutionId) ===
        normalizeString(input.incomingExternalExecutionId) &&
      normalizeString(input.currentLastError) === normalizeString(input.incomingMessage)
    );
  }

  if (input.incomingStatus === "acknowledged" || input.incomingStatus === "running") {
    return (
      input.currentStatus === WorkflowDispatchStatus.ACKNOWLEDGED &&
      normalizeString(input.currentExternalExecutionId) ===
        normalizeString(input.incomingExternalExecutionId)
    );
  }

  return false;
}

export function shouldSkipWorkflowReportReady(input: {
  currentStatus: WorkflowDispatchStatus;
  currentExternalExecutionId?: string | null;
  currentResponsePayload?: unknown;
  incomingExternalExecutionId?: string | null;
  reportReference?: string | null;
  reportUrl?: string | null;
  executiveSummary?: string | null;
  riskLevel?: string | null;
  topConcerns?: string[] | null;
}) {
  if (input.currentStatus !== WorkflowDispatchStatus.SUCCEEDED) {
    return false;
  }

  const currentPayload = readResponsePayloadRecord(input.currentResponsePayload);
  const currentTopConcerns = Array.isArray(currentPayload?.topConcerns)
    ? currentPayload.topConcerns.filter((value): value is string => typeof value === "string")
    : [];

  return (
    normalizeString(input.currentExternalExecutionId) ===
      normalizeString(input.incomingExternalExecutionId) &&
    normalizeString((currentPayload?.reportReference as string | null | undefined) ?? null) ===
      normalizeString(input.reportReference) &&
    normalizeString((currentPayload?.reportUrl as string | null | undefined) ?? null) ===
      normalizeString(input.reportUrl) &&
    normalizeString((currentPayload?.executiveSummary as string | null | undefined) ?? null) ===
      normalizeString(input.executiveSummary) &&
    normalizeString((currentPayload?.riskLevel as string | null | undefined) ?? null) ===
      normalizeString(input.riskLevel) &&
    JSON.stringify(normalizeStringArray(currentTopConcerns)) ===
      JSON.stringify(normalizeStringArray(input.topConcerns))
  );
}
