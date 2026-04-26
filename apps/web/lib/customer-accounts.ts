import {
  AuditActorType,
  CustomerAccountTimelineCategory,
  CustomerAccountStageSource,
  CustomerAccountTimelineEntryType,
  CustomerLifecycleStage,
  CustomerRunStatus,
  CustomerRunStep,
  LeadSubmissionStatus,
  Prisma,
  ProvisioningStatus,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  prisma
} from "@evolve-edge/db";
import { publishDomainEvent } from "./domain-events";
import { requireActiveOrganization } from "./org-scope";
import { getPrimaryOwnerMembership } from "./roles";
import {
  recordCustomerAccountTimelineEvent,
  synchronizeCustomerAccountTimeline
} from "./account-timeline";

type CustomerAccountDbClient = Prisma.TransactionClient | typeof prisma;

async function requireActiveCustomerAccountOrganization(
  organizationId: string | null | undefined,
  db: CustomerAccountDbClient
) {
  if (!organizationId) {
    return null;
  }

  return requireActiveOrganization(organizationId, db);
}

export const CUSTOMER_LIFECYCLE_STAGE_ORDER = [
  CustomerLifecycleStage.LEAD,
  CustomerLifecycleStage.QUALIFIED,
  CustomerLifecycleStage.PROPOSAL_SENT,
  CustomerLifecycleStage.WON,
  CustomerLifecycleStage.ONBOARDING,
  CustomerLifecycleStage.INTAKE_PENDING,
  CustomerLifecycleStage.INTAKE_COMPLETE,
  CustomerLifecycleStage.AUDIT_PROCESSING,
  CustomerLifecycleStage.REPORT_READY,
  CustomerLifecycleStage.BRIEFING_SCHEDULED,
  CustomerLifecycleStage.MONITORING_ACTIVE
] as const;

type CustomerLifecycleStageValue = (typeof CUSTOMER_LIFECYCLE_STAGE_ORDER)[number];

type LifecycleSignalInput = {
  currentStage?: CustomerLifecycleStage | null;
  leadStage?: LeadSubmissionStatus | null;
  provisioningStatus?: ProvisioningStatus | null;
  organizationExists?: boolean;
  hasAssessment?: boolean;
  intakeComplete?: boolean;
  auditProcessing?: boolean;
  reportReady?: boolean;
  briefingScheduled?: boolean;
  monitoringActive?: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeCompanyName(companyName: string | null | undefined) {
  return companyName?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";
}

export function buildCustomerAccountDedupeKey(input: {
  email: string;
  companyName?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedCompanyName = normalizeCompanyName(input.companyName);
  return normalizedCompanyName
    ? `${normalizedEmail}:${normalizedCompanyName}`
    : normalizedEmail;
}

export function formatCustomerLifecycleStage(stage: CustomerLifecycleStage) {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCustomerAccountQueueLabel(queue: OperatorCustomerQueueFilter) {
  switch (queue) {
    case "action_required":
      return "Action required";
    case "delivery_review":
      return "Delivery review";
    case "follow_up":
      return "Follow up";
    case "founder_review":
      return "Founder review";
    default:
      return "All accounts";
  }
}

export type OperatorCustomerQueueFilter =
  | "all"
  | "follow_up"
  | "founder_review"
  | "action_required"
  | "delivery_review";

export function getCustomerLifecycleStageRank(stage: CustomerLifecycleStage | null | undefined) {
  if (!stage) {
    return -1;
  }

  return CUSTOMER_LIFECYCLE_STAGE_ORDER.indexOf(stage as CustomerLifecycleStageValue);
}

export function getLaterCustomerLifecycleStage(
  currentStage: CustomerLifecycleStage | null | undefined,
  candidateStage: CustomerLifecycleStage
) {
  return getCustomerLifecycleStageRank(candidateStage) >
    getCustomerLifecycleStageRank(currentStage)
    ? candidateStage
    : (currentStage ?? candidateStage);
}

export function mapLeadStageToCustomerLifecycleStage(
  stage: LeadSubmissionStatus | null | undefined
) {
  switch (stage) {
    case LeadSubmissionStatus.QUALIFIED:
      return CustomerLifecycleStage.QUALIFIED;
    case LeadSubmissionStatus.CONVERTED:
      return CustomerLifecycleStage.WON;
    case LeadSubmissionStatus.CAPTURED:
    case LeadSubmissionStatus.FAILED:
    default:
      return CustomerLifecycleStage.LEAD;
  }
}

export function resolveSuggestedCustomerLifecycleStage(
  input: LifecycleSignalInput
): CustomerLifecycleStage {
  let candidate: CustomerLifecycleStage = mapLeadStageToCustomerLifecycleStage(
    input.leadStage ?? null
  );

  if (input.provisioningStatus === ProvisioningStatus.PROVISIONED) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.WON);
  }

  if (input.organizationExists) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.ONBOARDING);
  }

  if (input.hasAssessment) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.INTAKE_PENDING);
  }

  if (input.intakeComplete) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.INTAKE_COMPLETE);
  }

  if (input.auditProcessing) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.AUDIT_PROCESSING);
  }

  if (input.reportReady) {
    candidate = getLaterCustomerLifecycleStage(candidate, CustomerLifecycleStage.REPORT_READY);
  }

  if (input.briefingScheduled) {
    candidate = getLaterCustomerLifecycleStage(
      candidate,
      CustomerLifecycleStage.BRIEFING_SCHEDULED
    );
  }

  if (input.monitoringActive) {
    candidate = getLaterCustomerLifecycleStage(
      candidate,
      CustomerLifecycleStage.MONITORING_ACTIVE
    );
  }

  return getLaterCustomerLifecycleStage(input.currentStage, candidate);
}

