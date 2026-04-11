import {
  FindingSeverity,
  MonitoringCheckStatus,
  MonitoringFindingStatus,
  MonitoringFrameworkStatus,
  MonitoringSubscriptionStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { publishDomainEvent } from "./domain-events";

type MonitoringDbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_MONITORING_CHECKS = [
  {
    key: "policy-attestation",
    title: "Policy and control attestation refresh",
    description:
      "Recurring placeholder for policy attestations, control evidence refresh, and leadership-ready review prep.",
    targetType: "governance",
    cadenceDays: 30
  },
  {
    key: "vendor-risk-review",
    title: "Vendor and AI tool review cycle",
    description:
      "Recurring placeholder for vendor posture validation, AI vendor inventory review, and third-party risk refresh.",
    targetType: "third_party",
    cadenceDays: 30
  },
  {
    key: "access-control-review",
    title: "Access and privileged operations review",
    description:
      "Recurring placeholder for privileged access verification, control walkthroughs, and exception review.",
    targetType: "security",
    cadenceDays: 30
  },
  {
    key: "executive-reporting-refresh",
    title: "Executive reporting refresh",
    description:
      "Recurring placeholder for the next executive checkpoint and board-facing reporting cycle.",
    targetType: "reporting",
    cadenceDays: 90
  }
] as const;

export function getDefaultMonitoringCheckKeys() {
  return DEFAULT_MONITORING_CHECKS.map((check) => check.key);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildMonitoringFindingDedupeKey(input: {
  title: string;
  riskDomain: string;
}) {
  return `${normalizeToken(input.riskDomain)}:${normalizeToken(input.title)}`;
}

export function resolveMonitoringFindingStatusOnSync(
  currentStatus: MonitoringFindingStatus | null | undefined
) {
  if (!currentStatus) {
    return MonitoringFindingStatus.OPEN;
  }

  if (currentStatus === MonitoringFindingStatus.RESOLVED) {
    return MonitoringFindingStatus.OPEN;
  }

  return currentStatus;
}

function mapFrameworkStatus(input: {
  openFindingsCount: number;
  criticalFindingsCount: number;
}) {
  if (input.criticalFindingsCount > 0 || input.openFindingsCount >= 3) {
    return MonitoringFrameworkStatus.ATTENTION_REQUIRED;
  }

  if (input.openFindingsCount > 0) {
    return MonitoringFrameworkStatus.WATCH;
  }

  return MonitoringFrameworkStatus.STABLE;
}

function calculateFrameworkScore(input: {
  postureScore: number | null;
  openFindingsCount: number;
  criticalFindingsCount: number;
}) {
  const base = input.postureScore ?? 72;
  const score = base - input.openFindingsCount * 4 - input.criticalFindingsCount * 8;
  return Math.max(25, Math.min(96, score));
}

async function ensureMonitoringSubscription(
  organizationId: string,
  db: MonitoringDbClient
) {
  const existing = await db.monitoringSubscription.findUnique({
    where: { organizationId }
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  return db.monitoringSubscription.create({
    data: {
      organizationId,
      status: MonitoringSubscriptionStatus.ACTIVE,
      activatedAt: now,
      nextReviewAt: addDays(now, 30),
      lastSyncedAt: now
    }
  });
}

async function ensureDefaultMonitoringChecks(input: {
  organizationId: string;
  monitoringSubscriptionId: string;
  db: MonitoringDbClient;
}) {
  const now = new Date();

  for (const check of DEFAULT_MONITORING_CHECKS) {
    await input.db.monitoringCheck.upsert({
      where: {
        organizationId_key: {
          organizationId: input.organizationId,
          key: check.key
        }
      },
      update: {
        monitoringSubscriptionId: input.monitoringSubscriptionId,
        title: check.title,
        description: check.description,
        targetType: check.targetType,
        cadenceDays: check.cadenceDays,
        status: MonitoringCheckStatus.ACTIVE,
        nextRunAt: addDays(now, check.cadenceDays)
      },
      create: {
        organizationId: input.organizationId,
        monitoringSubscriptionId: input.monitoringSubscriptionId,
        key: check.key,
        title: check.title,
        description: check.description,
        targetType: check.targetType,
        cadenceDays: check.cadenceDays,
        status: MonitoringCheckStatus.ACTIVE,
        nextRunAt: addDays(now, check.cadenceDays)
      }
    });
  }
}

async function publishMonitoringSyncEvent(input: {
  db: MonitoringDbClient;
  organizationId: string;
  assessmentId: string;
  reportId: string;
  monitoringSubscriptionId: string;
  postureScore: number | null;
  riskLevel: string | null;
  openFindingsCount: number;
  criticalFindingsCount: number;
}) {
  await publishDomainEvent(input.db, {
    type: "monitoring.synced",
    aggregateType: "monitoringSubscription",
    aggregateId: input.monitoringSubscriptionId,
    orgId: input.organizationId,
    idempotencyKey: `monitoring.synced:${input.monitoringSubscriptionId}:${input.reportId}`,
    payload: {
      organizationId: input.organizationId,
      assessmentId: input.assessmentId,
      reportId: input.reportId,
      postureScore: input.postureScore,
      riskLevel: input.riskLevel,
      openFindingsCount: input.openFindingsCount,
      criticalFindingsCount: input.criticalFindingsCount
    }
  });
}

export async function syncMonitoringFromAssessment(input: {
  organizationId: string;
  assessmentId: string;
  reportId: string;
  actorUserId?: string | null;
  db?: MonitoringDbClient;
}) {
  const db = input.db ?? prisma;
  const assessment = await db.assessment.findFirst({
    where: {
      id: input.assessmentId,
      organizationId: input.organizationId
    },
    include: {
      findings: {
        orderBy: { sortOrder: "asc" }
      },
      organization: {
        include: {
          frameworkSelections: {
            include: { framework: true }
          }
        }
      }
    }
  });

  if (!assessment) {
    throw new Error("Assessment not found for monitoring sync.");
  }

  const monitoringSubscription = await ensureMonitoringSubscription(
    input.organizationId,
    db
  );

  const existingFindings = await db.monitoringFinding.findMany({
    where: { organizationId: input.organizationId }
  });
  const existingByKey = new Map(
    existingFindings.map((finding) => [finding.dedupeKey, finding])
  );

  for (const finding of assessment.findings) {
    const dedupeKey = buildMonitoringFindingDedupeKey({
      title: finding.title,
      riskDomain: finding.riskDomain
    });
    const existing = existingByKey.get(dedupeKey);
    const nextStatus = resolveMonitoringFindingStatusOnSync(existing?.status);
    const now = new Date();

    if (existing) {
      await db.monitoringFinding.update({
        where: { id: existing.id },
        data: {
          monitoringSubscriptionId: monitoringSubscription.id,
          sourceFindingId: finding.id,
          lastAssessmentId: assessment.id,
          lastReportId: input.reportId,
          title: finding.title,
          summary: finding.summary,
          severity: finding.severity,
          riskDomain: finding.riskDomain,
          impactedFrameworks: finding.impactedFrameworks as Prisma.InputJsonValue,
          status: nextStatus,
          lastSeenAt: now,
          lastStatusChangedAt:
            existing.status !== nextStatus ? now : existing.lastStatusChangedAt,
          resolvedAt: nextStatus === MonitoringFindingStatus.OPEN ? null : existing.resolvedAt
        }
      });
      continue;
    }

    await db.monitoringFinding.create({
      data: {
        organizationId: input.organizationId,
        monitoringSubscriptionId: monitoringSubscription.id,
        dedupeKey,
        sourceFindingId: finding.id,
        firstAssessmentId: assessment.id,
        lastAssessmentId: assessment.id,
        lastReportId: input.reportId,
        title: finding.title,
        summary: finding.summary,
        severity: finding.severity,
        riskDomain: finding.riskDomain,
        impactedFrameworks: finding.impactedFrameworks as Prisma.InputJsonValue,
        status: MonitoringFindingStatus.OPEN,
        firstDetectedAt: now,
        lastSeenAt: now,
        lastStatusChangedAt: now
      }
    });
  }

  const monitoringFindings = await db.monitoringFinding.findMany({
    where: { organizationId: input.organizationId }
  });
  const openMonitoringFindings = monitoringFindings.filter(
    (finding) => finding.status !== MonitoringFindingStatus.RESOLVED
  );
  const criticalOpenFindings = openMonitoringFindings.filter(
    (finding) => finding.severity === FindingSeverity.CRITICAL
  );

  for (const selection of assessment.organization.frameworkSelections) {
    const frameworkName = selection.framework.name;
    const frameworkCode = selection.framework.code.toUpperCase();
    const frameworkFindings = monitoringFindings.filter((finding) => {
      if (!Array.isArray(finding.impactedFrameworks)) {
        return false;
      }

      return (finding.impactedFrameworks as Array<unknown>).some((value) => {
        if (typeof value !== "string") {
          return false;
        }

        const normalized = value.toUpperCase();
        return normalized === frameworkName.toUpperCase() || normalized === frameworkCode;
      });
    });
    const openFindingsCount = frameworkFindings.filter(
      (finding) => finding.status !== MonitoringFindingStatus.RESOLVED
    ).length;
    const criticalFindingsCount = frameworkFindings.filter(
      (finding) =>
        finding.status !== MonitoringFindingStatus.RESOLVED &&
        finding.severity === FindingSeverity.CRITICAL
    ).length;
    const inRemediationCount = frameworkFindings.filter(
      (finding) => finding.status === MonitoringFindingStatus.IN_REMEDIATION
    ).length;
    const resolvedFindingsCount = frameworkFindings.filter(
      (finding) => finding.status === MonitoringFindingStatus.RESOLVED
    ).length;
    const priorFramework = await db.monitoringFramework.findUnique({
      where: {
        organizationId_frameworkId: {
          organizationId: input.organizationId,
          frameworkId: selection.framework.id
        }
      }
    });
    const score = calculateFrameworkScore({
      postureScore: assessment.postureScore,
      openFindingsCount,
      criticalFindingsCount
    });

    await db.monitoringFramework.upsert({
      where: {
        organizationId_frameworkId: {
          organizationId: input.organizationId,
          frameworkId: selection.framework.id
        }
      },
      update: {
        monitoringSubscriptionId: monitoringSubscription.id,
        lastAssessmentId: assessment.id,
        status: mapFrameworkStatus({
          openFindingsCount,
          criticalFindingsCount
        }),
        score,
        openFindingsCount,
        inRemediationCount,
        resolvedFindingsCount,
        trendDelta: priorFramework ? score - (priorFramework.score ?? score) : 0,
        lastReviewedAt: new Date()
      },
      create: {
        organizationId: input.organizationId,
        monitoringSubscriptionId: monitoringSubscription.id,
        frameworkId: selection.framework.id,
        lastAssessmentId: assessment.id,
        status: mapFrameworkStatus({
          openFindingsCount,
          criticalFindingsCount
        }),
        score,
        openFindingsCount,
        inRemediationCount,
        resolvedFindingsCount,
        trendDelta: 0,
        lastReviewedAt: new Date()
      }
    });
  }

  await db.monitoringRiskSnapshot.create({
    data: {
      organizationId: input.organizationId,
      monitoringSubscriptionId: monitoringSubscription.id,
      assessmentId: assessment.id,
      reportId: input.reportId,
      source: "report_generation",
      postureScore: assessment.postureScore,
      riskLevel: assessment.riskLevel,
      openFindingsCount: openMonitoringFindings.length,
      criticalFindingsCount: criticalOpenFindings.length,
      resolvedFindingsCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.RESOLVED
      ).length,
      recordedAt: new Date()
    }
  });

  await db.monitoringSubscription.update({
    where: { id: monitoringSubscription.id },
    data: {
      status: MonitoringSubscriptionStatus.ACTIVE,
      currentPostureScore: assessment.postureScore,
      currentRiskLevel: assessment.riskLevel,
      lastAssessmentId: assessment.id,
      lastReportId: input.reportId,
      lastSyncedAt: new Date(),
      activatedAt: monitoringSubscription.activatedAt ?? new Date(),
      nextReviewAt: addDays(new Date(), monitoringSubscription.cadenceDays),
      summaryJson: {
        openFindingsCount: openMonitoringFindings.length,
        criticalFindingsCount: criticalOpenFindings.length,
        frameworkCount: assessment.organization.frameworkSelections.length
      }
    }
  });

  await ensureDefaultMonitoringChecks({
    organizationId: input.organizationId,
    monitoringSubscriptionId: monitoringSubscription.id,
    db
  });

  await publishMonitoringSyncEvent({
    db,
    organizationId: input.organizationId,
    assessmentId: assessment.id,
    reportId: input.reportId,
    monitoringSubscriptionId: monitoringSubscription.id,
    postureScore: assessment.postureScore,
    riskLevel: assessment.riskLevel,
    openFindingsCount: openMonitoringFindings.length,
    criticalFindingsCount: criticalOpenFindings.length
  });

  return monitoringSubscription;
}

export async function updateMonitoringFindingStatus(input: {
  organizationId: string;
  monitoringFindingId: string;
  actorUserId: string;
  status: MonitoringFindingStatus;
  remediationNotes?: string | null;
  acceptedReason?: string | null;
  ownerRole?: string | null;
  deferredUntil?: Date | null;
  db?: MonitoringDbClient;
}) {
  const db = input.db ?? prisma;
  const current = await db.monitoringFinding.findFirst({
    where: {
      id: input.monitoringFindingId,
      organizationId: input.organizationId
    }
  });

  if (!current) {
    throw new Error("Monitoring finding not found.");
  }

  const now = new Date();
  const updated = await db.monitoringFinding.update({
    where: { id: current.id },
    data: {
      status: input.status,
      remediationNotes: input.remediationNotes?.trim() || null,
      acceptedReason:
        input.status === MonitoringFindingStatus.ACCEPTED
          ? input.acceptedReason?.trim() || null
          : null,
      ownerRole: input.ownerRole?.trim() || current.ownerRole,
      deferredUntil:
        input.status === MonitoringFindingStatus.DEFERRED ? input.deferredUntil ?? null : null,
      resolvedAt:
        input.status === MonitoringFindingStatus.RESOLVED ? now : null,
      lastStatusChangedAt: now
    }
  });

  await publishDomainEvent(db, {
    type: "monitoring.finding_status_changed",
    aggregateType: "monitoringFinding",
    aggregateId: updated.id,
    orgId: input.organizationId,
    userId: input.actorUserId,
    idempotencyKey: `monitoring.finding_status_changed:${updated.id}:${updated.lastStatusChangedAt.toISOString()}`,
    payload: {
      monitoringFindingId: updated.id,
      status: updated.status,
      ownerRole: updated.ownerRole,
      deferredUntil: updated.deferredUntil?.toISOString() ?? null
    }
  });

  return updated;
}

export type MonitoringDashboardSnapshot = Awaited<
  ReturnType<typeof getMonitoringDashboardSnapshot>
>;

export async function getMonitoringDashboardSnapshot(organizationId: string) {
  const [subscription, findings, frameworks, snapshots, checks, reports, notifications] =
    await Promise.all([
      prisma.monitoringSubscription.findUnique({
        where: { organizationId }
      }),
      prisma.monitoringFinding.findMany({
        where: { organizationId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 12
      }),
      prisma.monitoringFramework.findMany({
        where: { organizationId },
        include: {
          framework: true
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
      }),
      prisma.monitoringRiskSnapshot.findMany({
        where: { organizationId },
        orderBy: { recordedAt: "desc" },
        take: 6
      }),
      prisma.monitoringCheck.findMany({
        where: { organizationId },
        orderBy: [{ status: "asc" }, { nextRunAt: "asc" }]
      }),
      prisma.report.findMany({
        where: { organizationId },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 6,
        include: {
          assessment: true
        }
      }),
      prisma.notification.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 6
      })
    ]);

  const openFindingsCount = findings.filter(
    (finding) => finding.status === MonitoringFindingStatus.OPEN
  ).length;
  const inRemediationCount = findings.filter(
    (finding) => finding.status === MonitoringFindingStatus.IN_REMEDIATION
  ).length;
  const resolvedFindingsCount = findings.filter(
    (finding) => finding.status === MonitoringFindingStatus.RESOLVED
  ).length;
  const acceptedFindingsCount = findings.filter(
    (finding) => finding.status === MonitoringFindingStatus.ACCEPTED
  ).length;
  const deferredFindingsCount = findings.filter(
    (finding) => finding.status === MonitoringFindingStatus.DEFERRED
  ).length;

  const orderedTrend = [...snapshots].reverse();
  const trendPoints = orderedTrend.map((snapshot) => ({
    label: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(snapshot.recordedAt),
    postureScore: snapshot.postureScore ?? 0,
    openFindingsCount: snapshot.openFindingsCount
  }));
  const postureTrendDelta =
    trendPoints.length >= 2
      ? trendPoints[trendPoints.length - 1]!.postureScore - trendPoints[0]!.postureScore
      : 0;

  return {
    subscription,
    summary: {
      postureScore: subscription?.currentPostureScore ?? null,
      riskLevel: subscription?.currentRiskLevel ?? "Unscored",
      openFindingsCount,
      inRemediationCount,
      resolvedFindingsCount,
      acceptedFindingsCount,
      deferredFindingsCount,
      postureTrendDelta,
      reportArchiveCount: reports.length,
      nextReviewAt: subscription?.nextReviewAt ?? null
    },
    findings,
    frameworks,
    trendPoints,
    checks,
    reports,
    recentActivity: notifications,
    hasMonitoringData:
      Boolean(subscription) || findings.length > 0 || snapshots.length > 0 || reports.length > 0
  };
}
