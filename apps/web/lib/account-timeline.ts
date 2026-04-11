import {
  AuditActorType,
  CustomerAccountTimelineCategory,
  CustomerAccountTimelineEntryType,
  CustomerAccountTimelineSeverity,
  CustomerAccountTimelineSourceSystem,
  CustomerAccountTimelineVisibility,
  CustomerRunStatus,
  LeadSubmissionStatus,
  MonitoringSubscriptionStatus,
  Prisma,
  ProvisioningStatus,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";

type AccountTimelineDbClient = Prisma.TransactionClient | typeof prisma;

export const ACCOUNT_TIMELINE_CATEGORIES = Object.values(
  CustomerAccountTimelineCategory
) as CustomerAccountTimelineCategory[];
export const ACCOUNT_TIMELINE_SOURCE_SYSTEMS = Object.values(
  CustomerAccountTimelineSourceSystem
) as CustomerAccountTimelineSourceSystem[];
export const ACCOUNT_TIMELINE_SEVERITIES = Object.values(
  CustomerAccountTimelineSeverity
) as CustomerAccountTimelineSeverity[];
export const ACCOUNT_TIMELINE_VISIBILITIES = Object.values(
  CustomerAccountTimelineVisibility
) as CustomerAccountTimelineVisibility[];

export type AccountTimelineFilters = {
  q?: string | null;
  category?: CustomerAccountTimelineCategory | null;
  sourceSystem?: CustomerAccountTimelineSourceSystem | null;
  severity?: CustomerAccountTimelineSeverity | null;
  visibility?: CustomerAccountTimelineVisibility | null;
  actor?: string | null;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
};

export type AccountTimelineEventInput = {
  customerAccountId: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string | null;
  entryType: CustomerAccountTimelineEntryType;
  category: CustomerAccountTimelineCategory;
  title: string;
  eventCode: string;
  eventKey?: string | null;
  body?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  severity?: CustomerAccountTimelineSeverity;
  visibility?: CustomerAccountTimelineVisibility;
  sourceSystem?: CustomerAccountTimelineSourceSystem;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  occurredAt?: Date | null;
};

export function formatAccountTimelineLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAccountTimelineCategory(category: CustomerAccountTimelineCategory) {
  return formatAccountTimelineLabel(category);
}

export function formatAccountTimelineSeverity(severity: CustomerAccountTimelineSeverity) {
  return formatAccountTimelineLabel(severity);
}

export function formatAccountTimelineVisibility(
  visibility: CustomerAccountTimelineVisibility
) {
  return formatAccountTimelineLabel(visibility);
}

export function formatAccountTimelineSourceSystem(
  sourceSystem: CustomerAccountTimelineSourceSystem
) {
  return sourceSystem === CustomerAccountTimelineSourceSystem.N8N
    ? "n8n"
    : sourceSystem === CustomerAccountTimelineSourceSystem.DIFY
      ? "Dify"
      : formatAccountTimelineLabel(sourceSystem);
}

export async function recordCustomerAccountTimelineEvent(
  db: AccountTimelineDbClient,
  input: AccountTimelineEventInput
) {
  const data = {
    customerAccountId: input.customerAccountId,
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? null,
    entryType: input.entryType,
    category: input.category,
    visibility: input.visibility ?? CustomerAccountTimelineVisibility.INTERNAL,
    severity: input.severity ?? CustomerAccountTimelineSeverity.INFO,
    sourceSystem: input.sourceSystem ?? CustomerAccountTimelineSourceSystem.APP,
    eventCode: input.eventCode,
    eventKey: input.eventKey ?? null,
    sourceRecordType: input.sourceRecordType ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? undefined,
    occurredAt: input.occurredAt ?? new Date()
  } satisfies Prisma.CustomerAccountTimelineEntryUncheckedCreateInput;

  if (!input.eventKey) {
    return db.customerAccountTimelineEntry.create({ data });
  }

  return db.customerAccountTimelineEntry.upsert({
    where: { eventKey: input.eventKey },
    create: data,
    update: {
      organizationId: data.organizationId,
      actorUserId: data.actorUserId,
      actorType: data.actorType,
      actorLabel: data.actorLabel,
      entryType: data.entryType,
      category: data.category,
      visibility: data.visibility,
      severity: data.severity,
      sourceSystem: data.sourceSystem,
      eventCode: data.eventCode,
      sourceRecordType: data.sourceRecordType,
      sourceRecordId: data.sourceRecordId,
      title: data.title,
      body: data.body,
      metadata: data.metadata ?? Prisma.JsonNull,
      occurredAt: data.occurredAt
    }
  });
}

function buildTimelineWhere(
  customerAccountId: string,
  filters: AccountTimelineFilters
): Prisma.CustomerAccountTimelineEntryWhereInput {
  const q = filters.q?.trim();
  const actor = filters.actor?.trim();

  return {
    customerAccountId,
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.sourceSystem ? { sourceSystem: filters.sourceSystem } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(actor
      ? {
          OR: [
            {
              actorLabel: {
                contains: actor,
                mode: "insensitive"
              }
            },
            {
              actorUser: {
                email: {
                  contains: actor,
                  mode: "insensitive"
                }
              }
            }
          ]
        }
      : {}),
    ...((filters.from ?? filters.to)
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {})
          }
        }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
            { eventCode: { contains: q, mode: "insensitive" } },
            { sourceRecordType: { contains: q, mode: "insensitive" } },
            { sourceRecordId: { contains: q, mode: "insensitive" } },
            { actorLabel: { contains: q, mode: "insensitive" } }
          ]
        }
      : {})
  };
}