function isIntakeComplete(
  assessment:
    | {
        submittedAt?: Date | null;
        sections?: Array<{
          status: string;
          completedAt: Date | null;
        }>;
      }
    | null
    | undefined
) {
  if (!assessment) {
    return false;
  }

  if (assessment.submittedAt) {
    return true;
  }

  if (!assessment.sections || assessment.sections.length === 0) {
    return false;
  }

  return assessment.sections.every((section) => {
    const normalizedStatus = section.status.trim().toLowerCase();
    return (
      normalizedStatus === "completed" ||
      normalizedStatus === "complete" ||
      normalizedStatus === "done" ||
      section.completedAt instanceof Date
    );
  });
}

function isAuditProcessing(
  customerRun:
    | {
        status: CustomerRunStatus;
        currentStep: CustomerRunStep;
      }
    | null
    | undefined
) {
  if (!customerRun) {
    return false;
  }

  if (
    customerRun.status === CustomerRunStatus.PENDING ||
    customerRun.status === CustomerRunStatus.RUNNING ||
    customerRun.status === CustomerRunStatus.ACTION_REQUIRED
  ) {
    return (
      customerRun.currentStep === CustomerRunStep.ANALYSIS ||
      customerRun.currentStep === CustomerRunStep.REPORT_GENERATION ||
      customerRun.currentStep === CustomerRunStep.CRM_SYNC ||
      customerRun.currentStep === CustomerRunStep.DELIVERY
    );
  }

  return false;
}

async function appendTimelineEntry(
  db: CustomerAccountDbClient,
  input: {
    customerAccountId: string;
    organizationId?: string | null;
    actorUserId?: string | null;
    actorType?: AuditActorType;
    actorLabel?: string | null;
    entryType: CustomerAccountTimelineEntryType;
    category?: CustomerAccountTimelineCategory;
    title: string;
    eventCode?: string;
    eventKey?: string | null;
    body?: string | null;
    metadata?: Prisma.InputJsonValue | null;
    sourceRecordType?: string | null;
    sourceRecordId?: string | null;
    occurredAt?: Date | null;
  }
) {
  const category =
    input.category ??
    (input.entryType === CustomerAccountTimelineEntryType.NOTE_ADDED ||
    input.entryType === CustomerAccountTimelineEntryType.TASK_UPDATED
      ? CustomerAccountTimelineCategory.SUPPORT
      : input.entryType === CustomerAccountTimelineEntryType.ESCALATION_UPDATED
        ? CustomerAccountTimelineCategory.RISK
        : input.entryType === CustomerAccountTimelineEntryType.CRM_SYNC ||
            input.entryType === CustomerAccountTimelineEntryType.STATUS_CHANGED
          ? CustomerAccountTimelineCategory.SALES
          : CustomerAccountTimelineCategory.SYSTEM);

  const eventCode =
    input.eventCode ??
    (input.entryType === CustomerAccountTimelineEntryType.NOTE_ADDED
      ? "support.note_added"
      : input.entryType === CustomerAccountTimelineEntryType.TASK_UPDATED
        ? "support.follow_up_updated"
        : input.entryType === CustomerAccountTimelineEntryType.ESCALATION_UPDATED
          ? "risk.escalation_updated"
          : input.entryType === CustomerAccountTimelineEntryType.CRM_SYNC
            ? "sales.crm_sync_requested"
            : input.entryType === CustomerAccountTimelineEntryType.STATUS_CHANGED
              ? "sales.lifecycle_changed"
              : input.entryType === CustomerAccountTimelineEntryType.WORKFLOW_TRIGGERED
                ? "system.workflow_triggered"
                : "system.sync");

  return recordCustomerAccountTimelineEvent(db, {
    customerAccountId: input.customerAccountId,
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? null,
    entryType: input.entryType,
    category,
    title: input.title,
    eventCode,
    eventKey: input.eventKey ?? null,
    body: input.body ?? null,
    metadata: input.metadata ?? undefined,
    sourceRecordType: input.sourceRecordType ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    occurredAt: input.occurredAt ?? null
  });
}

