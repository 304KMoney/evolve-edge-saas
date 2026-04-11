import {
  AssessmentStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";

type UsageDbClient = Prisma.TransactionClient | typeof prisma;

export type OrganizationUsageSnapshot = {
  organizationId: string;
  assessmentsCount: number;
  reportsCount: number;
  activeMembersCount: number;
  activeAssessmentsCount: number;
  lastActivityAt: Date | null;
};

export type ThresholdSignalInput = {
  metric:
    | "active_members"
    | "seats"
    | "active_assessments"
    | "reports_generated"
    | "monitored_assets"
    | "api_calls"
    | "storage_bytes"
    | "ai_processing_runs";
  used: number;
  limit: number | null;
  organizationId: string;
};

export async function getOrganizationUsageSnapshot(
  organizationId: string,
  db: UsageDbClient = prisma
): Promise<OrganizationUsageSnapshot> {
  const [
    assessmentsCount,
    reportsCount,
    activeMembersCount,
    activeAssessmentsCount,
    latestAssessment,
    latestReport,
    latestSubscription,
    latestEvent,
    latestMembership
  ] = await Promise.all([
    db.assessment.count({
      where: { organizationId }
    }),
    db.report.count({
      where: { organizationId }
    }),
    db.organizationMember.count({
      where: { organizationId }
    }),
    db.assessment.count({
      where: {
        organizationId,
        status: {
          not: AssessmentStatus.ARCHIVED
        }
      }
    }),
    db.assessment.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    }),
    db.report.findFirst({
      where: { organizationId },
      orderBy: [{ viewedAt: "desc" }, { deliveredAt: "desc" }, { createdAt: "desc" }],
      select: {
        viewedAt: true,
        deliveredAt: true,
        createdAt: true
      }
    }),
    db.subscription.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    }),
    db.domainEvent.findFirst({
      where: { orgId: organizationId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true }
    }),
    db.organizationMember.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    })
  ]);

  const lastActivityCandidates = [
    latestAssessment?.updatedAt ?? null,
    latestReport?.viewedAt ?? null,
    latestReport?.deliveredAt ?? null,
    latestReport?.createdAt ?? null,
    latestSubscription?.updatedAt ?? null,
    latestEvent?.occurredAt ?? null,
    latestMembership?.createdAt ?? null
  ].filter((value): value is Date => value instanceof Date);

  return {
    organizationId,
    assessmentsCount,
    reportsCount,
    activeMembersCount,
    activeAssessmentsCount,
    lastActivityAt:
      lastActivityCandidates.length > 0
        ? new Date(
            Math.max(...lastActivityCandidates.map((value) => value.getTime()))
          )
        : null
  };
}

function createThresholdEvent(
  input: ThresholdSignalInput,
  threshold: 80 | 100
) {
  if (!input.limit || input.limit <= 0) {
    return null;
  }

  const usagePercent = Math.floor((input.used / input.limit) * 100);
  const qualifies =
    threshold === 80
      ? usagePercent >= 80 && usagePercent < 100
      : usagePercent >= 100;

  if (!qualifies) {
    return null;
  }

  return {
    type: "usage.threshold.crossed",
    aggregateType: "organization",
    aggregateId: input.organizationId,
    orgId: input.organizationId,
    idempotencyKey: `usage.threshold.crossed:${input.organizationId}:${input.metric}:${threshold}`,
    payload: {
      organizationId: input.organizationId,
      metric: input.metric,
      thresholdPercent: threshold,
      used: input.used,
      limit: input.limit,
      usagePercent
    } satisfies Prisma.InputJsonValue
  };
}

export function buildUsageThresholdEvents(input: ThresholdSignalInput) {
  return [createThresholdEvent(input, 80), createThresholdEvent(input, 100)].filter(
    (event): event is NonNullable<ReturnType<typeof createThresholdEvent>> =>
      event !== null
  );
}