export async function listCustomerAccountTimelineEvents(
  customerAccountId: string,
  filters: AccountTimelineFilters = {},
  db: AccountTimelineDbClient = prisma
) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = Math.min(Math.max(filters.pageSize ?? 40, 1), 100);
  const where = buildTimelineWhere(customerAccountId, filters);

  const [items, totalCount] = await Promise.all([
    db.customerAccountTimelineEntry.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.customerAccountTimelineEntry.count({ where })
  ]);

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1)
  };
}

type SyncCandidateEvent = AccountTimelineEventInput;

function truncateText(value: string | null | undefined, length: number) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length <= length ? trimmed : `${trimmed.slice(0, length - 3)}...`;
}

function buildStableTimestampSuffix(value: Date | null | undefined, fallback: string) {
  return value ? value.toISOString() : fallback;
}

function pushSyncEvent(events: SyncCandidateEvent[], event: SyncCandidateEvent | null) {
  if (event) {
    events.push(event);
  }
}

export function buildLeadTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  leads: Array<{
    id: string;
    email: string;
    source: string;
    intent: string | null;
    stage: LeadSubmissionStatus;
    sourcePath: string | null;
    requestedPlanCode: string | null;
    pricingContext: string | null;
    submittedAt: Date;
    updatedAt: Date;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const lead of input.leads) {
    pushSyncEvent(events, {
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: lead.email,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      category: CustomerAccountTimelineCategory.LEAD,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "lead.submitted",
      eventKey: `timeline:lead.submitted:${lead.id}`,
      sourceRecordType: "leadSubmission",
      sourceRecordId: lead.id,
      title: "Lead captured",
      body: truncateText(
        `Source ${lead.source}${lead.requestedPlanCode ? ` | Requested ${lead.requestedPlanCode}` : ""}${lead.pricingContext ? ` | ${lead.pricingContext}` : ""}`,
        280
      ),
      metadata: {
        leadSubmissionId: lead.id,
        source: lead.source,
        intent: lead.intent,
        sourcePath: lead.sourcePath,
        requestedPlanCode: lead.requestedPlanCode,
        pricingContext: lead.pricingContext
      },
      occurredAt: lead.submittedAt
    });

    if (lead.stage === LeadSubmissionStatus.QUALIFIED || lead.stage === LeadSubmissionStatus.CONVERTED) {
      pushSyncEvent(events, {
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: lead.email,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.SALES,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode:
          lead.stage === LeadSubmissionStatus.CONVERTED
            ? "sales.lead_converted"
            : "sales.lead_qualified",
        eventKey: `timeline:lead.stage:${lead.id}:${lead.stage}`,
        sourceRecordType: "leadSubmission",
        sourceRecordId: lead.id,
        title:
          lead.stage === LeadSubmissionStatus.CONVERTED
            ? "Lead converted"
            : "Lead qualified",
        body: `Lead stage is currently ${formatAccountTimelineLabel(lead.stage)}.`,
        metadata: {
          leadSubmissionId: lead.id,
          stage: lead.stage
        },
        occurredAt: lead.updatedAt
      });
    }
  }

  return events;
}

