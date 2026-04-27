import {
  CommercialPlanCode,
  CustomerAccessGrantScopeType,
  Prisma,
  prisma,
  ReportStatus
} from "@evolve-edge/db";
import type { AuditWorkflowOutput } from "../src/server/ai/providers/types";
import { createPlaceholderCustomerAccessGrant } from "./customer-access-grants";
import {
  listActiveCustomerAccessGrantRecords,
  mapCustomerAccessGrantRecordToGrant
} from "./customer-access-grant-records";
import type { CustomerAccessSession } from "./customer-access-session";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError,
} from "./prisma-runtime";
import { getReportArtifactAvailability } from "./report-artifacts";
import { evaluateCustomerReportAccess } from "./report-access-control";

type ReportRecordsDbClient = Prisma.TransactionClient | typeof prisma;
type DashboardReportListRecord = Awaited<
  ReturnType<typeof listDashboardReportsForAccessSession>
>[number];
type DashboardReportDetailRecord = NonNullable<
  Awaited<ReturnType<typeof getDashboardReportDetailForAccessSession>>
>;

type JsonObject = Record<string, unknown>;

function toCommercialPlanCode(
  selectedPlan: "starter" | "scale" | "enterprise" | null | undefined
) {
  switch (selectedPlan) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    case null:
      return null;
    default:
      return undefined;
  }
}

function fromCommercialPlanCode(
  selectedPlan: CommercialPlanCode | null | undefined
): "starter" | "scale" | "enterprise" | null {
  switch (selectedPlan) {
    case CommercialPlanCode.STARTER:
      return "starter";
    case CommercialPlanCode.SCALE:
      return "scale";
    case CommercialPlanCode.ENTERPRISE:
      return "enterprise";
    default:
      return null;
  }
}

function readJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getFallbackReportJson(report: { reportJson: Prisma.JsonValue }) {
  return readJsonObject(report.reportJson);
}

function getDurableExecutiveSummary(report: {
  executiveSummary: string | null;
  reportJson: Prisma.JsonValue;
}) {
  // Prefer the durable report snapshot field so dashboard/report delivery
  // reads converge on app-owned state. Fall back to legacy reportJson while
  // live population of the durable summary is still rolling out.
  const durableSummary = readString(report.executiveSummary);
  if (durableSummary) {
    return {
      value: durableSummary,
      source: "durable_report_record" as const
    };
  }

  const fallbackSummary = readString(getFallbackReportJson(report)?.executiveSummary);
  return {
    value: fallbackSummary,
    source: fallbackSummary ? ("fallback_report_json" as const) : ("missing" as const)
  };
}

function getDurableOverallRiskPosture(report: {
  overallRiskPostureJson: Prisma.JsonValue | null;
  reportJson: Prisma.JsonValue;
}) {
  // Keep the durable posture snapshot as the primary source of truth for
  // dashboard hydration, with reportJson retained as a local/demo-safe
  // compatibility fallback until every live report writes the new field.
  const durablePosture = readJsonObject(report.overallRiskPostureJson);
  if (durablePosture) {
    return {
      score: readNumber(durablePosture.score),
      level: readString(durablePosture.level),
      summary: readString(durablePosture.summary),
      source: "durable_report_record" as const
    };
  }

  const fallbackReportJson = getFallbackReportJson(report);
  return {
    score: readNumber(fallbackReportJson?.postureScore),
    level: readString(fallbackReportJson?.riskLevel),
    summary: readString(fallbackReportJson?.riskSummary),
    source: fallbackReportJson ? ("fallback_report_json" as const) : ("missing" as const)
  };
}

function getArtifactMetadataSnapshot(report: {
  artifactMetadataJson: Prisma.JsonValue | null;
}) {
  return readJsonObject(report.artifactMetadataJson);
}

function getDurableDeliveryStatus(report: {
  reportJson: Prisma.JsonValue;
}) {
  return readString(getFallbackReportJson(report)?.deliveryStatus);
}

