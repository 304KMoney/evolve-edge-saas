import { Prisma, ReportStatus } from "@evolve-edge/db";
import { getCanonicalReportFinalizationState } from "./report-artifacts";
import {
  buildExecutiveReportHtml,
  buildExecutiveReportViewModel
} from "./report-view-model";

type JsonObject = Record<string, unknown>;

type WorkflowSnapshot = Parameters<typeof buildExecutiveReportViewModel>[0]["workflowSnapshot"];
type ExportReportRecord = Parameters<typeof buildExecutiveReportViewModel>[0]["report"] & {
  organizationId: string;
  artifactMetadataJson: Prisma.JsonValue | null;
  overallRiskPostureJson: Prisma.JsonValue | null;
};

export type ReportExportPayload =
  | {
      ok: true;
      status: 200;
      filenameBase: string;
      html: string;
      reportViewModel: ReturnType<typeof buildExecutiveReportViewModel>;
    }
  | {
      ok: false;
      status: 422;
      message: string;
    };

export function readReportOverallRiskPosture(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      score: null,
      level: null,
      summary: null
    };
  }

  const posture = value as Record<string, unknown>;
  return {
    score: typeof posture.score === "number" ? posture.score : null,
    level: typeof posture.level === "string" ? posture.level : null,
    summary: typeof posture.summary === "string" ? posture.summary : null
  };
}

export function readReportArtifactMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

function sanitizeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "executive-report"
  );
}

export function buildReportExportPayload(input: {
  report: ExportReportRecord;
  workflowSnapshot: WorkflowSnapshot;
}): ReportExportPayload {
  const overallRiskPosture = readReportOverallRiskPosture(
    input.report.overallRiskPostureJson
  );
  const finalization = getCanonicalReportFinalizationState({
    reportId: input.report.id,
    status: input.report.status as ReportStatus,
    artifactMetadata: readReportArtifactMetadata(input.report.artifactMetadataJson),
    executiveSummary: input.report.executiveSummary,
    overallRiskPosture,
    reportJson: input.report.reportJson,
    workflowState: input.workflowSnapshot.state
  });

  if (!finalization.canDownload) {
    return {
      ok: false,
      status: 422,
      message: finalization.customerMessage
    };
  }

  const reportViewModel = buildExecutiveReportViewModel({
    report: input.report,
    overallRiskPosture,
    workflowSnapshot: input.workflowSnapshot
  });

  return {
    ok: true,
    status: 200,
    filenameBase: sanitizeFilename(reportViewModel.title),
    html: buildExecutiveReportHtml(reportViewModel),
    reportViewModel
  };
}