export function buildProvisioningTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  provisioningRequest:
    | {
        id: string;
        sourceSystem: string;
        status: ProvisioningStatus;
        planCode: string | null;
        crmDealId: string | null;
        createdAt: Date;
        processedAt: Date | null;
        failedAt: Date | null;
        lastError: string | null;
      }
    | null
    | undefined;
}) {
  const request = input.provisioningRequest;
  if (!request) {
    return [];
  }

  const events: SyncCandidateEvent[] = [
    {
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: request.sourceSystem,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      category: CustomerAccountTimelineCategory.SALES,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "sales.provisioning_received",
      eventKey: `timeline:provisioning.received:${request.id}`,
      sourceRecordType: "provisioningRequest",
      sourceRecordId: request.id,
      title: "Customer provisioning requested",
      body: truncateText(
        `Plan ${request.planCode ?? "not set"}${request.crmDealId ? ` | CRM deal ${request.crmDealId}` : ""}`,
        240
      ),
      metadata: {
        provisioningRequestId: request.id,
        planCode: request.planCode,
        crmDealId: request.crmDealId
      },
      occurredAt: request.createdAt
    }
  ];

  if (request.status === ProvisioningStatus.PROVISIONED && request.processedAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: request.sourceSystem,
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      category: CustomerAccountTimelineCategory.ONBOARDING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "onboarding.provisioned",
      eventKey: `timeline:provisioning.provisioned:${request.id}`,
      sourceRecordType: "provisioningRequest",
      sourceRecordId: request.id,
      title: "Workspace provisioned",
      body: "Customer workspace was created successfully.",
      metadata: {
        provisioningRequestId: request.id,
        status: request.status
      },
      occurredAt: request.processedAt
    });
  }

  if (request.status === ProvisioningStatus.FAILED && request.failedAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: request.sourceSystem,
      entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
      category: CustomerAccountTimelineCategory.SYSTEM,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "system.provisioning_failed",
      eventKey: `timeline:provisioning.failed:${request.id}`,
      sourceRecordType: "provisioningRequest",
      sourceRecordId: request.id,
      title: "Workspace provisioning failed",
      body: truncateText(request.lastError ?? "Provisioning failed and needs operator review.", 280),
      severity: CustomerAccountTimelineSeverity.WARNING,
      occurredAt: request.failedAt
    });
  }

  return events;
}

export function buildOrganizationTimelineEvents(input: {
  customerAccountId: string;
  organization:
    | {
        id: string;
        name: string;
        createdAt: Date;
        onboardingCompletedAt: Date | null;
      }
    | null
    | undefined;
}) {
  if (!input.organization) {
    return [];
  }

  const events: SyncCandidateEvent[] = [
    {
      customerAccountId: input.customerAccountId,
      organizationId: input.organization.id,
      actorType: AuditActorType.SYSTEM,
      actorLabel: input.organization.name,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      category: CustomerAccountTimelineCategory.ONBOARDING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "onboarding.organization_created",
      eventKey: `timeline:organization.created:${input.organization.id}`,
      sourceRecordType: "organization",
      sourceRecordId: input.organization.id,
      title: "Organization created",
      body: "Customer workspace exists and can now move into onboarding.",
      occurredAt: input.organization.createdAt
    }
  ];

  if (input.organization.onboardingCompletedAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organization.id,
      actorType: AuditActorType.SYSTEM,
      actorLabel: input.organization.name,
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      category: CustomerAccountTimelineCategory.ONBOARDING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "onboarding.completed",
      eventKey: `timeline:onboarding.completed:${input.organization.id}`,
      sourceRecordType: "organization",
      sourceRecordId: input.organization.id,
      title: "Onboarding completed",
      body: "Workspace onboarding milestones are complete.",
      occurredAt: input.organization.onboardingCompletedAt
    });
  }

  return events;
}