function getDurableDeliveryMessage(report: {
  reportJson: Prisma.JsonValue;
}) {
  return readString(getFallbackReportJson(report)?.deliveryMessage);
}

function toReportStatus(
  status:
    | "received"
    | "processing"
    | "awaiting_review"
    | "ready"
    | "delivered"
    | "failed"
    | null
    | undefined
) {
  switch (status) {
    case "received":
      return ReportStatus.PENDING;
    case "processing":
      return ReportStatus.PROCESSING;
    case "awaiting_review":
      return ReportStatus.PENDING_REVIEW;
    case "ready":
      return ReportStatus.APPROVED;
    case "delivered":
      return ReportStatus.DELIVERED;
    case "failed":
      return ReportStatus.FAILED;
    default:
      return undefined;
  }
}

function mergeReportJsonPatch(input: {
  existingReportJson: Prisma.JsonValue;
  executiveSummary?: string | null;
  overallRiskPosture?: {
    score: number | null;
    level: string | null;
    summary: string | null;
  } | null;
  findings?: string[] | null;
  gaps?: string[] | null;
  actions?: string[] | null;
  roadmap?: {
    days30: string[] | null;
    days60: string[] | null;
    days90: string[] | null;
  } | null;
  deliveryUpdate?: {
    deliveryStatus: "generated" | "reviewed" | "sent" | "briefing_booked" | "briefing_completed" | "failed" | null;
    deliveredAt: string | null;
    deliveryMessage: string | null;
  } | null;
}) {
  const nextReportJson: Record<string, Prisma.InputJsonValue | null> = {};
  const existingReportJson = readJsonObject(input.existingReportJson) ?? {};

  for (const [key, value] of Object.entries(existingReportJson)) {
    nextReportJson[key] = value as Prisma.InputJsonValue | null;
  }

  if (input.executiveSummary !== undefined) {
    nextReportJson.executiveSummary = input.executiveSummary;
  }

  if (input.overallRiskPosture !== undefined) {
    if (input.overallRiskPosture === null) {
      nextReportJson.postureScore = null;
      nextReportJson.riskLevel = null;
      nextReportJson.riskSummary = null;
    } else {
      if (input.overallRiskPosture.score !== undefined) {
        nextReportJson.postureScore = input.overallRiskPosture.score;
      }
      if (input.overallRiskPosture.level !== undefined) {
        nextReportJson.riskLevel = input.overallRiskPosture.level;
      }
      if (input.overallRiskPosture.summary !== undefined) {
        nextReportJson.riskSummary = input.overallRiskPosture.summary;
      }
    }
  }

  if (input.findings !== undefined) {
    nextReportJson.findings = input.findings;
  }

  if (input.gaps !== undefined) {
    nextReportJson.gaps = input.gaps;
  }

  if (input.actions !== undefined) {
    nextReportJson.actions = input.actions;
  }

  if (input.roadmap !== undefined) {
    const existingRoadmapValue = readJsonObject(nextReportJson.roadmap) ?? {};
    const existingRoadmap: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, value] of Object.entries(existingRoadmapValue)) {
      existingRoadmap[key] = value as Prisma.InputJsonValue | null;
    }

    nextReportJson.roadmap =
      input.roadmap === null
        ? null
        : {
            ...existingRoadmap,
            ...(input.roadmap.days30 !== null && input.roadmap.days30 !== undefined
              ? { days30: input.roadmap.days30 }
              : {}),
            ...(input.roadmap.days60 !== null && input.roadmap.days60 !== undefined
              ? { days60: input.roadmap.days60 }
              : {}),
            ...(input.roadmap.days90 !== null && input.roadmap.days90 !== undefined
              ? { days90: input.roadmap.days90 }
              : {})
          };
  }

  if (input.deliveryUpdate !== undefined) {
    if (input.deliveryUpdate === null) {
      nextReportJson.deliveryStatus = null;
      nextReportJson.deliveryMessage = null;
      nextReportJson.deliveryUpdatedAt = null;
    } else {
      if (input.deliveryUpdate.deliveryStatus !== undefined) {
        nextReportJson.deliveryStatus = input.deliveryUpdate.deliveryStatus;
      }
      if (input.deliveryUpdate.deliveryMessage !== undefined) {
        nextReportJson.deliveryMessage = input.deliveryUpdate.deliveryMessage;
      }
      if (input.deliveryUpdate.deliveredAt !== undefined) {
        nextReportJson.deliveryUpdatedAt = input.deliveryUpdate.deliveredAt;
      }
    }
  }

  return nextReportJson;
}

