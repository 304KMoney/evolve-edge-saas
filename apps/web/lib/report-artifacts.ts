import { ReportStatus } from "@evolve-edge/db";

export type ReportArtifactAvailabilityState =
  | "missing_report_id"
  | "not_ready"
  | "unavailable"
  | "ready";

export type ReportArtifactAvailability = {
  state: ReportArtifactAvailabilityState;
  canDownload: boolean;
  customerMessage: string;
};

export function getReportArtifactAvailability(input: {
  reportId?: string | null;
  status?: ReportStatus | null;
  artifactMetadata?: Record<string, unknown> | null;
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

  if (!input.status) {
    return {
      state: "unavailable",
      canDownload: false,
      customerMessage:
        "This report artifact is not currently available. Please contact support if you expected it to be ready."
    };
  }

  const downloadStatus =
    typeof input.artifactMetadata?.downloadStatus === "string"
      ? input.artifactMetadata.downloadStatus
      : null;

  if (downloadStatus === "failed") {
    return {
      state: "unavailable",
      canDownload: false,
      customerMessage:
        "We could not prepare a downloadable artifact for this report yet. Support can help review the delivery state if needed."
    };
  }

  if (downloadStatus === "not_ready") {
    return {
      state: "not_ready",
      canDownload: false,
      customerMessage:
        "This report is still being finalized. The export artifact will appear here as soon as preparation is complete."
    };
  }

  if (downloadStatus === "ready" || downloadStatus === "delivered") {
    return {
      state: "ready",
      canDownload: true,
      customerMessage:
        "This report artifact is ready for secure viewing and download."
    };
  }

  switch (input.status) {
    case ReportStatus.READY:
    case ReportStatus.DELIVERED:
    case ReportStatus.SUPERSEDED:
      return {
        state: "ready",
        canDownload: true,
        customerMessage:
          "This report artifact is ready for secure viewing and download."
      };
    case ReportStatus.PENDING:
    case ReportStatus.PROCESSING:
      return {
        state: "not_ready",
        canDownload: false,
        customerMessage:
          "This report is still being finalized. The export artifact will appear here as soon as preparation is complete."
      };
    case ReportStatus.FAILED:
    default:
      return {
        state: "unavailable",
        canDownload: false,
        customerMessage:
          "We could not prepare a downloadable artifact for this report yet. Support can help review the delivery state if needed."
      };
  }
}