async function publishCustomerAccountStageEvent(
  db: CustomerAccountDbClient,
  input: {
    customerAccountId: string;
    organizationId?: string | null;
    userId?: string | null;
    stage: CustomerLifecycleStage;
    stageSource: CustomerAccountStageSource;
    primaryContactEmail: string;
    companyName?: string | null;
    crmCompanyId?: string | null;
    crmDealId?: string | null;
    nextActionLabel?: string | null;
    reason?: string | null;
    idempotencySuffix?: string;
  }
) {
  return publishDomainEvent(db, {
    type: "customer_account.stage_changed",
    aggregateType: "customerAccount",
    aggregateId: input.customerAccountId,
    orgId: input.organizationId ?? null,
    userId: input.userId ?? null,
    idempotencyKey: `customer_account.stage_changed:${input.customerAccountId}:${input.stage}:${input.idempotencySuffix ?? Date.now().toString()}`,
    payload: {
      customerAccountId: input.customerAccountId,
      organizationId: input.organizationId ?? null,
      stage: input.stage,
      stageLabel: formatCustomerLifecycleStage(input.stage),
      stageSource: input.stageSource,
      primaryContactEmail: input.primaryContactEmail,
      companyName: input.companyName ?? null,
      crmCompanyId: input.crmCompanyId ?? null,
      crmDealId: input.crmDealId ?? null,
      nextActionLabel: input.nextActionLabel ?? null,
      reason: input.reason ?? null
    } satisfies Prisma.InputJsonValue
  });
}

async function findExistingCustomerAccount(
  db: CustomerAccountDbClient,
  input: {
    organizationId?: string | null;
    dedupeKey: string;
  }
) {
  if (input.organizationId) {
    const byOrganization = await db.customerAccount.findUnique({
      where: { organizationId: input.organizationId }
    });

    if (byOrganization) {
      return byOrganization;
    }
  }

  return db.customerAccount.findUnique({
    where: { dedupeKey: input.dedupeKey }
  });
}