export function buildSubscriptionTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  subscriptions: Array<{
    id: string;
    status: SubscriptionStatus;
    accessState: string;
    planCodeSnapshot: string | null;
    currentPeriodEnd: Date | null;
    cancelScheduledAt: Date | null;
    canceledAt: Date | null;
    endedAt: Date | null;
    reactivatedAt: Date | null;
    lastInvoicePaidAt: Date | null;
    lastPaymentFailedAt: Date | null;
    lastPaymentFailureMessage: string | null;
    createdAt: Date;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const subscription of input.subscriptions) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: subscription.planCodeSnapshot ?? "billing",
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      category: CustomerAccountTimelineCategory.BILLING,
      sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
      eventCode: "billing.subscription_started",
      eventKey: `timeline:subscription.started:${subscription.id}`,
      sourceRecordType: "subscription",
      sourceRecordId: subscription.id,
      title: "Subscription started",
      body: truncateText(
        `${subscription.planCodeSnapshot ?? "Plan pending"} | ${formatAccountTimelineLabel(subscription.status)} | ${formatAccountTimelineLabel(subscription.accessState)}`,
        240
      ),
      metadata: {
        subscriptionId: subscription.id,
        planCode: subscription.planCodeSnapshot,
        status: subscription.status,
        accessState: subscription.accessState
      },
      occurredAt: subscription.createdAt
    });

    if (subscription.lastInvoicePaidAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: subscription.planCodeSnapshot ?? "billing",
        entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
        category: CustomerAccountTimelineCategory.BILLING,
        sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
        eventCode: "billing.payment_received",
        eventKey: `timeline:subscription.payment_received:${subscription.id}:${buildStableTimestampSuffix(subscription.lastInvoicePaidAt, "paid")}`,
        sourceRecordType: "subscription",
        sourceRecordId: subscription.id,
        title: "Payment received",
        body: subscription.currentPeriodEnd
          ? `Current access period ends ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}.`
          : "Stripe marked the latest invoice as paid.",
        occurredAt: subscription.lastInvoicePaidAt
      });
    }

    if (subscription.lastPaymentFailedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: subscription.planCodeSnapshot ?? "billing",
        entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
        category: CustomerAccountTimelineCategory.BILLING,
        sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
        eventCode: "billing.payment_failed",
        eventKey: `timeline:subscription.payment_failed:${subscription.id}:${buildStableTimestampSuffix(subscription.lastPaymentFailedAt, "failed")}`,
        sourceRecordType: "subscription",
        sourceRecordId: subscription.id,
        title: "Payment failed",
        body: truncateText(
          subscription.lastPaymentFailureMessage ?? "Stripe reported a failed payment that may affect access.",
          280
        ),
        severity: CustomerAccountTimelineSeverity.WARNING,
        occurredAt: subscription.lastPaymentFailedAt
      });
    }

    if (subscription.cancelScheduledAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: subscription.planCodeSnapshot ?? "billing",
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.RETENTION,
        sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
        eventCode: "retention.cancellation_scheduled",
        eventKey: `timeline:subscription.cancellation_scheduled:${subscription.id}:${buildStableTimestampSuffix(subscription.cancelScheduledAt, "cancel")}`,
        sourceRecordType: "subscription",
        sourceRecordId: subscription.id,
        title: "Cancellation scheduled",
        body: subscription.currentPeriodEnd
          ? `Access is scheduled to end ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}.`
          : "Stripe marked this subscription to cancel.",
        severity: CustomerAccountTimelineSeverity.WARNING,
        occurredAt: subscription.cancelScheduledAt
      });
    }

    if (subscription.reactivatedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: subscription.planCodeSnapshot ?? "billing",
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.RETENTION,
        sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
        eventCode: "retention.subscription_reactivated",
        eventKey: `timeline:subscription.reactivated:${subscription.id}:${buildStableTimestampSuffix(subscription.reactivatedAt, "reactivated")}`,
        sourceRecordType: "subscription",
        sourceRecordId: subscription.id,
        title: "Subscription reactivated",
        body: "Billing access returned to an active state.",
        occurredAt: subscription.reactivatedAt
      });
    }

    const endedAt = subscription.endedAt ?? subscription.canceledAt;
    if (endedAt && subscription.status === SubscriptionStatus.CANCELED) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: subscription.planCodeSnapshot ?? "billing",
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.RETENTION,
        sourceSystem: CustomerAccountTimelineSourceSystem.STRIPE,
        eventCode: "retention.subscription_ended",
        eventKey: `timeline:subscription.ended:${subscription.id}:${buildStableTimestampSuffix(endedAt, "ended")}`,
        sourceRecordType: "subscription",
        sourceRecordId: subscription.id,
        title: "Subscription ended",
        body: "Recurring billing access is no longer active.",
        severity: CustomerAccountTimelineSeverity.WARNING,
        occurredAt: endedAt
      });
    }
  }

  return events;
}

export function buildAssessmentTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  assessments: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    submittedAt: Date | null;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const assessment of input.assessments) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: assessment.name,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      category: CustomerAccountTimelineCategory.ONBOARDING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "onboarding.intake_started",
      eventKey: `timeline:assessment.created:${assessment.id}`,
      sourceRecordType: "assessment",
      sourceRecordId: assessment.id,
      title: "Assessment intake started",
      body: `${assessment.name} was created for customer intake.`,
      metadata: {
        assessmentId: assessment.id,
        status: assessment.status
      },
      occurredAt: assessment.createdAt
    });

    if (assessment.submittedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: assessment.name,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.ACTIVATION,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "activation.intake_completed",
        eventKey: `timeline:assessment.submitted:${assessment.id}`,
        sourceRecordType: "assessment",
        sourceRecordId: assessment.id,
        title: "Assessment intake completed",
        body: `${assessment.name} was submitted for processing.`,
        metadata: {
          assessmentId: assessment.id
        },
        occurredAt: assessment.submittedAt
      });
    }
  }

  return events;
}

