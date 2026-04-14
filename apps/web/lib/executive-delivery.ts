import {
  AuditActorType,
  CustomerLifecycleStage,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  ReportStatus,
  prisma
} from "@evolve-edge/db";
import {
  markDeliveryStateAwaitingReviewForReport,
  markDeliveryStateDeliveredForReport
} from "./delivery-state";
import { publishDomainEvent } from "./domain-events";
import { logServerEvent } from "./monitoring";
import { recordOperationalFinding } from "./operations-queues";
import { requireRecordInOrganization } from "./scoped-access";

export const ReportPackageDeliveryStatus = {
  GENERATED: "GENERATED",
  REVIEWED: "REVIEWED",
  SENT: "SENT",
  BRIEFING_BOOKED: "BRIEFING_BOOKED",
  BRIEFING_COMPLETED: "BRIEFING_COMPLETED"
} as const;

export type ReportPackageDeliveryStatus =
  (typeof ReportPackageDeliveryStatus)[keyof typeof ReportPackageDeliveryStatus];

export const ReportPackageQaStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED"
} as const;

export type ReportPackageQaStatus =
  (typeof ReportPackageQaStatus)[keyof typeof ReportPackageQaStatus];

type ExecutiveDeliveryDbClient = (Prisma.TransactionClient | typeof prisma) & {
  reportPackage: {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any>;
    create: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    updateMany: (...args: any[]) => Promise<any>;
  };
  reportPackageVersion: {
    create: (...args: any[]) => Promise<any>;
  };
  report: {
    findUnique: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
  customerAccount: {
    updateMany: (...args: any[]) => Promise<any>;
  };
};

type ReportJsonRecord = Record<string, unknown>;

type ExecutiveDeliveryAction = "qa_approve" | "qa_request_changes" | "founder_review" | "send" | "book_briefing" | "complete_briefing";

function readRecord(value: unknown): ReportJsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as ReportJsonRecord;
}