export async function upsertCustomerAccountFromLead(
  input: {
    leadSubmissionId: string;
    db?: CustomerAccountDbClient;
  }
) {
  const db = input.db ?? prisma;
  const lead = await db.leadSubmission.findUnique({
    where: { id: input.leadSubmissionId },
    include: {
      organization: true
    }
  });

  if (!lead) {
    return null;
  }

  const dedupeKey = buildCustomerAccountDedupeKey({
    email: lead.email,
    companyName: lead.companyName
  });
  const existingAccount = await findExistingCustomerAccount(db, {
    organizationId: lead.organizationId,
    dedupeKey
  });
  const nextStage = resolveSuggestedCustomerLifecycleStage({
    currentStage: existingAccount?.lifecycleStage,
    leadStage: lead.stage,
    organizationExists: Boolean(lead.organizationId)
  });
  const nextStageSource =
    existingAccount &&
    existingAccount.stageSource === CustomerAccountStageSource.MANUAL &&
    getCustomerLifecycleStageRank(existingAccount.lifecycleStage) >=
      getCustomerLifecycleStageRank(nextStage)
      ? CustomerAccountStageSource.MANUAL
      : CustomerAccountStageSource.SYSTEM;

  const account = existingAccount
    ? await db.customerAccount.update({
        where: { id: existingAccount.id },
        data: {
          organizationId: lead.organizationId ?? existingAccount.organizationId,
          primaryLeadSubmissionId: lead.id,
          primaryContactEmail: lead.email,
          normalizedPrimaryContactEmail: lead.normalizedEmail,
          companyName: lead.companyName ?? existingAccount.companyName,
          lifecycleStage: nextStage,
          stageSource: nextStageSource,
          stageUpdatedAt:
            nextStage !== existingAccount.lifecycleStage ? new Date() : existingAccount.stageUpdatedAt,
          lastSystemSyncedAt: new Date()
        }
      })
    : await db.customerAccount.create({
        data: {
          organizationId: lead.organizationId ?? null,
          primaryLeadSubmissionId: lead.id,
          dedupeKey,
          primaryContactEmail: lead.email,
          normalizedPrimaryContactEmail: lead.normalizedEmail,
          companyName: lead.companyName ?? null,
          lifecycleStage: nextStage,
          stageSource: CustomerAccountStageSource.SYSTEM,
          stageUpdatedAt: new Date(),
          lastSystemSyncedAt: new Date(),
          crmCompanyId: lead.organization?.hubspotCompanyId ?? null
        }
      });

  if (!existingAccount) {
    await appendTimelineEntry(db, {
      customerAccountId: account.id,
      organizationId: account.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: lead.email,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      title: "Customer account created",
      body: "A durable operator account was created from the captured lead.",
      metadata: {
        leadSubmissionId: lead.id,
        source: lead.source
      }
    });

    await publishDomainEvent(db, {
      type: "customer_account.created",
      aggregateType: "customerAccount",
      aggregateId: account.id,
      orgId: account.organizationId ?? null,
      userId: lead.userId ?? null,
      idempotencyKey: `customer_account.created:${account.id}`,
      payload: {
        customerAccountId: account.id,
        leadSubmissionId: lead.id,
        organizationId: account.organizationId ?? null,
        stage: account.lifecycleStage,
        primaryContactEmail: account.primaryContactEmail,
        companyName: account.companyName ?? null
      } satisfies Prisma.InputJsonValue
    });
  }

  if (!existingAccount || existingAccount.lifecycleStage !== account.lifecycleStage) {
    await appendTimelineEntry(db, {
      customerAccountId: account.id,
      organizationId: account.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: lead.email,
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      title: `Lifecycle moved to ${formatCustomerLifecycleStage(account.lifecycleStage)}`,
      body: "Lead state advanced the customer lifecycle.",
      metadata: {
        fromStage: existingAccount?.lifecycleStage ?? null,
        toStage: account.lifecycleStage,
        leadSubmissionId: lead.id
      }
    });

    await publishCustomerAccountStageEvent(db, {
      customerAccountId: account.id,
      organizationId: account.organizationId,
      userId: lead.userId ?? null,
      stage: account.lifecycleStage,
      stageSource: account.stageSource,
      primaryContactEmail: account.primaryContactEmail,
      companyName: account.companyName,
      crmCompanyId: account.crmCompanyId,
      crmDealId: account.crmDealId,
      idempotencySuffix: lead.id
    });
  }

  return account;
}

