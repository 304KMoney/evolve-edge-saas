import { Prisma, ReportStatus } from "@evolve-edge/db";

type JsonObject = Record<string, unknown>;

type ReportWorkflowState =
  | "completed"
  | "failed"
  | "queued"
  | "running"
  | "unavailable";

type OverallRiskPostureLike = {
  score: number | null;
  level: string | null;
  summary: string | null;
};

export type ReportArtifactAvailabilityState =
  | "missing_report_id"
  | "not_ready"
  | "unavailable"
  | "ready";

export type CanonicalReportFinalizationState =
  | "exportable"
  | "failed"
  | "pending";

export type CanonicalReportFinalization = {
  state: CanonicalReportFinalizationState;
  canDownload: boolean;
  isRetryable: boolean;
  hasUsableContent: boolean;
  customerMessage: string;
};

export type ReportArtifactAvailability = {
  state: ReportArtifactAvailabilityState;
  canDownload: boolean;
  customerMessage: string;
};

function readJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasNonEmptyArray(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

export function hasUsableNormalizedReportContent(input: {
  executiveSummary?: string | null;
  overallRiskPosture?: OverallRiskPostureLike | null;
  reportJson?: Prisma.JsonValue | null;
}) {
  const reportJson = readJsonObject(input.reportJson);
  const posture = input.overallRiskPosture ?? null;

  return (
    readString(input.executiveSummary) !== null ||
    readString(reportJson?.executiveSummary) !== null ||
    readString(reportJson?.finalReportText) !== null ||
    readString(posture?.summary) !== null ||
    readString(posture?.level) !== null ||
    readNumber(posture?.score) !== null ||
    readString(reportJson?.riskSummary) !== null ||
    readString(reportJson?.riskLevel) !== null ||
    readNumber(reportJson?.postureScore) !== null ||
    hasNonEmptyArray(reportJson?.findings) ||
    hasNonEmptyArray(reportJson?.roadmap) ||
    hasNonEmptyArray(reportJson?.topConcerns) ||
    hasNonEmptyArray(reportJson?.gaps)
  );
}

export function getCanonicalReportFinalizationState(input: {
  reportId?: string | null;
  status?: ReportStatus | null;
  artifactMetadata?: Record<string, unknown> | null;
  executiveSummary?: string | null;
  overallRiskPosture?: OverallRiskPostureLike | null;
  reportJson?: Prisma.JsonValue | null;
  workflowState?: ReportWorkflowState | null;
}): CanonicalReportFinalization {
  const hasUsableContent = hasUsableNormalizedReportContent({
    executiveSummary: input.executiveSummary,
    overallRiskPosture: input.overallRiskPosture,
    reportJson: input.reportJson
  });
  const downloadStatus =
    typeof input.artifactMetadata?.downloadStatus === "string"
      ? input.artifactMetadata.downloadStatus
      : null;

  if (hasUsableContent) {
    return {
      state: "exportable",
      canDownload: true,
      isRetryable: false,
      hasUsableContent: true,
      customerMessage:
        "This report is ready for secure viewing and HTML download."
    };
  }

  const failed =
    downloadStatus === "failed" ||
    input.workflowState === "failed" ||
    input.status === ReportStatus.FAILED ||
    input.status === ReportStatus.REJECTED;

  if (failed) {
    return {
      state: "failed",
      canDownload: false,
      isRetryable: true,
      hasUsableContent: false,
      customerMessage:
        "This report could not be finalized from a validated snapshot yet. Review the workflow state and retry generation."
    };
  }

  return {
    state: "pending",
    canDownload: false,
    isRetryable: false,
    hasUsableContent: false,
    customerMessage:
      "This report is still being finalized. The HTML export will appear here as soon as validated content is available."
  };
}

export function getReportArtifactAvailability(input: {
  reportId?: string | null;
  status?: ReportStatus | null;
  artifactMetadata?: Record<string, unknown> | null;
  executiveSummary?: string | null;
  overallRiskPosture?: OverallRiskPostureLike | null;
  reportJson?: Prisma.JsonValue | null;
  workflowState?: ReportWorkflowState | null;
}): ReportArtifactAvailability {
  const reportId = input.reportId?.trim();

  if (!reportId) {
    return {
      state: "missing_report_id",
      canDownload: false,
      customerMessage:
        "A report identifier is required before we can open or prepare a report artifact."
    };
  }

  const finalization = getCanonicalReportFinalizationState(input);

  switch (finalization.state) {
    case "exportable":
      return {
        state: "ready",
        canDownload: true,
        customerMessage: finalization.customerMessage
      };
    case "failed":
      return {
        state: "unavailable",
        canDownload: false,
        customerMessage: finalization.customerMessage
      };
    case "pending":
    default:
      return {
        state: "not_ready",
        canDownload: false,
        customerMessage: finalization.customerMessage
      };
  }
}