export function buildReportTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  reports: Array<{
    id: string;
    title: string;
    assessmentId: string;
    versionLabel: string;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return input.reports.map((report) => ({
    customerAccountId: input.customerAccountId,
    organizationId: input.organizationId ?? null,
    actorType: AuditActorType.SYSTEM,
    actorLabel: report.title,
    entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
    category: CustomerAccountTimelineCategory.DELIVERY,
    sourceSystem: CustomerAccountTimelineSourceSystem.APP,
    eventCode: "delivery.report_generated",
    eventKey: `timeline:report.generated:${report.id}`,
    sourceRecordType: "report",
    sourceRecordId: report.id,
    title: "Report generated",
    body: `${report.title} (${report.versionLabel}) is available for delivery.`,
    metadata: {
      reportId: report.id,
      assessmentId: report.assessmentId,
      versionLabel: report.versionLabel
    },
    occurredAt: report.publishedAt ?? report.createdAt
  }));
}

export function buildReportPackageTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  packages: Array<{
    id: string;
    title: string;
    latestReportId: string | null;
    assessmentId: string;
    requiresFounderReview: boolean;
    founderReviewReason: string | null;
    reviewedAt: Date | null;
    sentAt: Date | null;
    briefingBookedAt: Date | null;
    briefingCompletedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const reportPackage of input.packages) {
    if (reportPackage.requiresFounderReview) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: reportPackage.title,
        entryType: CustomerAccountTimelineEntryType.ESCALATION_UPDATED,
        category: CustomerAccountTimelineCategory.RISK,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "risk.founder_review_required",
        eventKey: `timeline:report_package.founder_review_required:${reportPackage.id}`,
        sourceRecordType: "reportPackage",
        sourceRecordId: reportPackage.id,
        title: "Founder review required",
        body: truncateText(
          reportPackage.founderReviewReason ?? "Delivery requires elevated review before send.",
          280
        ),
        severity: CustomerAccountTimelineSeverity.WARNING,
        occurredAt: reportPackage.createdAt
      });
    }

    if (reportPackage.reviewedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: reportPackage.title,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.DELIVERY,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "delivery.package_reviewed",
        eventKey: `timeline:report_package.reviewed:${reportPackage.id}`,
        sourceRecordType: "reportPackage",
        sourceRecordId: reportPackage.id,
        title: "Executive package reviewed",
        body: "Internal QA review completed for the executive delivery package.",
        metadata: {
          reportPackageId: reportPackage.id,
          reportId: reportPackage.latestReportId,
          assessmentId: reportPackage.assessmentId
        },
        occurredAt: reportPackage.reviewedAt
      });
    }

    if (reportPackage.sentAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: reportPackage.title,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.DELIVERY,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "delivery.package_sent",
        eventKey: `timeline:report_package.sent:${reportPackage.id}`,
        sourceRecordType: "reportPackage",
        sourceRecordId: reportPackage.id,
        title: "Executive package sent",
        body: "The client-facing executive delivery package was marked as sent.",
        occurredAt: reportPackage.sentAt
      });
    }

    if (reportPackage.briefingBookedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: reportPackage.title,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.ACTIVATION,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "activation.briefing_booked",
        eventKey: `timeline:report_package.briefing_booked:${reportPackage.id}`,
        sourceRecordType: "reportPackage",
        sourceRecordId: reportPackage.id,
        title: "Briefing booked",
        body: "An executive readout briefing was scheduled.",
        occurredAt: reportPackage.briefingBookedAt
      });
    }

    if (reportPackage.briefingCompletedAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: reportPackage.title,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        category: CustomerAccountTimelineCategory.MONITORING,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "monitoring.briefing_completed",
        eventKey: `timeline:report_package.briefing_completed:${reportPackage.id}`,
        sourceRecordType: "reportPackage",
        sourceRecordId: reportPackage.id,
        title: "Briefing completed",
        body: "The executive briefing was completed and the account is ready for ongoing follow-up.",
        occurredAt: reportPackage.briefingCompletedAt
      });
    }
  }

  return events;
}