export async function syncOrganizationCustomerAccount(
  organizationId: string,
  input?: {
    db?: CustomerAccountDbClient;
    actorUserId?: string | null;
    actorLabel?: string | null;
    reason?: string | null;
  }
) {
  const db = input?.db ?? prisma;
  await requireActiveOrganization(organizationId, db);
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        include: {
          user: true
        },
        orderBy: { createdAt: "asc" }
      },
      leadSubmissions: {
        orderBy: { submittedAt: "desc" },
        take: 1
      },
      provisioningRequests: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      assessments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          sections: true
        }
      },
      reports: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      customerRuns: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      customerAccount: true
    }
  });

  if (!organization) {
    return null;
  }

  const latestLead = organization.leadSubmissions[0] ?? null;
  const latestProvisioning = organization.provisioningRequests[0] ?? null;
  const latestAssessment = organization.assessments[0] ?? null;
  const latestReport = organization.reports[0] ?? null;
  const latestRun = organization.customerRuns[0] ?? null;
  const ownerMembership = getPrimaryOwnerMembership(organization.members);
  const primaryContactEmail =
    latestLead?.email ?? latestProvisioning?.primaryContactEmail ?? ownerMembership?.user.email;

  if (!primaryContactEmail) {
    return null;
  }

  const dedupeKey = buildCustomerAccountDedupeKey({
    email: primaryContactEmail,
    companyName: latestLead?.companyName ?? organization.name
  });
  const existingAccount =
    organization.customerAccount ??
    (await findExistingCustomerAccount(db, {
      organizationId,
      dedupeKey
    }));

  const nextStage = resolveSuggestedCustomerLifecycleStage({
    currentStage: existingAccount?.lifecycleStage,
    leadStage: latestLead?.stage ?? null,
    provisioningStatus: latestProvisioning?.status ?? null,
    organizationExists: true,
    hasAssessment: Boolean(latestAssessment),
    intakeComplete: isIntakeComplete(latestAssessment),
    auditProcessing: isAuditProcessing(latestRun) && !latestReport,
    reportReady: Boolean(latestReport),
    briefingScheduled:
      Boolean(existingAccount?.briefingScheduledAt) ||
      existingAccount?.lifecycleStage === CustomerLifecycleStage.BRIEFING_SCHEDULED,
    monitoringActive:
      Boolean(existingAccount?.monitoringActivatedAt) ||
      existingAccount?.lifecycleStage === CustomerLifecycleStage.MONITORING_ACTIVE
  });

  const stageSource =
    existingAccount &&
    existingAccount.stageSource === CustomerAccountStageSource.MANUAL &&
    getCustomerLifecycleStageRank(existingAccount.lifecycleStage) >=
      getCustomerLifecycleStageRank(nextStage)
      ? CustomerAccountStageSource.MANUAL
      : CustomerAccountStageSource.SYSTEM;

  const account = existingAccount
    ? await db.customerAccount.update({
        where: { id: existingAccount.id },
        data: {
          organizationId,
          primaryLeadSubmissionId: latestLead?.id ?? existingAccount.primaryLeadSubmissionId,
          primaryProvisioningRequestId:
            latestProvisioning?.id ?? existingAccount.primaryProvisioningRequestId,
          primaryContactEmail,
          normalizedPrimaryContactEmail: normalizeEmail(primaryContactEmail),
          companyName: latestLead?.companyName ?? organization.name,
          crmCompanyId:
            latestProvisioning?.crmAccountId ??
            organization.hubspotCompanyId ??
            existingAccount.crmCompanyId,
          crmDealId: latestProvisioning?.crmDealId ?? existingAccount.crmDealId,
          lifecycleStage: nextStage,
          stageSource,
          stageUpdatedAt:
            nextStage !== existingAccount.lifecycleStage ? new Date() : existingAccount.stageUpdatedAt,
          lastSystemSyncedAt: new Date(),
          wonAt:
            getCustomerLifecycleStageRank(nextStage) >=
              getCustomerLifecycleStageRank(CustomerLifecycleStage.WON) &&
            !existingAccount.wonAt
              ? new Date()
              : existingAccount.wonAt
        }
      })
    : await db.customerAccount.create({
        data: {
          organizationId,
          primaryLeadSubmissionId: latestLead?.id ?? null,
          primaryProvisioningRequestId: latestProvisioning?.id ?? null,
          dedupeKey,
          primaryContactEmail,
          normalizedPrimaryContactEmail: normalizeEmail(primaryContactEmail),
          companyName: latestLead?.companyName ?? organization.name,
          lifecycleStage: nextStage,
          stageSource: CustomerAccountStageSource.SYSTEM,
          stageUpdatedAt: new Date(),
          lastSystemSyncedAt: new Date(),
          wonAt:
            getCustomerLifecycleStageRank(nextStage) >=
            getCustomerLifecycleStageRank(CustomerLifecycleStage.WON)
              ? new Date()
              : null,
          crmCompanyId: latestProvisioning?.crmAccountId ?? organization.hubspotCompanyId ?? null,
          crmDealId: latestProvisioning?.crmDealId ?? null
        }
      });

  if (!existingAccount) {
    await appendTimelineEntry(db, {
      customerAccountId: account.id,
      organizationId,
      actorUserId: input?.actorUserId ?? null,
      actorType: input?.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
      actorLabel: input?.actorLabel ?? primaryContactEmail,
      entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
      title: "Organization linked to customer account",
      body: "The operator lifecycle account is now linked to a product organization.",
      metadata: {
        organizationId,
        primaryLeadSubmissionId: latestLead?.id ?? null,
        primaryProvisioningRequestId: latestProvisioning?.id ?? null
      }
    });
  }

  if (!existingAccount || existingAccount.lifecycleStage !== account.lifecycleStage) {
    await appendTimelineEntry(db, {
      customerAccountId: account.id,
      organizationId,
      actorUserId: input?.actorUserId ?? null,
      actorType: input?.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
      actorLabel: input?.actorLabel ?? primaryContactEmail,
      entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
      title: `Lifecycle moved to ${formatCustomerLifecycleStage(account.lifecycleStage)}`,
      body: input?.reason ?? "System state advanced the customer lifecycle.",
      metadata: {
        fromStage: existingAccount?.lifecycleStage ?? null,
        toStage: account.lifecycleStage,
        latestAssessmentId: latestAssessment?.id ?? null,
        latestReportId: latestReport?.id ?? null,
        latestCustomerRunId: latestRun?.id ?? null
      }
    });

    await publishCustomerAccountStageEvent(db, {
      customerAccountId: account.id,
      organizationId,
      userId: input?.actorUserId ?? ownerMembership?.user.id ?? null,
      stage: account.lifecycleStage,
      stageSource: account.stageSource,
      primaryContactEmail: account.primaryContactEmail,
      companyName: account.companyName,
      crmCompanyId: account.crmCompanyId,
      crmDealId: account.crmDealId,
      nextActionLabel: account.nextActionLabel,
      reason: input?.reason ?? null,
      idempotencySuffix: latestReport?.id ?? latestAssessment?.id ?? organizationId
    });
  }

  return account;
}