function toSentence(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function buildExecutiveSummarySnapshot(input: {
  reportJson: unknown;
  reportTitle: string;
  assessmentName: string;
}) {
  const reportJson = readRecord(input.reportJson);
  const findings = Array.isArray(reportJson.findings)
    ? (reportJson.findings as Array<Record<string, unknown>>)
    : [];
  const roadmap = Array.isArray(reportJson.roadmap)
    ? (reportJson.roadmap as Array<Record<string, unknown>>)
    : [];
  const findingCount =
    typeof reportJson.findingCount === "number" ? reportJson.findingCount : findings.length;
  const recommendationCount =
    typeof reportJson.recommendationCount === "number"
      ? reportJson.recommendationCount
      : roadmap.length;
  const topFindings = findings.slice(0, 3).map((finding) => ({
    title: String(finding.title ?? "Untitled finding"),
    severity: String(finding.severity ?? "Unknown"),
    summary: toSentence(
      typeof finding.summary === "string" ? finding.summary : null,
      "No summary available."
    ),
    riskDomain: String(finding.riskDomain ?? "Unknown")
  }));
  const priorityActions = roadmap.slice(0, 3).map((action) => ({
    title: String(action.title ?? "Untitled action"),
    priority: String(action.priority ?? "Unknown"),
    ownerRole: String(action.ownerRole ?? "Owner pending"),
    timeline: String(action.timeline ?? "Timeline pending")
  }));

  return {
    headline: input.reportTitle,
    assessmentName: input.assessmentName,
    businessRisk:
      typeof reportJson.riskLevel === "string"
        ? `${reportJson.riskLevel} risk posture requiring leadership review.`
        : "Risk posture requires leadership review.",
    leadershipOverview: toSentence(
      typeof reportJson.executiveSummary === "string" ? reportJson.executiveSummary : null,
      "No executive summary is available."
    ),
    postureScore:
      typeof reportJson.postureScore === "number" ? reportJson.postureScore : null,
    riskLevel: typeof reportJson.riskLevel === "string" ? reportJson.riskLevel : "Unscored",
    topFindings,
    priorityActions,
    findingCount,
    recommendationCount
  } satisfies Prisma.JsonObject;
}

export function buildRoadmapSummarySnapshot(input: { reportJson: unknown }) {
  const reportJson = readRecord(input.reportJson);
  const roadmap = Array.isArray(reportJson.roadmap)
    ? (reportJson.roadmap as Array<Record<string, unknown>>)
    : [];

  const grouped = roadmap.reduce<Record<string, number>>((acc, item) => {
    const priority = String(item.priority ?? "Unknown");
    acc[priority] = (acc[priority] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalActions: roadmap.length,
    actionsByPriority: grouped,
    topActions: roadmap.slice(0, 5).map((action) => ({
      title: String(action.title ?? "Untitled action"),
      priority: String(action.priority ?? "Unknown"),
      ownerRole: String(action.ownerRole ?? "Owner pending"),
      timeline: String(action.timeline ?? "Timeline pending"),
      effort: String(action.effort ?? "Unknown")
    }))
  } satisfies Prisma.JsonObject;
}

export function buildFrameworkSummarySnapshot(input: {
  frameworks: Array<{ code: string; name: string; version: string | null; category: string }>;
  reportJson: unknown;
}) {
  const reportJson = readRecord(input.reportJson);
  const findings = Array.isArray(reportJson.findings)
    ? (reportJson.findings as Array<Record<string, unknown>>)
    : [];
  const impactedFrameworkNames = Array.from(
    new Set(
      findings.flatMap((finding) => {
        return asStringArray(finding.impactedFrameworks);
      })
    )
  );

  return {
    frameworksAssessed: input.frameworks.map((framework) => ({
      code: framework.code,
      name: framework.name,
      version: framework.version,
      category: framework.category
    })),
    impactedFrameworks: impactedFrameworkNames
  } satisfies Prisma.JsonObject;
}

export function buildBriefingPacketSnapshot(input: {
  reportId: string;
  reportTitle: string;
  versionLabel: string;
  executiveSummary: Prisma.JsonObject;
  roadmapSummary: Prisma.JsonObject;
  frameworkSummary: Prisma.JsonObject;
  reportJson: unknown;
}) {
  const reportJson = readRecord(input.reportJson);

  return {
    reportId: input.reportId,
    reportTitle: input.reportTitle,
    versionLabel: input.versionLabel,
    executiveSummary: input.executiveSummary,
    roadmapSummary: input.roadmapSummary,
    frameworkSummary: input.frameworkSummary,
    sectionSummaries: Array.isArray(reportJson.sectionSummaries)
      ? reportJson.sectionSummaries
      : [],
    metadata: {
      generatedAt: new Date().toISOString(),
      postureScore:
        typeof reportJson.postureScore === "number" ? reportJson.postureScore : null,
      riskLevel: typeof reportJson.riskLevel === "string" ? reportJson.riskLevel : "Unscored"
    }
  } satisfies Prisma.JsonObject;
}

export function evaluateFounderReviewRequirement(input: {
  reportJson: unknown;
}) {
  const reportJson = readRecord(input.reportJson);
  const findings = Array.isArray(reportJson.findings)
    ? (reportJson.findings as Array<Record<string, unknown>>)
    : [];
  const riskLevel =
    typeof reportJson.riskLevel === "string" ? reportJson.riskLevel.toLowerCase() : "";
  const postureScore =
    typeof reportJson.postureScore === "number" ? reportJson.postureScore : null;
  const criticalFindings = findings.filter(
    (finding) => String(finding.severity ?? "").toUpperCase() === "CRITICAL"
  ).length;
  const highFindings = findings.filter(
    (finding) => String(finding.severity ?? "").toUpperCase() === "HIGH"
  ).length;

  if (criticalFindings > 0) {
    return {
      requiresFounderReview: true,
      reason: "Critical findings require founder-level delivery review."
    };
  }

  if (riskLevel === "high" || (postureScore !== null && postureScore <= 55)) {
    return {
      requiresFounderReview: true,
      reason: "High-risk posture requires founder-level delivery review."
    };
  }

  if (highFindings >= 3) {
    return {
      requiresFounderReview: true,
      reason: "Concentrated high-severity findings require founder review."
    };
  }

  return {
    requiresFounderReview: false,
    reason: null
  };
}

export function canTransitionReportPackage(input: {
  deliveryStatus: ReportPackageDeliveryStatus;
  qaStatus: ReportPackageQaStatus;
  requiresFounderReview: boolean;
  founderReviewedAt: Date | null;
  action: ExecutiveDeliveryAction;
}) {
  switch (input.action) {
    case "qa_approve":
    case "qa_request_changes":
      return input.deliveryStatus === ReportPackageDeliveryStatus.GENERATED;
    case "founder_review":
      return input.qaStatus === ReportPackageQaStatus.APPROVED && input.requiresFounderReview;
    case "send":
      return (
        input.qaStatus === ReportPackageQaStatus.APPROVED &&
        (!input.requiresFounderReview || input.founderReviewedAt instanceof Date) &&
        (input.deliveryStatus === ReportPackageDeliveryStatus.GENERATED ||
          input.deliveryStatus === ReportPackageDeliveryStatus.REVIEWED)
      );
    case "book_briefing":
      return (
        input.deliveryStatus === ReportPackageDeliveryStatus.SENT ||
        input.deliveryStatus === ReportPackageDeliveryStatus.BRIEFING_BOOKED
      );
    case "complete_briefing":
      return input.deliveryStatus === ReportPackageDeliveryStatus.BRIEFING_BOOKED;
    default:
      return false;
  }
}

export function buildReportPackageSendBlockedFinding(input: {
  deliveryStatus: ReportPackageDeliveryStatus;
  qaStatus: ReportPackageQaStatus;
  requiresFounderReview: boolean;
  founderReviewedAt: Date | null;
}) {
  const blockers: string[] = [];

  if (input.qaStatus !== ReportPackageQaStatus.APPROVED) {
    blockers.push("qa_not_approved");
  }

  if (input.requiresFounderReview && !(input.founderReviewedAt instanceof Date)) {
    blockers.push("founder_review_pending");
  }

  if (
    input.deliveryStatus !== ReportPackageDeliveryStatus.GENERATED &&
    input.deliveryStatus !== ReportPackageDeliveryStatus.REVIEWED
  ) {
    blockers.push("delivery_status_not_sendable");
  }

  return {
    blockers,
    summary:
      "An operator attempted to send an executive delivery package before all delivery gates were satisfied.",
    recommendedAction:
      "Confirm QA approval, complete founder review if required, and verify the package is still in a sendable state before retrying delivery."
  };
}

async function recordReportPackageSendBlockedFinding(
  db: ExecutiveDeliveryDbClient,
  input: {
    packageId: string;
    organizationId: string;
    reportId: string;
    deliveryStatus: ReportPackageDeliveryStatus;
    qaStatus: ReportPackageQaStatus;
    requiresFounderReview: boolean;
    founderReviewedAt: Date | null;
  }
) {
  const finding = buildReportPackageSendBlockedFinding({
    deliveryStatus: input.deliveryStatus,
    qaStatus: input.qaStatus,
    requiresFounderReview: input.requiresFounderReview,
    founderReviewedAt: input.founderReviewedAt
  });

  try {
    await recordOperationalFinding(
      {
        organizationId: input.organizationId,
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "delivery.report_package_send_blocked",
        severity: OperationsQueueSeverity.MEDIUM,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "reportPackage",
        sourceRecordId: input.packageId,
        title: "Executive delivery send was blocked",
        summary: finding.summary,
        recommendedAction: finding.recommendedAction,
        metadata: {
          reportId: input.reportId,
          deliveryStatus: input.deliveryStatus,
          qaStatus: input.qaStatus,
          requiresFounderReview: input.requiresFounderReview,
          founderReviewedAt: input.founderReviewedAt?.toISOString() ?? null,
          blockers: finding.blockers
        }
      },
      db
    );
  } catch (error) {
    logServerEvent("warn", "report_package.send_blocked_finding_failed", {
      org_id: input.organizationId,
      resource_id: input.packageId,
      source: "report.delivery",
      status: "warning",
      metadata: {
        reportId: input.reportId,
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
}

async function publishReportPackageEvent(
  db: ExecutiveDeliveryDbClient,
  input: {
    type: string;
    reportPackageId: string;
    organizationId: string;
    userId?: string | null;
    reportId: string;
    assessmentId: string;
    payload: Prisma.InputJsonValue;
  }
) {
  return publishDomainEvent(db, {
    type: input.type,
    aggregateType: "reportPackage",
    aggregateId: input.reportPackageId,
    orgId: input.organizationId,
    userId: input.userId ?? null,
    idempotencyKey: `${input.type}:${input.reportPackageId}:${input.reportId}`,
    payload: {
      reportPackageId: input.reportPackageId,
      reportId: input.reportId,
      assessmentId: input.assessmentId,
      ...((input.payload as Prisma.JsonObject) ?? {})
    }
  });
}

export async function upsertExecutiveDeliveryPackageForReport(input: {
  reportId: string;
  actorUserId?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const report = await db.report.findUnique({
    where: { id: input.reportId },
    include: {
      assessment: {
        include: {
          organization: {
            include: {
              frameworkSelections: {
                include: {
                  framework: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!report) {
    throw new Error("Report not found.");
  }

  const executiveSummary = buildExecutiveSummarySnapshot({
    reportJson: report.reportJson,
    reportTitle: report.title,
    assessmentName: report.assessment.name
  });
  const roadmapSummary = buildRoadmapSummarySnapshot({
    reportJson: report.reportJson
  });
  const frameworkSummary = buildFrameworkSummarySnapshot({
    reportJson: report.reportJson,
    frameworks: report.assessment.organization.frameworkSelections.map((selection) => ({
      code: selection.framework.code,
      name: selection.framework.name,
      version: selection.framework.version ?? null,
      category: selection.framework.category
    }))
  });
  const packet = buildBriefingPacketSnapshot({
    reportId: report.id,
    reportTitle: report.title,
    versionLabel: report.versionLabel,
    executiveSummary,
    roadmapSummary,
    frameworkSummary,
    reportJson: report.reportJson
  });
  const founderReview = evaluateFounderReviewRequirement({
    reportJson: report.reportJson
  });

  const existingPackage = await db.reportPackage.findUnique({
    where: {
      organizationId_assessmentId: {
        organizationId: report.organizationId,
        assessmentId: report.assessmentId
      }
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      }
    }
  });

  const nextVersionNumber = (existingPackage?.versions[0]?.versionNumber ?? 0) + 1;
  const deliveryPackage = existingPackage
    ? await db.reportPackage.update({
        where: { id: existingPackage.id },
        data: {
          latestReportId: report.id,
          title: report.title,
          deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
          qaStatus: ReportPackageQaStatus.PENDING,
          requiresFounderReview: founderReview.requiresFounderReview,
          founderReviewReason: founderReview.reason,
          qaNotes: null,
          founderReviewNotes: null,
          sentNotes: null,
          briefingNotes: null,
          currentVersionNumber: nextVersionNumber,
          reviewedAt: null,
          reviewedByUserId: null,
          founderReviewedAt: null,
          founderReviewedByUserId: null,
          sentAt: null,
          sentByUserId: null,
          briefingBookedAt: null,
          briefingBookedByUserId: null,
          briefingCompletedAt: null,
          briefingCompletedByUserId: null
        }
      })
    : await db.reportPackage.create({
        data: {
          organizationId: report.organizationId,
          assessmentId: report.assessmentId,
          latestReportId: report.id,
          title: report.title,
          deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
          qaStatus: ReportPackageQaStatus.PENDING,
          requiresFounderReview: founderReview.requiresFounderReview,
          founderReviewReason: founderReview.reason,
          currentVersionNumber: nextVersionNumber
        }
      });

  await db.reportPackageVersion.create({
    data: {
      reportPackageId: deliveryPackage.id,
      reportId: report.id,
      versionNumber: nextVersionNumber,
      createdByUserId: input.actorUserId ?? report.createdByUserId ?? null,
      executiveSummaryJson: executiveSummary,
      roadmapSummaryJson: roadmapSummary,
      frameworkSummaryJson: frameworkSummary,
      packetJson: packet
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.generated",
    reportPackageId: deliveryPackage.id,
    organizationId: report.organizationId,
    userId: input.actorUserId ?? report.createdByUserId ?? null,
    reportId: report.id,
    assessmentId: report.assessmentId,
    payload: {
      versionNumber: nextVersionNumber,
      requiresFounderReview: founderReview.requiresFounderReview,
      founderReviewReason: founderReview.reason
    }
  });

  await markDeliveryStateAwaitingReviewForReport({
    db,
    organizationId: report.organizationId,
    reportId: report.id,
    reportPackageId: deliveryPackage.id,
    actorUserId: input.actorUserId ?? report.createdByUserId ?? null
  });

  return deliveryPackage;
}

export async function getReportExecutiveDeliveryPackage(
  reportId: string,
  db: ExecutiveDeliveryDbClient = prisma as ExecutiveDeliveryDbClient
) {
  return db.reportPackage.findFirst({
    where: {
      versions: {
        some: {
          reportId
        }
      }
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          report: {
            select: {
              id: true,
              title: true,
              versionLabel: true,
              status: true,
              createdAt: true
            }
          }
        }
      },
      reviewedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      founderReviewedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      sentBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      briefingBookedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      briefingCompletedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
}

export async function getOrganizationReportPackages(
  organizationId: string,
  options?: { limit?: number; db?: ExecutiveDeliveryDbClient }
) {
  const db = (options?.db ?? prisma) as ExecutiveDeliveryDbClient;
  return db.reportPackage.findMany({
    where: { organizationId },
    include: {
      assessment: {
        select: {
          id: true,
          name: true
        }
      },
      latestReport: {
        select: {
          id: true,
          title: true,
          versionLabel: true,
          status: true,
          deliveredAt: true
        }
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 3,
        include: {
          report: {
            select: {
              id: true,
              versionLabel: true,
              title: true,
              createdAt: true
            }
          }
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: options?.limit ?? 10
  });
}

async function getPackageById(
  packageId: string,
  organizationId: string,
  db: ExecutiveDeliveryDbClient
) {
  const deliveryPackage = await requireRecordInOrganization({
    recordId: packageId,
    organizationId,
    entityLabel: "Executive delivery package",
    load: ({ recordId, organizationId: scopedOrganizationId }) =>
      db.reportPackage.findFirst({
        where: {
          id: recordId,
          organizationId: scopedOrganizationId
        },
        include: {
          latestReport: true
        }
      })
  });

  if (!deliveryPackage.latestReportId || !deliveryPackage.latestReport) {
    throw new Error("Executive delivery package is not linked to a report.");
  }

  return deliveryPackage;
}

function getLatestReportId(deliveryPackage: { latestReportId: string | null }) {
  if (!deliveryPackage.latestReportId) {
    throw new Error("Executive delivery package is not linked to a latest report.");
  }

  return deliveryPackage.latestReportId;
}

export async function approveReportPackageQa(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "qa_approve"
    })
  ) {
    throw new Error("QA approval is only available on newly generated packages.");
  }

  const reviewedAt = new Date();
  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      qaStatus: ReportPackageQaStatus.APPROVED,
      deliveryStatus: ReportPackageDeliveryStatus.REVIEWED,
      qaNotes: input.notes?.trim() || null,
      reviewedAt,
      reviewedByUserId: input.actorUserId
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.reviewed",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      qaStatus: updated.qaStatus,
      reviewedAt: reviewedAt.toISOString(),
      requiresFounderReview: updated.requiresFounderReview
    }
  });

  return updated;
}

export async function requestReportPackageChanges(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes: string;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "qa_request_changes"
    })
  ) {
    throw new Error("Change requests are only available on newly generated packages.");
  }

  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      qaStatus: ReportPackageQaStatus.CHANGES_REQUESTED,
      deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
      qaNotes: input.notes.trim(),
      reviewedAt: new Date(),
      reviewedByUserId: input.actorUserId
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.changes_requested",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      qaNotes: updated.qaNotes
    }
  });

  return updated;
}

export async function completeFounderReview(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "founder_review"
    })
  ) {
    throw new Error("Founder review is not required for this package.");
  }

  const reviewedAt = new Date();
  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      founderReviewedAt: reviewedAt,
      founderReviewedByUserId: input.actorUserId,
      founderReviewNotes: input.notes?.trim() || null
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.founder_reviewed",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      founderReviewedAt: reviewedAt.toISOString(),
      founderReviewNotes: updated.founderReviewNotes
    }
  });

  return updated;
}

export async function markReportPackageSent(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "send"
    })
  ) {
    await recordReportPackageSendBlockedFinding(db, {
      packageId: deliveryPackage.id,
      organizationId: deliveryPackage.organizationId,
      reportId: latestReportId,
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt
    });
    throw new Error("The package must pass QA review before it can be sent.");
  }

  const sentAt = new Date();
  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      deliveryStatus: ReportPackageDeliveryStatus.SENT,
      sentAt,
      sentByUserId: input.actorUserId,
      sentNotes: input.notes?.trim() || null
    }
  });

  await db.report.update({
    where: { id: latestReportId },
    data: {
      status: ReportStatus.DELIVERED,
      deliveredAt: sentAt,
      deliveredByUserId: input.actorUserId
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.sent",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      sentAt: sentAt.toISOString(),
      sentNotes: updated.sentNotes
    }
  });

  await markDeliveryStateDeliveredForReport({
    db,
    organizationId: updated.organizationId,
    reportId: latestReportId,
    reportPackageId: updated.id,
    actorUserId: input.actorUserId
  });

  return updated;
}