export function buildMonitoringTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  monitoringSubscription:
    | {
        id: string;
        status: MonitoringSubscriptionStatus;
        currentPostureScore: number | null;
        currentRiskLevel: string | null;
        activatedAt: Date | null;
        pausedAt: Date | null;
        canceledAt: Date | null;
      }
    | null
    | undefined;
  monitoringRiskSnapshots: Array<{
    id: string;
    postureScore: number | null;
    riskLevel: string | null;
    criticalFindingsCount: number;
    openFindingsCount: number;
    recordedAt: Date;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];
  const subscription = input.monitoringSubscription;

  if (subscription?.activatedAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "Monitoring",
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      category: CustomerAccountTimelineCategory.MONITORING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "monitoring.activated",
      eventKey: `timeline:monitoring.activated:${subscription.id}`,
      sourceRecordType: "monitoringSubscription",
      sourceRecordId: subscription.id,
      title: "Ongoing monitoring activated",
      body: subscription.currentRiskLevel
        ? `Current risk level ${subscription.currentRiskLevel}.`
        : "Recurring monitoring is active for this account.",
      occurredAt: subscription.activatedAt
    });
  }

  if (subscription?.pausedAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "Monitoring",
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      category: CustomerAccountTimelineCategory.RETENTION,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "retention.monitoring_paused",
      eventKey: `timeline:monitoring.paused:${subscription.id}:${buildStableTimestampSuffix(subscription.pausedAt, "paused")}`,
      sourceRecordType: "monitoringSubscription",
      sourceRecordId: subscription.id,
      title: "Monitoring paused",
      body: "Recurring monitoring is currently paused.",
      severity: CustomerAccountTimelineSeverity.WARNING,
      occurredAt: subscription.pausedAt
    });
  }

  if (subscription?.canceledAt) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "Monitoring",
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      category: CustomerAccountTimelineCategory.RETENTION,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "retention.monitoring_canceled",
      eventKey: `timeline:monitoring.canceled:${subscription.id}:${buildStableTimestampSuffix(subscription.canceledAt, "canceled")}`,
      sourceRecordType: "monitoringSubscription",
      sourceRecordId: subscription.id,
      title: "Monitoring canceled",
      body: "Recurring monitoring is no longer active.",
      severity: CustomerAccountTimelineSeverity.WARNING,
      occurredAt: subscription.canceledAt
    });
  }

  for (const snapshot of input.monitoringRiskSnapshots) {
    const normalizedRiskLevel = snapshot.riskLevel?.trim().toLowerCase();
    if (
      snapshot.criticalFindingsCount > 0 ||
      normalizedRiskLevel === "high" ||
      (snapshot.postureScore ?? 101) <= 55
    ) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "Monitoring",
        entryType: CustomerAccountTimelineEntryType.ESCALATION_UPDATED,
        category: CustomerAccountTimelineCategory.RISK,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "risk.monitoring_alert",
        eventKey: `timeline:monitoring.risk_snapshot:${snapshot.id}`,
        sourceRecordType: "monitoringRiskSnapshot",
        sourceRecordId: snapshot.id,
        title: "Elevated risk posture recorded",
        body: truncateText(
          `${snapshot.riskLevel ?? "Unscored"} risk | posture ${snapshot.postureScore ?? "n/a"} | ${snapshot.openFindingsCount} open findings`,
          220
        ),
        severity:
          snapshot.criticalFindingsCount > 0
            ? CustomerAccountTimelineSeverity.CRITICAL
            : CustomerAccountTimelineSeverity.WARNING,
        occurredAt: snapshot.recordedAt
      });
    }
  }

  return events;
}

export function buildUsageQuotaTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  usageMeters: Array<{
    id: string;
    meterKey: string;
    usedQuantity: number;
    limitQuantity: number | null;
    periodStart: Date;
    periodEnd: Date;
    lastEventAt: Date | null;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const meter of input.usageMeters) {
    if (meter.limitQuantity === null || meter.usedQuantity < meter.limitQuantity) {
      continue;
    }

    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "Quota enforcement",
      entryType: CustomerAccountTimelineEntryType.ESCALATION_UPDATED,
      category: CustomerAccountTimelineCategory.BILLING,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "billing.quota_exceeded",
      eventKey: `timeline:usage_meter.exceeded:${meter.id}:${meter.periodStart.toISOString()}`,
      sourceRecordType: "usageMeter",
      sourceRecordId: meter.id,
      title: "Quota exceeded",
      body: `${formatAccountTimelineLabel(meter.meterKey)} reached ${meter.usedQuantity} of ${meter.limitQuantity} for the current monthly window.`,
      metadata: {
        meterKey: meter.meterKey,
        usedQuantity: meter.usedQuantity,
        limitQuantity: meter.limitQuantity,
        periodStart: meter.periodStart.toISOString(),
        periodEnd: meter.periodEnd.toISOString()
      },
      severity: CustomerAccountTimelineSeverity.WARNING,
      occurredAt: meter.lastEventAt ?? meter.periodEnd
    });
  }

  return events;
}