export async function getCustomerAccountsForAdmin(input?: {
  q?: string;
  limit?: number;
  queue?: OperatorCustomerQueueFilter;
  db?: CustomerAccountDbClient;
}) {
  const db = input?.db ?? prisma;
  const q = input?.q?.trim();
  const containsFilter = q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
  const now = new Date();
  const queue = input?.queue ?? "all";

  const queueWhere: Prisma.CustomerAccountWhereInput | undefined =
    queue === "follow_up"
      ? {
          nextActionLabel: { not: null },
          nextActionDueAt: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }
        }
      : queue === "founder_review"
        ? { founderReviewRequired: true }
        : queue === "action_required"
          ? {
              organization: {
                customerRuns: {
                  some: {
                    status: CustomerRunStatus.ACTION_REQUIRED
                  }
                }
              }
            }
          : queue === "delivery_review"
            ? {
                organization: {
                  reportPackages: {
                    some: {
                      OR: [
                        {
                          qaStatus: {
                            in: [
                              ReportPackageQaStatus.PENDING,
                              ReportPackageQaStatus.CHANGES_REQUESTED
                            ]
                          }
                        },
                        { requiresFounderReview: true, founderReviewedAt: null },
                        {
                          deliveryStatus: {
                            in: [
                              ReportPackageDeliveryStatus.SENT,
                              ReportPackageDeliveryStatus.BRIEFING_BOOKED
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            : undefined;

  return db.customerAccount.findMany({
    where: {
      ...(queueWhere ?? {}),
      ...(q
        ? {
            OR: [
              { primaryContactEmail: containsFilter },
              { companyName: containsFilter },
              { nextActionLabel: containsFilter },
              { nextActionOwner: containsFilter },
              { founderReviewReason: containsFilter },
              { organization: { name: containsFilter } },
              { organization: { slug: containsFilter } }
            ]
          }
        : {})
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      primaryLeadSubmission: {
        select: {
          id: true,
          source: true,
          stage: true,
          submittedAt: true
        }
      },
      timelineEntries: {
        where: {
          entryType: CustomerAccountTimelineEntryType.NOTE_ADDED
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          body: true,
          createdAt: true,
          actorLabel: true
        }
      },
      _count: {
        select: {
          timelineEntries: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }],
    take: input?.limit ?? 20
  });
}

export async function getCustomerAccountDetailSnapshot(
  customerAccountId: string,
  db: CustomerAccountDbClient = prisma
) {
  const customerAccount = await db.customerAccount.findUnique({
    where: { id: customerAccountId },
    select: {
      organizationId: true
    }
  });

  if (!customerAccount) {
    return null;
  }

  await requireActiveCustomerAccountOrganization(customerAccount.organizationId, db);
  await synchronizeCustomerAccountTimeline(customerAccountId, db);

  return db.customerAccount.findUnique({
    where: { id: customerAccountId },
    include: {
      organization: {
        include: {
          assessments: {
            orderBy: { createdAt: "desc" },
            take: 3
          },
          reports: {
            orderBy: { createdAt: "desc" },
            take: 3
          },
          customerRuns: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              assessment: {
                select: {
                  id: true,
                  name: true,
                  status: true
                }
              },
              report: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  deliveredAt: true
                }
              },
              initiatedBy: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          },
          provisioningRequests: {
            orderBy: { createdAt: "desc" },
            take: 3
          },
          reportPackages: {
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              deliveryStatus: true,
              qaStatus: true,
              requiresFounderReview: true,
              founderReviewReason: true,
              founderReviewedAt: true,
              briefingBookedAt: true,
              briefingCompletedAt: true,
              latestReportId: true,
              updatedAt: true
            }
          }
        }
      },
      primaryLeadSubmission: true,
      primaryProvisioningRequest: true,
      timelineEntries: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });
}

export async function setCustomerAccountLifecycleStage(input: {
  customerAccountId: string;
  stage: CustomerLifecycleStage;
  actorUserId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!existing) {
    throw new Error("Customer account not found.");
  }

  if (existing.lifecycleStage === input.stage) {
    return existing;
  }

  const now = new Date();
  const updated = await db.customerAccount.update({
    where: { id: existing.id },
    data: {
      lifecycleStage: input.stage,
      stageSource: CustomerAccountStageSource.MANUAL,
      stageUpdatedAt: now,
      wonAt:
        input.stage === CustomerLifecycleStage.WON && !existing.wonAt
          ? now
          : existing.wonAt,
      briefingScheduledAt:
        input.stage === CustomerLifecycleStage.BRIEFING_SCHEDULED
          ? existing.briefingScheduledAt ?? now
          : existing.briefingScheduledAt,
      monitoringActivatedAt:
        input.stage === CustomerLifecycleStage.MONITORING_ACTIVE
          ? existing.monitoringActivatedAt ?? now
          : existing.monitoringActivatedAt
    }
  });

  await appendTimelineEntry(db, {
    customerAccountId: updated.id,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? updated.primaryContactEmail,
    entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
    title: `Lifecycle moved to ${formatCustomerLifecycleStage(input.stage)}`,
    body: input.reason ?? "Lifecycle was updated manually by an operator.",
    metadata: {
      fromStage: existing.lifecycleStage,
      toStage: input.stage,
      stageSource: CustomerAccountStageSource.MANUAL
    }
  });

  await publishCustomerAccountStageEvent(db, {
    customerAccountId: updated.id,
    organizationId: updated.organizationId,
    userId: input.actorUserId ?? null,
    stage: updated.lifecycleStage,
    stageSource: updated.stageSource,
    primaryContactEmail: updated.primaryContactEmail,
    companyName: updated.companyName,
    crmCompanyId: updated.crmCompanyId,
    crmDealId: updated.crmDealId,
    nextActionLabel: updated.nextActionLabel,
    reason: input.reason ?? null
  });

  return updated;
}

export async function updateCustomerAccountNextAction(input: {
  customerAccountId: string;
  nextActionLabel?: string | null;
  nextActionDueAt?: Date | null;
  nextActionOwner?: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!existing) {
    throw new Error("Customer account not found.");
  }

  const updated = await db.customerAccount.update({
    where: { id: existing.id },
    data: {
      nextActionLabel: input.nextActionLabel?.trim() || null,
      nextActionDueAt: input.nextActionDueAt ?? null,
      nextActionOwner: input.nextActionOwner?.trim() || null
    }
  });

  await appendTimelineEntry(db, {
    customerAccountId: updated.id,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? updated.primaryContactEmail,
    entryType: CustomerAccountTimelineEntryType.TASK_UPDATED,
    title: updated.nextActionLabel ? "Next action updated" : "Next action cleared",
    body: updated.nextActionLabel
      ? `${updated.nextActionLabel}${updated.nextActionOwner ? ` · Owner ${updated.nextActionOwner}` : ""}`
      : "No follow-up task is currently scheduled.",
    metadata: {
      nextActionLabel: updated.nextActionLabel,
      nextActionOwner: updated.nextActionOwner,
      nextActionDueAt: updated.nextActionDueAt?.toISOString() ?? null
    }
  });

  return updated;
}

export async function updateCustomerAccountFounderReview(input: {
  customerAccountId: string;
  founderReviewRequired: boolean;
  founderReviewReason?: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!existing) {
    throw new Error("Customer account not found.");
  }

  const trimmedReason = input.founderReviewReason?.trim() || null;
  if (input.founderReviewRequired && !trimmedReason) {
    throw new Error("Founder review reason is required.");
  }

  const now = new Date();
  const updated = await db.customerAccount.update({
    where: { id: existing.id },
    data: {
      founderReviewRequired: input.founderReviewRequired,
      founderReviewReason: input.founderReviewRequired ? trimmedReason : null,
      founderReviewRequestedAt:
        input.founderReviewRequired
          ? existing.founderReviewRequestedAt ?? now
          : existing.founderReviewRequestedAt,
      founderReviewResolvedAt:
        input.founderReviewRequired ? null : existing.founderReviewRequired ? now : existing.founderReviewResolvedAt
    }
  });

  await appendTimelineEntry(db, {
    customerAccountId: updated.id,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? updated.primaryContactEmail,
    entryType: CustomerAccountTimelineEntryType.ESCALATION_UPDATED,
    title: input.founderReviewRequired
      ? "Founder review required"
      : "Founder review cleared",
    body: input.founderReviewRequired
      ? trimmedReason
      : "Operator cleared the founder escalation flag.",
    metadata: {
      founderReviewRequired: input.founderReviewRequired,
      founderReviewReason: trimmedReason
    }
  });

  return updated;
}

export async function addCustomerAccountNote(input: {
  customerAccountId: string;
  note: string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!existing) {
    throw new Error("Customer account not found.");
  }

  const trimmedNote = input.note.trim();
  if (!trimmedNote) {
    throw new Error("Note text is required.");
  }

  return appendTimelineEntry(db, {
    customerAccountId: existing.id,
    organizationId: existing.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? existing.primaryContactEmail,
    entryType: CustomerAccountTimelineEntryType.NOTE_ADDED,
    title: "Operator note added",
    body: trimmedNote
  });
}

export async function resendCustomerAccountStatusSync(input: {
  customerAccountId: string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const account = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!account) {
    throw new Error("Customer account not found.");
  }

  await appendTimelineEntry(db, {
    customerAccountId: account.id,
    organizationId: account.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? account.primaryContactEmail,
    entryType: CustomerAccountTimelineEntryType.CRM_SYNC,
    title: "Lifecycle status sync requested",
    body:
      input.reason ??
      "The current customer lifecycle status was re-published for CRM and automation consumers."
  });

  return publishCustomerAccountStageEvent(db, {
    customerAccountId: account.id,
    organizationId: account.organizationId,
    userId: input.actorUserId ?? null,
    stage: account.lifecycleStage,
    stageSource: account.stageSource,
    primaryContactEmail: account.primaryContactEmail,
    companyName: account.companyName,
    crmCompanyId: account.crmCompanyId,
    crmDealId: account.crmDealId,
    nextActionLabel: account.nextActionLabel,
    reason: input.reason ?? "manual_status_resync"
  });
}

export async function resyncCustomerAccount(input: {
  customerAccountId: string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  db?: CustomerAccountDbClient;
}) {
  const db = input.db ?? prisma;
  const account = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId }
  });

  if (!account) {
    throw new Error("Customer account not found.");
  }

  if (account.organizationId) {
    return syncOrganizationCustomerAccount(account.organizationId, {
      db,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      reason: "Operator-triggered lifecycle resync refreshed this account."
    });
  }

  if (account.primaryLeadSubmissionId) {
    return upsertCustomerAccountFromLead({
      leadSubmissionId: account.primaryLeadSubmissionId,
      db
    });
  }

  return account;
}
