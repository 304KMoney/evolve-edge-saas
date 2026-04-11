import {
  BillingInterval,
  CustomerAccountTimelineEntryType,
  CustomerLifecycleStage,
  CustomerRunStatus,
  CustomerRunStep,
  EngagementOpportunityStatus,
  EngagementProgramStatus,
  EngagementProgramType,
  LeadSubmissionStatus,
  MonitoringSubscriptionStatus,
  Prisma,
  ReportStatus,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";

type KpiDashboardDbClient = Prisma.TransactionClient | typeof prisma;

export const KPI_RANGE_PRESETS = ["30d", "90d", "180d", "365d"] as const;
export type KpiRangePreset = (typeof KPI_RANGE_PRESETS)[number];

export const KPI_TREND_GRAINS = ["week", "month"] as const;
export type KpiTrendGrain = (typeof KPI_TREND_GRAINS)[number];

export type KpiDashboardFilters = {
  preset?: KpiRangePreset;
  from?: Date | null;
  to?: Date | null;
  organizationId?: string | null;
  stage?: CustomerLifecycleStage | null;
  engagementType?: EngagementProgramType | null;
  trendGrain?: KpiTrendGrain;
};

export type KpiDashboardFilterParams = {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  organizationId?: string | null;
  stage?: string | null;
  engagementType?: string | null;
  trendGrain?: string | null;
};

export type KpiSummaryMetric = {
  label: string;
  value: number;
  helperText: string;
};

export type KpiRateMetric = {
  label: string;
  numerator: number;
  denominator: number;
  percent: number;
  helperText: string;
};

export type KpiDurationMetric = {
  label: string;
  averageHours: number | null;
  helperText: string;
};

export type KpiTrendPoint = {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  value: number;
};

export type KpiMultiTrendPoint = {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  leads: number;
  paidCustomers: number;
  intakeCompleted: number;
  reportsGenerated: number;
  briefingsBooked: number;
  monitoringConversions: number;
};

export type KpiStageSnapshot = {
  stage: CustomerLifecycleStage;
  count: number;
};

export type KpiStageTrendPoint = {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  transitions: Record<CustomerLifecycleStage, number>;
};

export type KpiFailureRate = {
  step: CustomerRunStep;
  totalRuns: number;
  failedRuns: number;
  failureRatePercent: number;
};

export type KpiOrgOpportunity = {
  organizationId: string;
  organizationName: string;
  openOpportunities: number;
};

export type KpiDashboardSnapshot = {
  filters: {
    preset: KpiRangePreset;
    trendGrain: KpiTrendGrain;
    from: string;
    to: string;
    organizationId: string | null;
    stage: CustomerLifecycleStage | null;
    engagementType: EngagementProgramType | null;
  };
  summary: {
    totalLeads: KpiSummaryMetric;
    qualifiedLeads: KpiSummaryMetric;
    paidCustomers: KpiSummaryMetric;
    activeEngagements: KpiSummaryMetric;
    paidAudits: KpiSummaryMetric;
    activeMonitoringSubscriptions: KpiSummaryMetric;
    failedRuns: KpiSummaryMetric;
    recoveredRuns: KpiSummaryMetric;
    estimatedNormalizedMrrCents: KpiSummaryMetric;
    reportPackagesSent: KpiSummaryMetric;
    briefingsCompleted: KpiSummaryMetric;
  };
  rates: {
    intakeCompletion: KpiRateMetric;
    reportCompletion: KpiRateMetric;
    briefingBooking: KpiRateMetric;
    monitoringConversion: KpiRateMetric;
    runRecovery: KpiRateMetric;
  };
  durations: {
    paymentToDelivery: KpiDurationMetric;
    processing: KpiDurationMetric;
    review: KpiDurationMetric;
    delivery: KpiDurationMetric;
  };
  trends: {
    funnel: KpiMultiTrendPoint[];
    reportsGenerated: KpiTrendPoint[];
    activeVsClosedEngagements: Array<
      KpiTrendPoint & {
        closedValue: number;
      }
    >;
    customerStageMovement: KpiStageTrendPoint[];
  };
  snapshots: {
    customerStages: KpiStageSnapshot[];
    workflowFailures: KpiFailureRate[];
    dropOff: Array<{
      label: string;
      count: number;
    }>;
    expansionOpportunities: KpiOrgOpportunity[];
  };
};

type TimeBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

type ResolvedScope = {
  organizationIds: string[] | null;
  customerAccountIds: string[] | null;
  leadSubmissionIds: string[] | null;
  isEmpty: boolean;
};

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculatePercent(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

export function averageDurationHours(
  durationsMs: Array<number | null | undefined>
) {
  const valid = durationsMs.filter(
    (value): value is number =>
      Number.isFinite(value ?? NaN) && (value ?? 0) >= 0
  );

  if (!valid.length) {
    return null;
  }

  const averageMs = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return roundToTwoDecimals(averageMs / (60 * 60 * 1000));
}

export function normalizeMonthlyRecurringRevenueCents(input: {
  priceCents: number;
  billingInterval: BillingInterval;
}) {
  if (input.billingInterval === BillingInterval.ANNUAL) {
    return Math.round(input.priceCents / 12);
  }

  return input.priceCents;
}

export function intersectStringValues(
  currentValues: string[] | null,
  nextValues: string[]
) {
  if (!currentValues) {
    return nextValues;
  }

  const nextSet = new Set(nextValues);
  return currentValues.filter((value) => nextSet.has(value));
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

export function getDateRangeForPreset(
  preset: KpiRangePreset,
  now = new Date()
) {
  const end = endOfUtcDay(now);
  const days =
    preset === "30d" ? 30 : preset === "90d" ? 90 : preset === "180d" ? 180 : 365;
  const start = startOfUtcDay(
    new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  );
  return { from: start, to: end };
}

export function resolveKpiDateRange(input: {
  preset?: KpiRangePreset;
  from?: string | null;
  to?: string | null;
  now?: Date;
}) {
  const preset = input.preset ?? "90d";
  const fallback = getDateRangeForPreset(preset, input.now);

  const parsedFrom = input.from ? new Date(input.from) : null;
  const parsedTo = input.to ? new Date(input.to) : null;

  if (
    !parsedFrom ||
    Number.isNaN(parsedFrom.getTime()) ||
    !parsedTo ||
    Number.isNaN(parsedTo.getTime())
  ) {
    return {
      preset,
      from: fallback.from,
      to: fallback.to
    };
  }

  const normalizedFrom = startOfUtcDay(parsedFrom);
  const normalizedTo = endOfUtcDay(parsedTo);

  if (normalizedFrom > normalizedTo) {
    return {
      preset,
      from: fallback.from,
      to: fallback.to
    };
  }

  return {
    preset,
    from: normalizedFrom,
    to: normalizedTo
  };
}

function isKpiRangePreset(value: string | null | undefined): value is KpiRangePreset {
  return KPI_RANGE_PRESETS.includes(value as KpiRangePreset);
}

function isKpiTrendGrain(value: string | null | undefined): value is KpiTrendGrain {
  return KPI_TREND_GRAINS.includes(value as KpiTrendGrain);
}

function isEnumValue<TValue extends string>(
  value: string | null | undefined,
  allowedValues: readonly TValue[]
): value is TValue {
  return Boolean(value) && allowedValues.includes(value as TValue);
}

export function parseKpiDashboardFilters(
  params: KpiDashboardFilterParams,
  now = new Date()
): KpiDashboardFilters {
  const preset = isKpiRangePreset(params.preset) ? params.preset : "90d";
  const trendGrain = isKpiTrendGrain(params.trendGrain) ? params.trendGrain : "week";
  const range = resolveKpiDateRange({
    preset,
    from: params.from ?? null,
    to: params.to ?? null,
    now
  });

  return {
    preset,
    trendGrain,
    from: range.from,
    to: range.to,
    organizationId: params.organizationId?.trim() || null,
    stage: isEnumValue(
      params.stage,
      Object.values(CustomerLifecycleStage) as CustomerLifecycleStage[]
    )
      ? params.stage
      : null,
    engagementType: isEnumValue(
      params.engagementType,
      Object.values(EngagementProgramType) as EngagementProgramType[]
    )
      ? params.engagementType
      : null
  };
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return startOfUtcDay(addUtcDays(date, diff));
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatBucketLabel(date: Date, grain: KpiTrendGrain) {
  if (grain === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC"
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function createTimeBuckets(input: {
  from: Date;
  to: Date;
  grain: KpiTrendGrain;
}) {
  const buckets: TimeBucket[] = [];
  const firstStart =
    input.grain === "month" ? startOfUtcMonth(input.from) : startOfUtcWeek(input.from);

  let cursor = firstStart;

  while (cursor <= input.to) {
    const nextStart =
      input.grain === "month"
        ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
        : addUtcDays(cursor, 7);
    const end = new Date(nextStart.getTime() - 1);

    buckets.push({
      key:
        input.grain === "month"
          ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
          : `${cursor.getUTCFullYear()}-W${String(
              Math.floor((cursor.getUTCDate() - 1) / 7) + 1
            ).padStart(2, "0")}`,
      label: formatBucketLabel(cursor, input.grain),
      start: cursor,
      end
    });

    cursor = nextStart;
  }

  return buckets.filter((bucket) => bucket.end >= input.from && bucket.start <= input.to);
}

function getBucketKeyForDate(date: Date, buckets: TimeBucket[]) {
  return buckets.find((bucket) => date >= bucket.start && date <= bucket.end)?.key ?? null;
}

function countDatesByBucket(dates: Date[], buckets: TimeBucket[]) {
  const counts = new Map<string, number>();

  for (const bucket of buckets) {
    counts.set(bucket.key, 0);
  }

  for (const date of dates) {
    const bucketKey = getBucketKeyForDate(date, buckets);
    if (!bucketKey) {
      continue;
    }

    counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
  }

  return counts;
}

function buildOrgScopeWhere(organizationIds: string[] | null) {
  if (!organizationIds) {
    return undefined;
  }

  if (!organizationIds.length) {
    return { in: ["__none__"] };
  }

  return { in: organizationIds };
}

function getReportPublishedAt(report: {
  publishedAt: Date | null;
  createdAt: Date;
}) {
  return report.publishedAt ?? report.createdAt;
}

function getFirstPaidAt(subscription: {
  lastInvoicePaidAt: Date | null;
  currentPeriodStart: Date | null;
  reactivatedAt: Date | null;
  statusUpdatedAt: Date;
}) {
  return (
    subscription.lastInvoicePaidAt ??
    subscription.currentPeriodStart ??
    subscription.reactivatedAt ??
    subscription.statusUpdatedAt
  );
}

function parseStageFromTimelineMetadata(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const maybeStage = (metadata as Record<string, unknown>).toStage;
  return typeof maybeStage === "string" &&
    Object.values(CustomerLifecycleStage).includes(maybeStage as CustomerLifecycleStage)
    ? (maybeStage as CustomerLifecycleStage)
    : null;
}

async function resolveKpiScope(
  input: {
    organizationId?: string | null;
    stage?: CustomerLifecycleStage | null;
    engagementType?: EngagementProgramType | null;
  },
  db: KpiDashboardDbClient
): Promise<ResolvedScope> {
  let organizationIds = input.organizationId ? [input.organizationId] : null;
  let customerAccountIds: string[] | null = null;
  let leadSubmissionIds: string[] | null = null;

  if (input.stage) {
    const accounts = await db.customerAccount.findMany({
      where: {
        lifecycleStage: input.stage,
        ...(organizationIds ? { organizationId: { in: organizationIds } } : {})
      },
      select: {
        id: true,
        organizationId: true,
        primaryLeadSubmissionId: true
      }
    });

    organizationIds = intersectStringValues(
      organizationIds,
      accounts
        .map((account) => account.organizationId)
        .filter((value): value is string => Boolean(value))
    );
    customerAccountIds = accounts.map((account) => account.id);
    leadSubmissionIds = accounts
      .map((account) => account.primaryLeadSubmissionId)
      .filter((value): value is string => Boolean(value));
  }

  if (input.engagementType) {
    const programs = await db.engagementProgram.findMany({
      where: {
        type: input.engagementType,
        ...(organizationIds ? { organizationId: { in: organizationIds } } : {})
      },
      select: {
        organizationId: true,
        customerAccountId: true
      }
    });

    organizationIds = intersectStringValues(
      organizationIds,
      programs.map((program) => program.organizationId)
    );

    const nextCustomerAccountIds = programs
      .map((program) => program.customerAccountId)
      .filter((value): value is string => Boolean(value));

    customerAccountIds = intersectStringValues(customerAccountIds, nextCustomerAccountIds);
  }

  const scopeIsEmpty =
    (organizationIds !== null && organizationIds.length === 0) ||
    (customerAccountIds !== null && customerAccountIds.length === 0 && input.stage !== null);

  return {
    organizationIds,
    customerAccountIds,
    leadSubmissionIds,
    isEmpty: scopeIsEmpty
  };
}

export async function getKpiDashboardSnapshot(
  input: KpiDashboardFilters,
  db: KpiDashboardDbClient = prisma
): Promise<KpiDashboardSnapshot> {
  const preset = input.preset ?? "90d";
  const trendGrain = input.trendGrain ?? "week";
  const from = input.from ?? getDateRangeForPreset(preset).from;
  const to = input.to ?? getDateRangeForPreset(preset).to;
  const scope = await resolveKpiScope(
    {
      organizationId: input.organizationId,
      stage: input.stage,
      engagementType: input.engagementType
    },
    db
  );
  const orgScopeWhere = buildOrgScopeWhere(scope.organizationIds);

  if (scope.isEmpty) {
    return {
      filters: {
        preset,
        trendGrain,
        from: formatDateInput(from),
        to: formatDateInput(to),
        organizationId: input.organizationId ?? null,
        stage: input.stage ?? null,
        engagementType: input.engagementType ?? null
      },
      summary: {
        totalLeads: {
          label: "Total leads",
          value: 0,
          helperText: "No leads match the active filter scope."
        },
        qualifiedLeads: {
          label: "Qualified leads",
          value: 0,
          helperText: "No qualified leads match the active filter scope."
        },
        paidCustomers: {
          label: "Paid customers",
          value: 0,
          helperText: "No won customers match the active filter scope."
        },
        activeEngagements: {
          label: "Active engagements",
          value: 0,
          helperText: "No active engagements match the active filter scope."
        },
        paidAudits: {
          label: "Paid audits",
          value: 0,
          helperText: "No audit programs match the active filter scope."
        },
        activeMonitoringSubscriptions: {
          label: "Monitoring subscriptions",
          value: 0,
          helperText: "No active monitoring subscriptions match the active filter scope."
        },
        failedRuns: {
          label: "Failed runs",
          value: 0,
          helperText: "No failed or action-required runs match the active filter scope."
        },
        recoveredRuns: {
          label: "Recovered runs",
          value: 0,
          helperText: "No recovered runs match the active filter scope."
        },
        estimatedNormalizedMrrCents: {
          label: "Estimated normalized MRR",
          value: 0,
          helperText: "No active subscriptions match the active filter scope."
        },
        reportPackagesSent: {
          label: "Report packages sent",
          value: 0,
          helperText: "No sent packages match the active filter scope."
        },
        briefingsCompleted: {
          label: "Briefings completed",
          value: 0,
          helperText: "No completed briefings match the active filter scope."
        }
      },
      rates: {
        intakeCompletion: {
          label: "Intake completion",
          numerator: 0,
          denominator: 0,
          percent: 0,
          helperText: "Paid customers to intake completion."
        },
        reportCompletion: {
          label: "Report completion",
          numerator: 0,
          denominator: 0,
          percent: 0,
          helperText: "Completed intake to report generation."
        },
        briefingBooking: {
          label: "Briefing booking",
          numerator: 0,
          denominator: 0,
          percent: 0,
          helperText: "Generated report packages to booked briefings."
        },
        monitoringConversion: {
          label: "Monitoring conversion",
          numerator: 0,
          denominator: 0,
          percent: 0,
          helperText: "Completed briefings to ongoing monitoring activation."
        },
        runRecovery: {
          label: "Run recovery",
          numerator: 0,
          denominator: 0,
          percent: 0,
          helperText: "Failed or action-required runs with a recorded recovery."
        }
      },
      durations: {
        paymentToDelivery: {
          label: "Payment to delivery",
          averageHours: null,
          helperText: "No completed delivery cycles in this scope."
        },
        processing: {
          label: "Processing time",
          averageHours: null,
          helperText: "No completed customer runs in this scope."
        },
        review: {
          label: "QA review time",
          averageHours: null,
          helperText: "No reviewed report packages in this scope."
        },
        delivery: {
          label: "Delivery time",
          averageHours: null,
          helperText: "No sent report packages in this scope."
        }
      },
      trends: {
        funnel: [],
        reportsGenerated: [],
        activeVsClosedEngagements: [],
        customerStageMovement: []
      },
      snapshots: {
        customerStages: [],
        workflowFailures: [],
        dropOff: [],
        expansionOpportunities: []
      }
    };
  }

  const leadWhere =
    (scope.organizationIds?.length ?? 0) > 0 || (scope.leadSubmissionIds?.length ?? 0) > 0
      ? {
          OR: [
            ...(scope.organizationIds ? [{ organizationId: { in: scope.organizationIds } }] : []),
            ...(scope.leadSubmissionIds?.length ? [{ id: { in: scope.leadSubmissionIds } }] : [])
          ]
        }
      : undefined;

  const [
    leads,
    paidCustomerAccounts,
    stageSnapshotGroups,
    stageTransitions,
    assessments,
    reports,
    reportPackages,
    monitoringSubscriptions,
    activeSubscriptions,
    engagementPrograms,
    engagementOpportunitiesByOrg,
    customerRuns
  ] = await Promise.all([
    db.leadSubmission.findMany({
      where: {
        submittedAt: { gte: from, lte: to },
        ...(leadWhere ?? {})
      },
      select: {
        id: true,
        stage: true,
        submittedAt: true,
        organizationId: true
      }
    }),
    db.customerAccount.findMany({
      where: {
        wonAt: { gte: from, lte: to },
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      select: {
        id: true,
        organizationId: true,
        wonAt: true,
        lifecycleStage: true
      }
    }),
    db.customerAccount.groupBy({
      by: ["lifecycleStage"],
      where: {
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      _count: {
        _all: true
      }
    }),
    db.customerAccountTimelineEntry.findMany({
      where: {
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        createdAt: { gte: from, lte: to },
        ...(scope.customerAccountIds?.length
          ? { customerAccountId: { in: scope.customerAccountIds } }
          : orgScopeWhere
            ? { organizationId: orgScopeWhere }
            : {})
      },
      select: {
        createdAt: true,
        metadata: true
      }
    }),
    db.assessment.findMany({
      where: {
        submittedAt: { gte: from, lte: to },
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      select: {
        id: true,
        organizationId: true,
        submittedAt: true
      }
    }),
    db.report.findMany({
      where: {
        status: {
          in: [ReportStatus.READY, ReportStatus.DELIVERED, ReportStatus.SUPERSEDED]
        },
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {}),
        OR: [
          { publishedAt: { gte: from, lte: to } },
          {
            publishedAt: null,
            createdAt: { gte: from, lte: to }
          }
        ]
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        createdAt: true,
        publishedAt: true,
        deliveredAt: true
      }
    }),
    db.reportPackage.findMany({
      where: {
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {}),
        OR: [
          { createdAt: { gte: from, lte: to } },
          { reviewedAt: { gte: from, lte: to } },
          { sentAt: { gte: from, lte: to } },
          { briefingBookedAt: { gte: from, lte: to } },
          { briefingCompletedAt: { gte: from, lte: to } }
        ]
      },
      select: {
        id: true,
        organizationId: true,
        createdAt: true,
        reviewedAt: true,
        sentAt: true,
        briefingBookedAt: true,
        briefingCompletedAt: true
      }
    }),
    db.monitoringSubscription.findMany({
      where: {
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {}),
        OR: [
          { activatedAt: { gte: from, lte: to } },
          { status: MonitoringSubscriptionStatus.ACTIVE }
        ]
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        activatedAt: true
      }
    }),
    db.subscription.findMany({
      where: {
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]
        },
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        lastInvoicePaidAt: true,
        currentPeriodStart: true,
        reactivatedAt: true,
        statusUpdatedAt: true,
        plan: {
          select: {
            priceCents: true,
            billingInterval: true
          }
        }
      }
    }),
    db.engagementProgram.findMany({
      where: {
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {}),
        ...(input.engagementType ? { type: input.engagementType } : {}),
        OR: [
          { startedAt: { gte: from, lte: to } },
          { completedAt: { gte: from, lte: to } },
          { canceledAt: { gte: from, lte: to } },
          { status: EngagementProgramStatus.ACTIVE },
          { status: EngagementProgramStatus.PAUSED }
        ]
      },
      select: {
        id: true,
        organizationId: true,
        type: true,
        status: true,
        startedAt: true,
        completedAt: true,
        canceledAt: true
      }
    }),
    db.engagementOpportunity.groupBy({
      by: ["organizationId"],
      where: {
        status: EngagementOpportunityStatus.OPEN,
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      _count: {
        _all: true
      },
      orderBy: {
        organizationId: "asc"
      },
      take: 10
    }),
    db.customerRun.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(orgScopeWhere ? { organizationId: orgScopeWhere } : {})
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        currentStep: true,
        startedAt: true,
        completedAt: true,
        lastRecoveredAt: true
      }
    })
  ]);

  const opportunityOrgIds = engagementOpportunitiesByOrg.map((entry) => entry.organizationId);
  const opportunityOrganizations =
    opportunityOrgIds.length > 0
      ? await db.organization.findMany({
          where: { id: { in: opportunityOrgIds } },
          select: { id: true, name: true }
        })
      : [];

  const opportunityOrgNameById = new Map(
    opportunityOrganizations.map((organization) => [organization.id, organization.name])
  );

  const buckets = createTimeBuckets({
    from,
    to,
    grain: trendGrain
  });

  const leadsCountByBucket = countDatesByBucket(
    leads.map((lead) => lead.submittedAt),
    buckets
  );
  const paidCountByBucket = countDatesByBucket(
    paidCustomerAccounts
      .map((account) => account.wonAt)
      .filter((value): value is Date => Boolean(value)),
    buckets
  );
  const intakeCountByBucket = countDatesByBucket(
    assessments
      .map((assessment) => assessment.submittedAt)
      .filter((value): value is Date => Boolean(value)),
    buckets
  );
  const reportsCountByBucket = countDatesByBucket(
    reports.map((report) => getReportPublishedAt(report)),
    buckets
  );
  const briefingBookedCountByBucket = countDatesByBucket(
    reportPackages
      .map((reportPackage) => reportPackage.briefingBookedAt)
      .filter((value): value is Date => Boolean(value)),
    buckets
  );
  const monitoringCountByBucket = countDatesByBucket(
    monitoringSubscriptions
      .filter((subscription) => subscription.activatedAt)
      .map((subscription) => subscription.activatedAt as Date),
    buckets
  );

  const stageMovementCounts = new Map<string, Record<CustomerLifecycleStage, number>>();
  for (const bucket of buckets) {
    stageMovementCounts.set(
      bucket.key,
      Object.fromEntries(
        Object.values(CustomerLifecycleStage).map((stage) => [stage, 0])
      ) as Record<CustomerLifecycleStage, number>
    );
  }
  for (const transition of stageTransitions) {
    const stage = parseStageFromTimelineMetadata(transition.metadata);
    const bucketKey = getBucketKeyForDate(transition.createdAt, buckets);
    if (!stage || !bucketKey) {
      continue;
    }

    const record = stageMovementCounts.get(bucketKey);
    if (!record) {
      continue;
    }

    record[stage] += 1;
  }

  const startedEngagementCountsByBucket = countDatesByBucket(
    engagementPrograms
      .map((program) => program.startedAt)
      .filter((value): value is Date => Boolean(value)),
    buckets
  );
  const closedEngagementCountsByBucket = countDatesByBucket(
    engagementPrograms
      .flatMap((program) => [program.completedAt, program.canceledAt])
      .filter((value): value is Date => Boolean(value)),
    buckets
  );

  const successfulReports = reports;
  const packagesBooked = reportPackages.filter(
    (reportPackage) => reportPackage.briefingBookedAt
  );
  const packagesCompleted = reportPackages.filter(
    (reportPackage) => reportPackage.briefingCompletedAt
  );
  const packagesSent = reportPackages.filter((reportPackage) => reportPackage.sentAt);
  const runsNeedingRecovery = customerRuns.filter(
    (run) =>
      run.status === CustomerRunStatus.ACTION_REQUIRED ||
      run.status === CustomerRunStatus.FAILED
  );
  const recoveredRuns = runsNeedingRecovery.filter((run) => run.lastRecoveredAt);
  const activeEngagements = engagementPrograms.filter(
    (program) =>
      program.status === EngagementProgramStatus.ACTIVE ||
      program.status === EngagementProgramStatus.PAUSED
  );
  const paidAudits = engagementPrograms.filter(
    (program) =>
      program.type === EngagementProgramType.ONE_TIME_AUDIT &&
      program.status !== EngagementProgramStatus.DRAFT
  );
  const activeMonitoringSubscriptions = monitoringSubscriptions.filter(
    (subscription) => subscription.status === MonitoringSubscriptionStatus.ACTIVE
  );
  const estimatedNormalizedMrrCents = activeSubscriptions.reduce(
    (sum, subscription) =>
      sum +
      normalizeMonthlyRecurringRevenueCents({
        priceCents: subscription.plan.priceCents,
        billingInterval: subscription.plan.billingInterval as BillingInterval
      }),
    0
  );

  const workflowFailureMap = new Map<
    CustomerRunStep,
    {
      totalRuns: number;
      failedRuns: number;
    }
  >();
  for (const step of Object.values(CustomerRunStep)) {
    workflowFailureMap.set(step, { totalRuns: 0, failedRuns: 0 });
  }
  for (const run of customerRuns) {
    const record = workflowFailureMap.get(run.currentStep);
    if (!record) {
      continue;
    }

    record.totalRuns += 1;
    if (
      run.status === CustomerRunStatus.ACTION_REQUIRED ||
      run.status === CustomerRunStatus.FAILED
    ) {
      record.failedRuns += 1;
    }
  }

  const subscriptionFirstPaidByOrgId = new Map<string, Date>();
  for (const subscription of activeSubscriptions) {
    const candidate = getFirstPaidAt(subscription);
    const existing = subscriptionFirstPaidByOrgId.get(subscription.organizationId);
    if (!existing || candidate < existing) {
      subscriptionFirstPaidByOrgId.set(subscription.organizationId, candidate);
    }
  }

  const wonAtByOrgId = new Map(
    paidCustomerAccounts
      .filter(
        (
          account
        ): account is typeof account & { organizationId: string; wonAt: Date } =>
          Boolean(account.organizationId && account.wonAt)
      )
      .map((account) => [account.organizationId, account.wonAt])
  );
  const firstPackageSentByOrgId = new Map<string, Date>();
  for (const reportPackage of packagesSent) {
    if (!reportPackage.organizationId || !reportPackage.sentAt) {
      continue;
    }
    const existing = firstPackageSentByOrgId.get(reportPackage.organizationId);
    if (!existing || reportPackage.sentAt < existing) {
      firstPackageSentByOrgId.set(reportPackage.organizationId, reportPackage.sentAt);
    }
  }

  const paymentToDeliveryDurations: number[] = [];
  for (const [organizationId, sentAt] of firstPackageSentByOrgId.entries()) {
    const paidAt =
      subscriptionFirstPaidByOrgId.get(organizationId) ?? wonAtByOrgId.get(organizationId);
    if (!paidAt || sentAt < paidAt) {
      continue;
    }

    if (sentAt < from || sentAt > to) {
      continue;
    }

    paymentToDeliveryDurations.push(sentAt.getTime() - paidAt.getTime());
  }

  const reportPackageReviewDurations = reportPackages
    .filter((reportPackage) => reportPackage.reviewedAt)
    .map(
      (reportPackage) =>
        (reportPackage.reviewedAt as Date).getTime() - reportPackage.createdAt.getTime()
    );
  const reportPackageDeliveryDurations = reportPackages
    .filter((reportPackage) => reportPackage.sentAt)
    .map((reportPackage) => {
      const start = reportPackage.reviewedAt ?? reportPackage.createdAt;
      return (reportPackage.sentAt as Date).getTime() - start.getTime();
    });
  const runProcessingDurations = customerRuns
    .filter((run) => run.completedAt)
    .map((run) => (run.completedAt as Date).getTime() - run.startedAt.getTime());

  const dropOff = [
    {
      label: "Leads not yet qualified",
      count: Math.max(
        leads.length -
          leads.filter((lead) => lead.stage !== LeadSubmissionStatus.CAPTURED).length,
        0
      )
    },
    {
      label: "Won customers without intake completion",
      count: Math.max(paidCustomerAccounts.length - assessments.length, 0)
    },
    {
      label: "Completed intake without report generation",
      count: Math.max(assessments.length - successfulReports.length, 0)
    },
    {
      label: "Reports without booked briefing",
      count: Math.max(successfulReports.length - packagesBooked.length, 0)
    },
    {
      label: "Completed briefings without monitoring",
      count: Math.max(packagesCompleted.length - activeMonitoringSubscriptions.length, 0)
    }
  ];

  return {
    filters: {
      preset,
      trendGrain,
      from: formatDateInput(from),
      to: formatDateInput(to),
      organizationId: input.organizationId ?? null,
      stage: input.stage ?? null,
      engagementType: input.engagementType ?? null
    },
    summary: {
      totalLeads: {
        label: "Total leads",
        value: leads.length,
        helperText: "Lead submissions captured in the selected time window."
      },
      qualifiedLeads: {
        label: "Qualified leads",
        value: leads.filter((lead) => lead.stage !== LeadSubmissionStatus.CAPTURED).length,
        helperText: "Captured leads whose current stage is qualified or converted."
      },
      paidCustomers: {
        label: "Paid customers",
        value: paidCustomerAccounts.length,
        helperText: "Customer accounts that reached the won stage in the selected time window."
      },
      activeEngagements: {
        label: "Active engagements",
        value: activeEngagements.length,
        helperText: "Current active or paused engagement programs in scope."
      },
      paidAudits: {
        label: "Paid audits",
        value: paidAudits.length,
        helperText: "One-time audit programs that are no longer drafts."
      },
      activeMonitoringSubscriptions: {
        label: "Monitoring subscriptions",
        value: activeMonitoringSubscriptions.length,
        helperText: "Current active monitoring subscriptions in scope."
      },
      failedRuns: {
        label: "Failed runs",
        value: runsNeedingRecovery.length,
        helperText: "Customer runs that are failed or waiting on operator recovery."
      },
      recoveredRuns: {
        label: "Recovered runs",
        value: recoveredRuns.length,
        helperText: "Failed or action-required runs with a recorded recovery attempt."
      },
      estimatedNormalizedMrrCents: {
        label: "Estimated normalized MRR",
        value: estimatedNormalizedMrrCents,
        helperText:
          "Monthly-equivalent recurring revenue from active, trialing, and past-due subscriptions."
      },
      reportPackagesSent: {
        label: "Report packages sent",
        value: packagesSent.length,
        helperText: "Executive delivery packages marked sent in the selected window."
      },
      briefingsCompleted: {
        label: "Briefings completed",
        value: packagesCompleted.length,
        helperText: "Report package briefings completed in the selected window."
      }
    },
    rates: {
      intakeCompletion: {
        label: "Intake completion",
        numerator: assessments.length,
        denominator: paidCustomerAccounts.length,
        percent: calculatePercent(assessments.length, paidCustomerAccounts.length),
        helperText: "Completed intake submissions divided by won customers."
      },
      reportCompletion: {
        label: "Report completion",
        numerator: successfulReports.length,
        denominator: assessments.length,
        percent: calculatePercent(successfulReports.length, assessments.length),
        helperText: "Generated reports divided by completed intake submissions."
      },
      briefingBooking: {
        label: "Briefing booking",
        numerator: packagesBooked.length,
        denominator: successfulReports.length,
        percent: calculatePercent(packagesBooked.length, successfulReports.length),
        helperText: "Booked briefings divided by generated reports."
      },
      monitoringConversion: {
        label: "Monitoring conversion",
        numerator: activeMonitoringSubscriptions.length,
        denominator: packagesCompleted.length,
        percent: calculatePercent(activeMonitoringSubscriptions.length, packagesCompleted.length),
        helperText: "Active monitoring subscriptions divided by completed briefings."
      },
      runRecovery: {
        label: "Run recovery",
        numerator: recoveredRuns.length,
        denominator: runsNeedingRecovery.length,
        percent: calculatePercent(recoveredRuns.length, runsNeedingRecovery.length),
        helperText: "Failed or action-required runs with a recorded recovery."
      }
    },
    durations: {
      paymentToDelivery: {
        label: "Payment to delivery",
        averageHours: averageDurationHours(paymentToDeliveryDurations),
        helperText:
          "Earliest paid marker on the organization to first executive package sent."
      },
      processing: {
        label: "Processing time",
        averageHours: averageDurationHours(runProcessingDurations),
        helperText: "Customer run started-at to completed-at duration."
      },
      review: {
        label: "QA review time",
        averageHours: averageDurationHours(reportPackageReviewDurations),
        helperText: "Report package created-at to reviewed-at duration."
      },
      delivery: {
        label: "Delivery time",
        averageHours: averageDurationHours(reportPackageDeliveryDurations),
        helperText: "Report package reviewed-at or created-at to sent-at duration."
      }
    },
    trends: {
      funnel: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        periodStart: bucket.start.toISOString(),
        periodEnd: bucket.end.toISOString(),
        leads: leadsCountByBucket.get(bucket.key) ?? 0,
        paidCustomers: paidCountByBucket.get(bucket.key) ?? 0,
        intakeCompleted: intakeCountByBucket.get(bucket.key) ?? 0,
        reportsGenerated: reportsCountByBucket.get(bucket.key) ?? 0,
        briefingsBooked: briefingBookedCountByBucket.get(bucket.key) ?? 0,
        monitoringConversions: monitoringCountByBucket.get(bucket.key) ?? 0
      })),
      reportsGenerated: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        periodStart: bucket.start.toISOString(),
        periodEnd: bucket.end.toISOString(),
        value: reportsCountByBucket.get(bucket.key) ?? 0
      })),
      activeVsClosedEngagements: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        periodStart: bucket.start.toISOString(),
        periodEnd: bucket.end.toISOString(),
        value: startedEngagementCountsByBucket.get(bucket.key) ?? 0,
        closedValue: closedEngagementCountsByBucket.get(bucket.key) ?? 0
      })),
      customerStageMovement: buckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        periodStart: bucket.start.toISOString(),
        periodEnd: bucket.end.toISOString(),
        transitions:
          stageMovementCounts.get(bucket.key) ??
          (Object.fromEntries(
            Object.values(CustomerLifecycleStage).map((stage) => [stage, 0])
          ) as Record<CustomerLifecycleStage, number>)
      }))
    },
    snapshots: {
      customerStages: stageSnapshotGroups
        .map((entry) => ({
          stage: entry.lifecycleStage,
          count: entry._count._all
        }))
        .sort((a, b) => b.count - a.count),
      workflowFailures: Array.from(workflowFailureMap.entries()).map(
        ([step, value]) => ({
          step,
          totalRuns: value.totalRuns,
          failedRuns: value.failedRuns,
          failureRatePercent: calculatePercent(value.failedRuns, value.totalRuns)
        })
      ),
      dropOff,
      expansionOpportunities: engagementOpportunitiesByOrg
        .map((entry) => ({
          organizationId: entry.organizationId,
          organizationName:
            opportunityOrgNameById.get(entry.organizationId) ?? entry.organizationId,
          openOpportunities: entry._count._all
        }))
        .sort((a, b) => b.openOpportunities - a.openOpportunities)
    }
  };
}