export function buildCustomerRunTimelineEvents(input: {
  customerAccountId: string;
  organizationId?: string | null;
  runs: Array<{
    id: string;
    currentStep: string;
    status: CustomerRunStatus;
    source: string;
    startedAt: Date;
    completedAt: Date | null;
    lastRecoveredAt: Date | null;
    lastRecoveryNote: string | null;
    recoveryHint: string | null;
    lastError: string | null;
  }>;
}) {
  const events: SyncCandidateEvent[] = [];

  for (const run of input.runs) {
    events.push({
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      actorType: AuditActorType.SYSTEM,
      actorLabel: run.source,
      entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
      category: CustomerAccountTimelineCategory.SYSTEM,
      sourceSystem: CustomerAccountTimelineSourceSystem.APP,
      eventCode: "system.customer_run_started",
      eventKey: `timeline:customer_run.started:${run.id}`,
      sourceRecordType: "customerRun",
      sourceRecordId: run.id,
      title: "Customer workflow started",
      body: `Current step ${formatAccountTimelineLabel(run.currentStep)}.`,
      occurredAt: run.startedAt
    });

    if (run.status === CustomerRunStatus.ACTION_REQUIRED || run.status === CustomerRunStatus.FAILED) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: run.source,
        entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
        category: CustomerAccountTimelineCategory.SYSTEM,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "system.customer_run_failed",
        eventKey: `timeline:customer_run.failed:${run.id}:${run.status}`,
        sourceRecordType: "customerRun",
        sourceRecordId: run.id,
        title: "Customer workflow needs recovery",
        body: truncateText(run.lastError ?? run.recoveryHint ?? "Workflow needs operator intervention.", 280),
        severity: CustomerAccountTimelineSeverity.WARNING,
        occurredAt: run.completedAt ?? run.lastRecoveredAt ?? run.startedAt
      });
    }

    if (run.lastRecoveredAt) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.ADMIN,
        actorLabel: "Operator",
        entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
        category: CustomerAccountTimelineCategory.SUPPORT,
        sourceSystem: CustomerAccountTimelineSourceSystem.MANUAL,
        eventCode: "support.customer_run_retried",
        eventKey: `timeline:customer_run.recovered:${run.id}:${buildStableTimestampSuffix(run.lastRecoveredAt, "recovered")}`,
        sourceRecordType: "customerRun",
        sourceRecordId: run.id,
        title: "Operator retried customer workflow",
        body: truncateText(run.lastRecoveryNote ?? "A manual recovery was performed.", 280),
        occurredAt: run.lastRecoveredAt
      });
    }

    if (run.completedAt && run.status === CustomerRunStatus.COMPLETED) {
      events.push({
        customerAccountId: input.customerAccountId,
        organizationId: input.organizationId ?? null,
        actorType: AuditActorType.SYSTEM,
        actorLabel: run.source,
        entryType: CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED,
        category: CustomerAccountTimelineCategory.DELIVERY,
        sourceSystem: CustomerAccountTimelineSourceSystem.APP,
        eventCode: "delivery.customer_run_completed",
        eventKey: `timeline:customer_run.completed:${run.id}`,
        sourceRecordType: "customerRun",
        sourceRecordId: run.id,
        title: "Customer workflow completed",
        body: `Finished at ${formatAccountTimelineLabel(run.currentStep)}.`,
        occurredAt: run.completedAt
      });
    }
  }

  return events;
}