function mergeArtifactMetadataPatch(input: {
  reportId: string;
  existingArtifactMetadataJson: Prisma.JsonValue | null;
  artifactUpdate?: {
    artifactType: string | null;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    downloadStatus: "not_ready" | "ready" | "delivered" | "failed" | null;
    downloadUrl: string | null;
    availableAt: string | null;
  } | null;
}) {
  if (input.artifactUpdate === undefined) {
    return undefined;
  }

  const nextArtifactMetadata: Record<string, Prisma.InputJsonValue | null> = {};
  const existingArtifactMetadata =
    readJsonObject(input.existingArtifactMetadataJson) ?? {};

  for (const [key, value] of Object.entries(existingArtifactMetadata)) {
    nextArtifactMetadata[key] = value as Prisma.InputJsonValue | null;
  }

  if (input.artifactUpdate === null) {
    return Prisma.JsonNull;
  }

  if (input.artifactUpdate.artifactType !== undefined) {
    nextArtifactMetadata.artifactType = input.artifactUpdate.artifactType;
  }
  if (input.artifactUpdate.fileName !== undefined) {
    nextArtifactMetadata.fileName = input.artifactUpdate.fileName;
  }
  if (input.artifactUpdate.mimeType !== undefined) {
    nextArtifactMetadata.mimeType = input.artifactUpdate.mimeType;
  }
  if (input.artifactUpdate.fileSize !== undefined) {
    nextArtifactMetadata.fileSize = input.artifactUpdate.fileSize;
  }
  if (input.artifactUpdate.downloadStatus !== undefined) {
    nextArtifactMetadata.downloadStatus = input.artifactUpdate.downloadStatus;
  }
  if (input.artifactUpdate.availableAt !== undefined) {
    nextArtifactMetadata.availableAt = input.artifactUpdate.availableAt;
  }
  if (input.artifactUpdate.downloadUrl !== undefined) {
    nextArtifactMetadata.downloadUrl = input.artifactUpdate.downloadUrl;
  }

  // Keep the app-owned export route available as a stable dashboard/download
  // action target even when n8n only knows an external storage reference.
  nextArtifactMetadata.downloadRoute = `/api/reports/${input.reportId}/export`;

  return nextArtifactMetadata;
}

let compatibleGeneratedReportStatusCache: ReportStatus | null = null;