export async function markReportPackageBriefingBooked(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "book_briefing"
    })
  ) {
    throw new Error("Briefing can only be booked after the package is sent.");
  }

  const bookedAt = new Date();
  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      deliveryStatus: ReportPackageDeliveryStatus.BRIEFING_BOOKED,
      briefingBookedAt: bookedAt,
      briefingBookedByUserId: input.actorUserId,
      briefingNotes: input.notes?.trim() || null
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.briefing_booked",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      briefingBookedAt: bookedAt.toISOString(),
      briefingNotes: updated.briefingNotes
    }
  });

  return updated;
}

export async function markReportPackageBriefingCompleted(input: {
  packageId: string;
  organizationId: string;
  actorUserId: string;
  notes?: string | null;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await getPackageById(input.packageId, input.organizationId, db);
  const latestReportId = getLatestReportId(deliveryPackage);

  if (
    !canTransitionReportPackage({
      deliveryStatus: deliveryPackage.deliveryStatus,
      qaStatus: deliveryPackage.qaStatus,
      requiresFounderReview: deliveryPackage.requiresFounderReview,
      founderReviewedAt: deliveryPackage.founderReviewedAt,
      action: "complete_briefing"
    })
  ) {
    throw new Error("Briefing completion requires a booked briefing.");
  }

  const completedAt = new Date();
  const updated = await db.reportPackage.update({
    where: { id: deliveryPackage.id },
    data: {
      deliveryStatus: ReportPackageDeliveryStatus.BRIEFING_COMPLETED,
      briefingCompletedAt: completedAt,
      briefingCompletedByUserId: input.actorUserId,
      briefingNotes: input.notes?.trim() || deliveryPackage.briefingNotes || null
    }
  });

  await publishReportPackageEvent(db, {
    type: "report_package.briefing_completed",
    reportPackageId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId,
    reportId: latestReportId,
    assessmentId: updated.assessmentId,
    payload: {
      briefingCompletedAt: completedAt.toISOString(),
      briefingNotes: updated.briefingNotes
    }
  });

  return updated;
}

export async function syncCustomerLifecycleFromReportPackage(input: {
  packageId: string;
  db?: ExecutiveDeliveryDbClient;
}) {
  const db = (input.db ?? prisma) as ExecutiveDeliveryDbClient;
  const deliveryPackage = await db.reportPackage.findUnique({
    where: { id: input.packageId },
    select: {
      organizationId: true,
      deliveryStatus: true
    }
  });

  if (!deliveryPackage) {
    return null;
  }

  if (deliveryPackage.deliveryStatus === ReportPackageDeliveryStatus.BRIEFING_BOOKED) {
    return db.customerAccount.updateMany({
      where: {
        organizationId: deliveryPackage.organizationId,
        lifecycleStage: {
          not: CustomerLifecycleStage.MONITORING_ACTIVE
        }
      },
      data: {
        lifecycleStage: CustomerLifecycleStage.BRIEFING_SCHEDULED,
        stageUpdatedAt: new Date()
      }
    });
  }

  if (deliveryPackage.deliveryStatus === ReportPackageDeliveryStatus.BRIEFING_COMPLETED) {
    return db.customerAccount.updateMany({
      where: {
        organizationId: deliveryPackage.organizationId
      },
      data: {
        lifecycleStage: CustomerLifecycleStage.MONITORING_ACTIVE,
        stageUpdatedAt: new Date(),
        monitoringActivatedAt: new Date()
      }
    });
  }

  return null;
}