export async function synchronizeCustomerAccountTimeline(
  customerAccountId: string,
  db: AccountTimelineDbClient = prisma
) {
  const account = await db.customerAccount.findUnique({
    where: { id: customerAccountId },
    include: {
      primaryLeadSubmission: {
        select: {
          id: true,
          email: true,
          source: true,
          intent: true,
          stage: true,
          sourcePath: true,
          requestedPlanCode: true,
          pricingContext: true,
          submittedAt: true,
          updatedAt: true
        }
      },
      primaryProvisioningRequest: {
        select: {
          id: true,
          sourceSystem: true,
          status: true,
          planCode: true,
          crmDealId: true,
          createdAt: true,
          processedAt: true,
          failedAt: true,
          lastError: true
        }
      },
      organization: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          onboardingCompletedAt: true,
          leadSubmissions: {
            orderBy: { submittedAt: "asc" },
            select: {
              id: true,
              email: true,
              source: true,
              intent: true,
              stage: true,
              sourcePath: true,
              requestedPlanCode: true,
              pricingContext: true,
              submittedAt: true,
              updatedAt: true
            }
          },
          subscriptions: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              status: true,
              accessState: true,
              planCodeSnapshot: true,
              currentPeriodEnd: true,
              cancelScheduledAt: true,
              canceledAt: true,
              endedAt: true,
              reactivatedAt: true,
              lastInvoicePaidAt: true,
              lastPaymentFailedAt: true,
              lastPaymentFailureMessage: true,
              createdAt: true
            }
          },
          assessments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
              submittedAt: true
            }
          },
          reports: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              assessmentId: true,
              versionLabel: true,
              publishedAt: true,
              createdAt: true
            }
          },
          reportPackages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              latestReportId: true,
              assessmentId: true,
              requiresFounderReview: true,
              founderReviewReason: true,
              reviewedAt: true,
              sentAt: true,
              briefingBookedAt: true,
              briefingCompletedAt: true,
              createdAt: true
            }
          },
          monitoringSubscription: {
            select: {
              id: true,
              status: true,
              currentPostureScore: true,
              currentRiskLevel: true,
              activatedAt: true,
              pausedAt: true,
              canceledAt: true
            }
          },
          monitoringRiskSnapshots: {
            orderBy: { recordedAt: "asc" },
            take: 24,
            select: {
              id: true,
              postureScore: true,
              riskLevel: true,
              criticalFindingsCount: true,
              openFindingsCount: true,
              recordedAt: true
            }
          },
          usageMeters: {
            orderBy: { periodStart: "asc" },
            take: 24,
            select: {
              id: true,
              meterKey: true,
              usedQuantity: true,
              limitQuantity: true,
              periodStart: true,
              periodEnd: true,
              lastEventAt: true
            }
          },
          customerRuns: {
            orderBy: { startedAt: "asc" },
            take: 40,
            select: {
              id: true,
              currentStep: true,
              status: true,
              source: true,
              startedAt: true,
              completedAt: true,
              lastRecoveredAt: true,
              lastRecoveryNote: true,
              recoveryHint: true,
              lastError: true
            }
          }
        }
      }
    }
  });

  if (!account) {
    return null;
  }

  const organizationId = account.organizationId ?? account.organization?.id ?? null;
  const leadMap = new Map<
    string,
    {
      id: string;
      email: string;
      source: string;
      intent: string | null;
      stage: LeadSubmissionStatus;
      sourcePath: string | null;
      requestedPlanCode: string | null;
      pricingContext: string | null;
      submittedAt: Date;
      updatedAt: Date;
    }
  >();
  for (const lead of account.organization?.leadSubmissions ?? []) {
    leadMap.set(lead.id, lead);
  }
  if (account.primaryLeadSubmission) {
    leadMap.set(account.primaryLeadSubmission.id, account.primaryLeadSubmission);
  }

  const candidates: SyncCandidateEvent[] = [];
  candidates.push(
    ...buildLeadTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      leads: Array.from(leadMap.values())
    }),
    ...buildProvisioningTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      provisioningRequest: account.primaryProvisioningRequest
    }),
    ...buildOrganizationTimelineEvents({
      customerAccountId: account.id,
      organization: account.organization
    }),
    ...buildSubscriptionTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      subscriptions: account.organization?.subscriptions ?? []
    }),
    ...buildAssessmentTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      assessments: account.organization?.assessments ?? []
    }),
    ...buildReportTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      reports: account.organization?.reports ?? []
    }),
    ...buildReportPackageTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      packages: account.organization?.reportPackages ?? []
    }),
    ...buildMonitoringTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      monitoringSubscription: account.organization?.monitoringSubscription,
      monitoringRiskSnapshots: account.organization?.monitoringRiskSnapshots ?? []
    }),
    ...buildUsageQuotaTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      usageMeters: account.organization?.usageMeters ?? []
    }),
    ...buildCustomerRunTimelineEvents({
      customerAccountId: account.id,
      organizationId,
      runs: account.organization?.customerRuns ?? []
    })
  );

  for (const candidate of candidates) {
    await recordCustomerAccountTimelineEvent(db, candidate);
  }

  return {
    customerAccountId: account.id,
    synchronizedCount: candidates.length
  };
}