export function formatCurrencyDollarsFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function serializeKpiSnapshotToCsv(snapshot: KpiDashboardSnapshot) {
  const rows: string[][] = [];
  const pushRow = (...values: Array<string | number | null | undefined>) => {
    rows.push(values.map((value) => `${value ?? ""}`));
  };

  pushRow("Section", "Metric", "Value", "Details");

  for (const metric of Object.values(snapshot.summary)) {
    pushRow("summary", metric.label, metric.value, metric.helperText);
  }

  for (const metric of Object.values(snapshot.rates)) {
    pushRow(
      "rates",
      metric.label,
      `${metric.percent}%`,
      `${metric.numerator}/${metric.denominator} / ${metric.helperText}`
    );
  }

  for (const metric of Object.values(snapshot.durations)) {
    pushRow(
      "durations",
      metric.label,
      metric.averageHours ?? "n/a",
      metric.helperText
    );
  }

  for (const point of snapshot.trends.funnel) {
    pushRow(
      "funnel_trend",
      point.label,
      "",
      `leads=${point.leads}; paid=${point.paidCustomers}; intake=${point.intakeCompleted}; reports=${point.reportsGenerated}; briefings=${point.briefingsBooked}; monitoring=${point.monitoringConversions}`
    );
  }

  for (const stage of snapshot.snapshots.customerStages) {
    pushRow("customer_stage_snapshot", stage.stage, stage.count, "");
  }

  for (const item of snapshot.snapshots.expansionOpportunities) {
    pushRow(
      "expansion_opportunities",
      item.organizationName,
      item.openOpportunities,
      item.organizationId
    );
  }

  return rows
    .map((row) =>
      row
        .map((value) => `"${value.replaceAll("\"", "\"\"")}"`)
        .join(",")
    )
    .join("\n");
}