async function getCompatibleGeneratedReportStatus(
  db: ReportRecordsDbClient = prisma
) {
  if (compatibleGeneratedReportStatusCache) {
    return compatibleGeneratedReportStatusCache;
  }

  try {
    const rows = await db.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE lower(t.typname) = lower('ReportStatus')
      ORDER BY e.enumsortorder
    `;

    const supportsGenerated = rows.some((row) => row.value === ReportStatus.GENERATED);
    compatibleGeneratedReportStatusCache = supportsGenerated
      ? ReportStatus.GENERATED
      : ReportStatus.PENDING_REVIEW;

    if (!supportsGenerated) {
      logPrismaRuntimeCompatibilityError(
        "report.persist_validated_workflow.generated_status_preflight",
        new Error("ReportStatus enum does not currently include GENERATED."),
        {
          fallbackStatus: ReportStatus.PENDING_REVIEW,
        }
      );
    }

    return compatibleGeneratedReportStatusCache;
  } catch (error) {
    if (!isPrismaRuntimeCompatibilityError(error)) {
      throw error;
    }

    compatibleGeneratedReportStatusCache = ReportStatus.PENDING_REVIEW;
    logPrismaRuntimeCompatibilityError(
      "report.persist_validated_workflow.generated_status_preflight",
      error,
      {
        fallbackStatus: ReportStatus.PENDING_REVIEW,
      }
    );
    return compatibleGeneratedReportStatusCache;
  }
}

export type DashboardReportSummaryView = {
  id: string;
  title: string;
  status: string;
  deliveryStatus: string | null;
  deliveryMessage: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  assessment: {
    name: string;
  };
  assessmentName: string;
  organizationName: string | null;
  selectedPlan: "starter" | "scale" | "enterprise" | null;
  postureScore: number | null;
  riskLevel: string | null;
  executiveSummary: string | null;
  artifactMetadata: JsonObject | null;
  artifactAvailability: ReturnType<typeof getReportArtifactAvailability>;
  dataSources: {
    executiveSummary: "durable_report_record" | "fallback_report_json" | "missing";
    overallRiskPosture: "durable_report_record" | "fallback_report_json" | "missing";
  };
};

export type DashboardReportDetailView = {
  report: DashboardReportDetailRecord;
  organizationName: string | null;
  selectedPlan: "starter" | "scale" | "enterprise" | null;
  executiveSummary: string | null;
  deliveryStatus: string | null;
  deliveryMessage: string | null;
  overallRiskPosture: {
    score: number | null;
    level: string | null;
    summary: string | null;
    source: "durable_report_record" | "fallback_report_json" | "missing";
  };
  artifactMetadata: JsonObject | null;
  artifactAvailability: ReturnType<typeof getReportArtifactAvailability>;
  dataSources: {
    executiveSummary: "durable_report_record" | "fallback_report_json" | "missing";
  };
};

function mapDashboardReportSummaryView(
  report: DashboardReportListRecord
): DashboardReportSummaryView {
  const executiveSummary = getDurableExecutiveSummary(report);
  const overallRiskPosture = getDurableOverallRiskPosture(report);
  const artifactMetadata = getArtifactMetadataSnapshot(report);

  return {
    id: report.id,
    title: report.title,
    status: report.status,
    deliveryStatus: getDurableDeliveryStatus(report),
    deliveryMessage: getDurableDeliveryMessage(report),
    createdAt: report.createdAt,
    publishedAt: report.publishedAt,
    assessment: {
      name: report.assessment.name
    },
    assessmentName: report.assessment.name,
    organizationName: readString(report.organizationNameSnapshot) ?? report.organization.name,
    selectedPlan: fromCommercialPlanCode(report.selectedPlan),
    postureScore: overallRiskPosture.score,
    riskLevel: overallRiskPosture.level,
    executiveSummary: executiveSummary.value,
    artifactMetadata,
    artifactAvailability: getReportArtifactAvailability({
      reportId: report.id,
      status: report.status,
      artifactMetadata
    }),
    dataSources: {
      executiveSummary: executiveSummary.source,
      overallRiskPosture: overallRiskPosture.source
    }
  };
}

function mapDashboardReportDetailView(
  report: DashboardReportDetailRecord
): DashboardReportDetailView {
  const executiveSummary = getDurableExecutiveSummary(report);
  const overallRiskPosture = getDurableOverallRiskPosture(report);
  const artifactMetadata = getArtifactMetadataSnapshot(report);

  return {
    report,
    organizationName: readString(report.organizationNameSnapshot) ?? report.organization.name,
    selectedPlan: fromCommercialPlanCode(report.selectedPlan),
    executiveSummary: executiveSummary.value,
    deliveryStatus: getDurableDeliveryStatus(report),
    deliveryMessage: getDurableDeliveryMessage(report),
    overallRiskPosture,
    artifactMetadata,
    artifactAvailability: getReportArtifactAvailability({
      reportId: report.id,
      status: report.status,
      artifactMetadata
    }),
    dataSources: {
      executiveSummary: executiveSummary.source
    }
  };
}

export async function getReportAccessCandidateById(
  reportId: string,
  db: ReportRecordsDbClient = prisma
) {
  return db.report.findUnique({
    where: {
      id: reportId
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      deliveredAt: true
    }
  });
}

export async function updateReportRecordSnapshot(input: {
  db?: ReportRecordsDbClient;
  reportId: string;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
  executiveSummary?: string | null;
  overallRiskPostureJson?: Prisma.InputJsonValue;
  artifactMetadataJson?: Prisma.InputJsonValue;
  customerAccountId?: string | null;
}) {
  const db = input.db ?? prisma;

  return db.report.update({
    where: {
      id: input.reportId
    },
    data: {
      organizationNameSnapshot:
        input.organizationNameSnapshot === undefined
          ? undefined
          : input.organizationNameSnapshot,
      customerEmailSnapshot:
        input.customerEmailSnapshot === undefined
          ? undefined
          : input.customerEmailSnapshot,
      selectedPlan:
        input.selectedPlan === undefined
          ? undefined
          : toCommercialPlanCode(input.selectedPlan),
      executiveSummary:
        input.executiveSummary === undefined ? undefined : input.executiveSummary,
      overallRiskPostureJson:
        input.overallRiskPostureJson === undefined
          ? undefined
          : input.overallRiskPostureJson,
      artifactMetadataJson:
        input.artifactMetadataJson === undefined
          ? undefined
          : input.artifactMetadataJson,
      customerAccountId:
        input.customerAccountId === undefined ? undefined : input.customerAccountId
    }
  });
}

export async function ensurePendingAssessmentReport(input: {
  db?: ReportRecordsDbClient;
  organizationId: string;
  assessmentId: string;
  assessmentName: string;
  createdByUserId?: string | null;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
  customerAccountId?: string | null;
  engagementProgramId?: string | null;
}) {
  const db = input.db ?? prisma;
  const existing = await db.report.findFirst({
    where: {
      assessmentId: input.assessmentId,
      status: {
        in: [ReportStatus.PENDING, ReportStatus.PROCESSING]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return existing;
  }

  const existingReportCount = await db.report.count({
    where: { assessmentId: input.assessmentId }
  });

  return db.report.create({
    data: {
      organizationId: input.organizationId,
      assessmentId: input.assessmentId,
      engagementProgramId: input.engagementProgramId ?? null,
      customerAccountId: input.customerAccountId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      title: `${input.assessmentName} Executive Audit Report`,
      versionLabel: `v${existingReportCount + 1}`,
      organizationNameSnapshot: input.organizationNameSnapshot ?? null,
      customerEmailSnapshot: input.customerEmailSnapshot ?? null,
      selectedPlan:
        input.selectedPlan === undefined
          ? undefined
          : toCommercialPlanCode(input.selectedPlan),
      status: ReportStatus.PENDING,
      reportJson: {},
      artifactMetadataJson: {
        downloadStatus: "not_ready"
      }
    }
  });
}

export async function getReportRecordForWriteback(input: {
  db?: ReportRecordsDbClient;
  reportId?: string | null;
  reportReference?: string | null;
}) {
  const db = input.db ?? prisma;
  const reportId = input.reportId?.trim() || null;
  const reportReference = input.reportReference?.trim() || null;

  const findReportById = (id: string) =>
    db.report.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        customerAccountId: true,
        reportJson: true,
        artifactMetadataJson: true,
        status: true
      }
    });

  if (reportId) {
    return findReportById(reportId);
  }

  if (!reportReference) {
    return null;
  }

  const directReport = await findReportById(reportReference);
  if (directReport) {
    return directReport;
  }

  const linkedDeliveryState = await db.deliveryStateRecord.findFirst({
    where: {
      externalResultReference: reportReference,
      reportId: { not: null }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      reportId: true
    }
  });

  if (!linkedDeliveryState?.reportId) {
    return null;
  }

  return findReportById(linkedDeliveryState.reportId);
}

export async function persistNormalizedReportWriteback(input: {
  db?: ReportRecordsDbClient;
  reportId?: string | null;
  reportReference?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
  reportStatus?: "received" | "processing" | "awaiting_review" | "ready" | "delivered" | "failed" | null;
  executiveSummary?: string | null;
  overallRiskPosture?: {
    score: number | null;
    level: string | null;
    summary: string | null;
  } | null;
  findings?: string[] | null;
  gaps?: string[] | null;
  actions?: string[] | null;
  roadmap?: {
    days30: string[] | null;
    days60: string[] | null;
    days90: string[] | null;
  } | null;
  artifactUpdate?: {
    artifactType: string | null;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    downloadStatus: "not_ready" | "ready" | "delivered" | "failed" | null;
    downloadUrl: string | null;
    availableAt: string | null;
  } | null;
  deliveryUpdate?: {
    deliveryStatus: "generated" | "reviewed" | "sent" | "briefing_booked" | "briefing_completed" | "failed" | null;
    deliveredAt: string | null;
    deliveryMessage: string | null;
  } | null;
}) {
  const db = input.db ?? prisma;
  const report = await getReportRecordForWriteback({
    db,
    reportId: input.reportId,
    reportReference: input.reportReference
  });

  if (!report) {
    return null;
  }

  const derivedStatus =
    input.reportStatus !== undefined
      ? toReportStatus(input.reportStatus)
      : input.deliveryUpdate?.deliveryStatus === "failed"
        ? ReportStatus.FAILED
        : input.deliveryUpdate?.deliveryStatus === "sent" ||
            input.deliveryUpdate?.deliveryStatus === "briefing_booked" ||
            input.deliveryUpdate?.deliveryStatus === "briefing_completed"
          ? ReportStatus.DELIVERED
          : input.deliveryUpdate?.deliveryStatus === "generated"
            ? ReportStatus.PENDING_REVIEW
            : input.deliveryUpdate?.deliveryStatus === "reviewed"
              ? ReportStatus.APPROVED
          : undefined;

  return db.report.update({
    where: { id: report.id },
    data: {
      selectedPlan:
        input.selectedPlan === undefined
          ? undefined
          : toCommercialPlanCode(input.selectedPlan),
      status: derivedStatus,
      executiveSummary:
        input.executiveSummary === undefined ? undefined : input.executiveSummary,
      overallRiskPostureJson:
        input.overallRiskPosture === undefined
          ? undefined
          : input.overallRiskPosture === null
            ? Prisma.JsonNull
            : input.overallRiskPosture,
      artifactMetadataJson: mergeArtifactMetadataPatch({
        reportId: report.id,
        existingArtifactMetadataJson: report.artifactMetadataJson,
        artifactUpdate: input.artifactUpdate
      }),
      reportJson: mergeReportJsonPatch({
        existingReportJson: report.reportJson,
        executiveSummary: input.executiveSummary,
        overallRiskPosture: input.overallRiskPosture,
        findings: input.findings,
        gaps: input.gaps,
        actions: input.actions,
        roadmap: input.roadmap,
        deliveryUpdate: input.deliveryUpdate
      }),
      publishedAt:
        input.reportStatus === "ready" ||
        derivedStatus === ReportStatus.APPROVED ||
        derivedStatus === ReportStatus.PENDING_REVIEW
          ? new Date()
          : undefined,
      deliveredAt:
        input.reportStatus === "delivered" ||
        input.deliveryUpdate?.deliveryStatus === "sent" ||
        input.deliveryUpdate?.deliveryStatus === "briefing_booked" ||
        input.deliveryUpdate?.deliveryStatus === "briefing_completed"
          ? new Date()
          : undefined
    }
  });
}

export async function updateReportReviewStatus(input: {
  db?: ReportRecordsDbClient;
  reportId: string;
  status: ReportStatus;
  deliveredByUserId?: string | null;
  deliveredAt?: Date | null;
}) {
  const db = input.db ?? prisma;

  return db.report.update({
    where: { id: input.reportId },
    data: {
      status: input.status,
      deliveredByUserId:
        input.deliveredByUserId === undefined ? undefined : input.deliveredByUserId,
      deliveredAt: input.deliveredAt === undefined ? undefined : input.deliveredAt,
    }
  });
}

function buildWorkflowReportJson(input: {
  result: AuditWorkflowOutput;
  existingReportJson: Prisma.JsonValue;
}) {
  const existing = readJsonObject(input.existingReportJson) ?? {};
  const nextReportJson: Record<string, Prisma.InputJsonValue | null> = {
    ...Object.fromEntries(
      Object.entries(existing).map(([key, value]) => [
        key,
        value as Prisma.InputJsonValue | null
      ])
    ),
    assessmentName: input.result.finalReport.reportTitle,
    postureScore: input.result.postureScore,
    riskLevel: input.result.riskLevel,
    riskSummary: input.result.riskAnalysis.summary,
    executiveSummary: input.result.executiveSummary,
    finalReportText: input.result.finalReportText,
    findingCount: input.result.findings.length,
    recommendationCount: input.result.recommendations.length,
    findings: input.result.findings.map((finding) => ({
      title: finding.title,
      severity: finding.severity,
      summary: finding.summary,
      riskDomain: finding.riskDomain,
      impactedFrameworks: finding.impactedFrameworks
    })),
    roadmap: input.result.roadmap.map((item) => ({
      title: item.title,
      priority: item.priority,
      description: item.description,
      ownerRole: item.ownerRole,
      timeline: item.targetTimeline,
      effort: item.effort
    })),
    topConcerns: input.result.topConcerns,
    gaps: input.result.riskAnalysis.systemicThemes,
    frameworkMapping: {
      prioritizedFrameworks: input.result.frameworkMapping.prioritizedFrameworks,
      coverageSummary: input.result.frameworkMapping.coverageSummary
    },
    workflowMetadata: {
      provider: input.result.provider,
      workflowDispatchId: input.result.workflowDispatchId,
      status: input.result.status,
      contractVersion: input.result.metadata.contractVersion
    }
  };

  return nextReportJson;
}

export async function persistValidatedWorkflowReport(input: {
  db?: ReportRecordsDbClient;
  reportId: string;
  result: AuditWorkflowOutput;
  organizationNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
  customerAccountId?: string | null;
}) {
  const db = input.db ?? prisma;
  const existing = await db.report.findUnique({
    where: { id: input.reportId },
    select: {
      reportJson: true
    }
  });

  if (!existing) {
    throw new Error("Report not found for validated workflow persistence.");
  }

  const compatibleGeneratedStatus = await getCompatibleGeneratedReportStatus(db);

  const baseData = {
    organizationNameSnapshot:
      input.organizationNameSnapshot === undefined
        ? undefined
        : input.organizationNameSnapshot,
    customerEmailSnapshot:
      input.customerEmailSnapshot === undefined
        ? undefined
        : input.customerEmailSnapshot,
    selectedPlan:
      input.selectedPlan === undefined
        ? undefined
        : toCommercialPlanCode(input.selectedPlan),
    customerAccountId:
      input.customerAccountId === undefined ? undefined : input.customerAccountId,
    title: input.result.finalReport.reportTitle,
    executiveSummary: input.result.finalReport.executiveSummary,
    overallRiskPostureJson: {
      score: input.result.postureScore,
      level: input.result.riskLevel,
      summary: input.result.riskAnalysis.summary
    },
    reportJson: buildWorkflowReportJson({
      result: input.result,
      existingReportJson: existing.reportJson
    }),
    artifactMetadataJson: {
      downloadStatus: "ready",
      source: "validated_workflow_report",
      availableAt: new Date().toISOString(),
      downloadRoute: `/api/reports/${input.reportId}/export`
    },
    publishedAt: new Date(),
    deliveredAt: null,
    deliveredByUserId: null
  };

  return db.report.update({
    where: { id: input.reportId },
    data: {
      ...baseData,
      status: compatibleGeneratedStatus,
    }
  });
}

export async function listDashboardReportsForAccessSession(input: {
  accessSession: CustomerAccessSession;
  db?: ReportRecordsDbClient;
}) {
  const db = input.db ?? prisma;

  if (
    !input.accessSession.isAuthenticated ||
    !input.accessSession.organizationId ||
    !input.accessSession.accessScopes.includes("reports")
  ) {
    return [];
  }

  const activeGrantRecords = await listActiveCustomerAccessGrantRecords({
    db,
    organizationId: input.accessSession.organizationId,
    userId: input.accessSession.customerId
  });

  const hasOrganizationWideGrant = activeGrantRecords.some(
    (record) =>
      !record.reportId &&
      record.scopeType === CustomerAccessGrantScopeType.ORGANIZATION_REPORTS
  );

  const grantedReportIds = Array.from(
    new Set(
      activeGrantRecords
        .map((record) => record.reportId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  return db.report.findMany({
    where:
      activeGrantRecords.length === 0 || hasOrganizationWideGrant
        ? {
            organizationId: input.accessSession.organizationId
          }
        : {
            organizationId: input.accessSession.organizationId,
            id: {
              in: grantedReportIds.length > 0 ? grantedReportIds : ["__no_granted_reports__"]
            }
          },
    include: {
      assessment: true,
      customerAccount: true,
      organization: true
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function listDashboardReportSummaryViewsForAccessSession(input: {
  accessSession: CustomerAccessSession;
}) {
  const reports = await listDashboardReportsForAccessSession(input);
  return reports.map(mapDashboardReportSummaryView);
}

export async function getDashboardReportDetailForAccessSession(input: {
  reportId: string;
  accessSession: CustomerAccessSession;
  db?: ReportRecordsDbClient;
}) {
  const db = input.db ?? prisma;
  const reportAccessCandidate = await getReportAccessCandidateById(input.reportId, db);

  if (!reportAccessCandidate) {
    return null;
  }

  const activeGrantRecords = await listActiveCustomerAccessGrantRecords({
    db,
    organizationId: input.accessSession.organizationId,
    userId: input.accessSession.customerId
  });

  const matchingDurableAccessGrantRecord = activeGrantRecords.find(
    (record) =>
      record.reportId === input.reportId ||
      (!record.reportId &&
        record.scopeType === CustomerAccessGrantScopeType.ORGANIZATION_REPORTS)
  );
  const placeholderAccessGrant =
    activeGrantRecords.length === 0
      ? createPlaceholderCustomerAccessGrant({
          accessSession: input.accessSession,
          requiredScope: "reports",
          reportId: input.reportId
        })
      : null;

  const decision = evaluateCustomerReportAccess({
    reportId: input.reportId,
    reportOrganizationId: reportAccessCandidate.organizationId,
    accessSession: input.accessSession,
    requiredScope: "reports",
    accessGrant:
      (matchingDurableAccessGrantRecord
        ? mapCustomerAccessGrantRecordToGrant(matchingDurableAccessGrantRecord)
        : null) ?? placeholderAccessGrant,
    requireActiveGrant: activeGrantRecords.length > 0
  });

  if (!decision.allowed) {
    return null;
  }

  return getDashboardReportDetailById({
    reportId: input.reportId,
    organizationId: reportAccessCandidate.organizationId
  });
}

export async function getDashboardReportDetailViewForAccessSession(input: {
  reportId: string;
  accessSession: CustomerAccessSession;
}) {
  const report = await getDashboardReportDetailForAccessSession(input);
  return report ? mapDashboardReportDetailView(report) : null;
}

export async function getDashboardReportDetailById(input: {
  reportId: string;
  organizationId: string;
  db?: ReportRecordsDbClient;
}) {
  const db = input.db ?? prisma;

  return db.report.findFirst({
    where: {
      id: input.reportId,
      organizationId: input.organizationId
    },
    include: {
      assessment: true,
      organization: true,
      customerAccount: true,
      deliveredBy: true,
      viewedBy: true
    }
  });
}

export async function getExportableReportById(input: {
  reportId: string;
  organizationId: string;
}) {
  return prisma.report.findFirst({
    where: {
      id: input.reportId,
      organizationId: input.organizationId
    },
    include: {
      assessment: true,
      customerAccount: true
    }
  });
}
