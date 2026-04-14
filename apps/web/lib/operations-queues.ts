import {
  AuditActorType,
  CustomerAccountTimelineCategory,
  CustomerAccountTimelineEntryType,
  CustomerAccountTimelineSeverity,
  CustomerAccountTimelineSourceSystem,
  CustomerRunStatus,
  CustomerLifecycleStage,
  FindingSeverity,
  MonitoringFindingStatus,
  MonitoringSubscriptionStatus,
  OperationsQueueHistoryEntryType,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueStatus,
  OperationsQueueType,
  Prisma,
  ProvisioningStatus,
  ReportPackageDeliveryStatus,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { recordCustomerAccountTimelineEvent } from "./account-timeline";
import { requireRecordInOrganization } from "./scoped-access";
import { getOrganizationUsageSnapshot } from "./usage";

type OperationsQueueDbClient = Prisma.TransactionClient | typeof prisma;

export const OPERATIONS_QUEUE_TYPES = Object.values(
  OperationsQueueType
) as OperationsQueueType[];
export const OPERATIONS_QUEUE_STATUSES = Object.values(
  OperationsQueueStatus
) as OperationsQueueStatus[];
export const OPERATIONS_QUEUE_SEVERITIES = Object.values(
  OperationsQueueSeverity
) as OperationsQueueSeverity[];

export type OperationsQueueFilters = {
  q?: string | null;
  queueType?: OperationsQueueType | null;
  status?: OperationsQueueStatus | null;
  severity?: OperationsQueueSeverity | null;
  assigned?: "assigned" | "unassigned" | null;
  organizationId?: string | null;
  page?: number;
  pageSize?: number;
};

export type QueueRuleCandidate = {
  queueType: OperationsQueueType;
  ruleCode: string;
  severity: OperationsQueueSeverity;
  sourceSystem: OperationsQueueSourceSystem;
  title: string;
  summary: string;
  recommendedAction?: string;
  reasonLabel?: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type OperationsQueueRuleContext = {
  organizationId: string;
  customerAccountId: string | null;
  companyName: string | null;
  primaryContactEmail: string;
  lifecycleStage: CustomerLifecycleStage;
  wonAt: Date | null;
  onboardingCompletedAt: Date | null;
  lastSystemSyncedAt: Date | null;
  latestSubscription:
    | {
        id: string;
        status: SubscriptionStatus;
        accessState: string;
        createdAt: Date;
        updatedAt: Date;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
        canceledAt: Date | null;
        endedAt: Date | null;
        lastInvoicePaidAt: Date | null;
        lastPaymentFailedAt: Date | null;
        lastPaymentFailureMessage: string | null;
      }
    | null;
  provisioningRequest:
    | {
        id: string;
        status: ProvisioningStatus;
        createdAt: Date;
        failedAt: Date | null;
        lastError: string | null;
      }
    | null;
  latestAssessment:
    | {
        id: string;
        createdAt: Date;
        submittedAt: Date | null;
      }
    | null;
  latestReport:
    | {
        id: string;
        createdAt: Date;
        deliveredAt: Date | null;
      }
    | null;
  latestReportPackage:
    | {
        id: string;
        deliveryStatus: ReportPackageDeliveryStatus;
        createdAt: Date;
        updatedAt: Date;
        sentAt: Date | null;
        briefingBookedAt: Date | null;
        briefingCompletedAt: Date | null;
      }
    | null;
  monitoringSubscription:
    | {
        id: string;
        status: MonitoringSubscriptionStatus;
        activatedAt: Date | null;
        updatedAt: Date;
      }
    | null;
  oldestStalledHighRiskFinding:
    | {
        id: string;
        title: string;
        severity: FindingSeverity;
        status: MonitoringFindingStatus;
        lastStatusChangedAt: Date;
      }
    | null;
  actionRequiredRunCount: number;
  latestActionRequiredRun:
    | {
        id: string;
        updatedAt: Date;
        lastError: string | null;
        recoveryHint: string | null;
      }
    | null;
  lastActivityAt: Date | null;
};

type QueueCandidateRecord = QueueRuleCandidate & {
  dedupeKey: string;
  organizationId: string;
  customerAccountId: string | null;
};

export type RecordedOperationalFindingInput = {
  organizationId: string;
  customerAccountId?: string | null;
  queueType: OperationsQueueType;
  ruleCode: string;
  severity: OperationsQueueSeverity;
  sourceSystem: OperationsQueueSourceSystem;
  title: string;
  summary: string;
  recommendedAction?: string;
  reasonLabel?: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatOperationsQueueType(value: OperationsQueueType) {
  return value === OperationsQueueType.SUCCESS_RISK
    ? "Success risk"
    : "Billing anomaly";
}

export function formatOperationsQueueStatus(value: OperationsQueueStatus) {
  return formatLabel(value);
}

export function formatOperationsQueueSeverity(value: OperationsQueueSeverity) {
  return formatLabel(value);
}

function daysBetween(now: Date, date: Date | null | undefined) {
  if (!date) {
    return null;
  }

  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(now: Date, date: Date | null | undefined) {
  if (!date) {
    return null;
  }

  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isLiveSubscription(status: SubscriptionStatus | null | undefined) {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING ||
    status === SubscriptionStatus.PAST_DUE
  );
}

function hasIntakeCompleted(context: OperationsQueueRuleContext) {
  return (
    context.lifecycleStage === CustomerLifecycleStage.INTAKE_COMPLETE ||
    context.lifecycleStage === CustomerLifecycleStage.AUDIT_PROCESSING ||
    context.lifecycleStage === CustomerLifecycleStage.REPORT_READY ||
    context.lifecycleStage === CustomerLifecycleStage.BRIEFING_SCHEDULED ||
    context.lifecycleStage === CustomerLifecycleStage.MONITORING_ACTIVE ||
    Boolean(context.latestAssessment?.submittedAt)
  );
}

function hasMonitoringActive(context: OperationsQueueRuleContext) {
  return context.monitoringSubscription?.status === MonitoringSubscriptionStatus.ACTIVE;
}

export function buildOperationsQueueDedupeKey(input: {
  queueType: OperationsQueueType;
  ruleCode: string;
  organizationId: string;
  customerAccountId?: string | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
}) {
  return [
    input.queueType,
    input.ruleCode,
    input.organizationId,
    input.customerAccountId ?? "account:none",
    input.sourceRecordType ?? "record:none",
    input.sourceRecordId ?? "id:none"
  ].join(":");
}

export function evaluateOperationsQueueRules(
  context: OperationsQueueRuleContext,
  now: Date = new Date()
) {
  const candidates: QueueRuleCandidate[] = [];
  const subscription = context.latestSubscription;
  const latestPackage = context.latestReportPackage;
  const onboardingAnchor =
    subscription?.lastInvoicePaidAt ??
    subscription?.createdAt ??
    context.wonAt ??
    context.onboardingCompletedAt;
  const onboardingDelayDays = daysBetween(now, onboardingAnchor);
  const packageAgeDays = daysBetween(now, latestPackage?.updatedAt ?? latestPackage?.createdAt);
  const sentAgeDays = daysBetween(now, latestPackage?.sentAt);
  const briefingAgeDays = daysBetween(
    now,
    latestPackage?.briefingCompletedAt ?? latestPackage?.sentAt
  );
  const lastActivityAgeDays = daysBetween(now, context.lastActivityAt);
  const renewalDaysRemaining = daysUntil(now, subscription?.currentPeriodEnd);

  if (
    subscription &&
    isLiveSubscription(subscription.status) &&
    onboardingDelayDays !== null &&
    onboardingDelayDays >= 7 &&
    !hasIntakeCompleted(context)
  ) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.paid_intake_stalled",
      severity:
        onboardingDelayDays >= 14
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "subscription",
      sourceRecordId: subscription.id,
      title: "Paid account has not completed intake",
      summary:
        "Billing is live, but the customer has not completed intake quickly enough to reach first value.",
      recommendedAction:
        "Confirm onboarding ownership, unblock intake questions, and schedule a guided completion session."
    });
  }

  if (
    latestPackage &&
    !latestPackage.sentAt &&
    packageAgeDays !== null &&
    packageAgeDays >= 3 &&
    latestPackage.deliveryStatus === ReportPackageDeliveryStatus.GENERATED
  ) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.report_delivery_stalled",
      severity:
        packageAgeDays >= 7
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "reportPackage",
      sourceRecordId: latestPackage.id,
      title: "Executive delivery is stalled",
      summary:
        "A report package exists, but delivery has not progressed to a sent state within the expected window.",
      recommendedAction:
        "Review QA and founder-review blockers, then move the package toward send or document the hold-up."
    });
  }

  if (
    latestPackage?.sentAt &&
    !latestPackage.briefingBookedAt &&
    sentAgeDays !== null &&
    sentAgeDays >= 7
  ) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.briefing_not_booked",
      severity:
        sentAgeDays >= 14
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "reportPackage",
      sourceRecordId: latestPackage.id,
      title: "Briefing follow-up is overdue",
      summary:
        "The executive package was sent, but the customer has not booked a briefing within the expected follow-up window.",
      recommendedAction:
        "Reach out to the primary stakeholder, propose briefing times, and reinforce the value of the executive readout."
    });
  }

  if (
    latestPackage &&
    !hasMonitoringActive(context) &&
    briefingAgeDays !== null &&
    briefingAgeDays >= 14 &&
    (Boolean(latestPackage.briefingCompletedAt) || Boolean(latestPackage.sentAt))
  ) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.monitoring_not_activated",
      severity:
        briefingAgeDays >= 21
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "reportPackage",
      sourceRecordId: latestPackage.id,
      title: "Monitoring conversion has stalled",
      summary:
        "The account reached a delivery milestone, but ongoing monitoring has not been activated in time.",
      recommendedAction:
        "Offer the monitoring follow-on motion, clarify cadence, and confirm whether activation is blocked by procurement or scope."
    });
  }

  if (context.oldestStalledHighRiskFinding) {
    const stalledDays = daysBetween(
      now,
      context.oldestStalledHighRiskFinding.lastStatusChangedAt
    );

    if (stalledDays !== null && stalledDays >= 14) {
      candidates.push({
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "success.high_risk_finding_stalled",
        severity:
          context.oldestStalledHighRiskFinding.severity === FindingSeverity.CRITICAL
            ? OperationsQueueSeverity.CRITICAL
            : OperationsQueueSeverity.HIGH,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "monitoringFinding",
        sourceRecordId: context.oldestStalledHighRiskFinding.id,
        title: "High-risk finding has no recent follow-up",
        summary:
          "A severe monitoring finding remains unresolved without recent remediation progress.",
        recommendedAction:
          "Confirm remediation ownership, update target dates, and escalate if the customer is blocked."
      });
    }
  }

  if (context.actionRequiredRunCount >= 2 && context.latestActionRequiredRun) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.repeated_failed_workflows",
      severity:
        context.actionRequiredRunCount >= 3
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "customerRun",
      sourceRecordId: context.latestActionRequiredRun.id,
      title: "Repeated failed workflows are affecting the account",
      summary:
        "The same customer has multiple recent runs in action-required state, which risks delayed delivery and trust erosion.",
      recommendedAction:
        "Inspect the latest run, apply a safe recovery, and communicate the current status to the customer if timing is impacted."
    });
  }

  if (
    renewalDaysRemaining !== null &&
    renewalDaysRemaining <= 21 &&
    lastActivityAgeDays !== null &&
    lastActivityAgeDays >= 21
  ) {
    candidates.push({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.renewal_low_engagement",
      severity:
        renewalDaysRemaining <= 14
          ? OperationsQueueSeverity.HIGH
          : OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.STRIPE,
      sourceRecordType: "subscription",
      sourceRecordId: subscription?.id ?? null,
      title: "Renewal is approaching with low engagement",
      summary:
        "The account is nearing renewal, but product activity has cooled enough that proactive value reinforcement is warranted.",
      recommendedAction:
        "Review customer outcomes, remind the account of delivered value, and schedule a renewal-facing checkpoint."
    });
  }

  if (
    subscription &&
    (Boolean(subscription.lastPaymentFailedAt) ||
      Boolean(subscription.lastPaymentFailureMessage) ||
      subscription.status === SubscriptionStatus.PAST_DUE)
  ) {
    candidates.push({
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.failed_charge",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.STRIPE,
      sourceRecordType: "subscription",
      sourceRecordId: subscription.id,
      title: "Billing failure needs intervention",
      summary:
        "Stripe indicates a payment failure or past-due subscription state that can reduce access or derail renewal.",
      recommendedAction:
        "Confirm the latest invoice state, notify the customer if needed, and guide them into the billing portal before service is affected."
    });
  }

  if (
    subscription?.lastInvoicePaidAt &&
    onboardingDelayDays !== null &&
    onboardingDelayDays >= 3 &&
    context.provisioningRequest &&
    context.provisioningRequest.status !== ProvisioningStatus.PROVISIONED
  ) {
    candidates.push({
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.payment_without_provisioning",
      severity: OperationsQueueSeverity.CRITICAL,
      sourceSystem: OperationsQueueSourceSystem.STRIPE,
      sourceRecordType: "provisioningRequest",
      sourceRecordId: context.provisioningRequest.id,
      title: "Payment succeeded but provisioning is incomplete",
      summary:
        "The account has a recorded payment, but workspace provisioning has not completed successfully.",
      recommendedAction:
        "Prioritize provisioning recovery immediately and confirm customer access once the workspace is ready."
    });
  }

  if (
    context.provisioningRequest?.status === ProvisioningStatus.FAILED &&
    Boolean(subscription?.lastInvoicePaidAt)
  ) {
    candidates.push({
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.provisioning_failed_after_payment",
      severity: OperationsQueueSeverity.CRITICAL,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "provisioningRequest",
      sourceRecordId: context.provisioningRequest.id,
      title: "Provisioning failed after customer payment",
      summary:
        "The customer has paid, but the provisioning request is currently failed and needs manual intervention.",
      recommendedAction:
        "Investigate the provisioning error, recover the request safely, and confirm the customer has a valid workspace."
    });
  }

  if (
    hasMonitoringActive(context) &&
    subscription &&
    !isLiveSubscription(subscription.status)
  ) {
    candidates.push({
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.monitoring_active_without_live_billing",
      severity: OperationsQueueSeverity.CRITICAL,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "monitoringSubscription",
      sourceRecordId: context.monitoringSubscription?.id ?? null,
      title: "Monitoring is active without live billing",
      summary:
        "Recurring monitoring is still active even though the linked subscription is no longer in a live billing state.",
      recommendedAction:
        "Verify whether monitoring should remain active, then reconcile product access and Stripe state."
    });
  }

  if (
    subscription &&
    subscription.status === SubscriptionStatus.CANCELED &&
    subscription.accessState === "ACTIVE"
  ) {
    candidates.push({
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.subscription_state_mismatch",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "subscription",
      sourceRecordId: subscription.id,
      title: "Subscription state appears inconsistent",
      summary:
        "The synced subscription status and access state do not line up cleanly, which can create incorrect entitlement behavior.",
      recommendedAction:
        "Inspect the latest Stripe lifecycle events and re-run the billing sync if needed before changing customer access."
    });
  }

  return candidates;
}

function getTimelineCategoryForQueueType(queueType: OperationsQueueType) {
  return queueType === OperationsQueueType.BILLING_ANOMALY
    ? CustomerAccountTimelineCategory.BILLING
    : CustomerAccountTimelineCategory.RISK;
}

function getTimelineSeverityForQueueSeverity(severity: OperationsQueueSeverity) {
  switch (severity) {
    case OperationsQueueSeverity.CRITICAL:
      return CustomerAccountTimelineSeverity.CRITICAL;
    case OperationsQueueSeverity.HIGH:
    case OperationsQueueSeverity.MEDIUM:
      return CustomerAccountTimelineSeverity.WARNING;
    default:
      return CustomerAccountTimelineSeverity.INFO;
  }
}

async function recordQueueHistoryEntry(
  db: OperationsQueueDbClient,
  input: {
    queueItemId: string;
    organizationId: string;
    actorUserId?: string | null;
    actorType?: AuditActorType;
    actorLabel?: string | null;
    entryType: OperationsQueueHistoryEntryType;
    fromStatus?: OperationsQueueStatus | null;
    toStatus?: OperationsQueueStatus | null;
    note?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  }
) {
  return db.operationsQueueHistoryEntry.create({
    data: {
      operationsQueueItemId: input.queueItemId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? AuditActorType.SYSTEM,
      actorLabel: input.actorLabel ?? null,
      entryType: input.entryType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? Prisma.JsonNull
    }
  });
}

async function recordQueueTimelineEvent(
  db: OperationsQueueDbClient,
  input: {
    queueItemId: string;
    queueType: OperationsQueueType;
    customerAccountId?: string | null;
    organizationId: string;
    actorUserId?: string | null;
    actorType?: AuditActorType;
    actorLabel?: string | null;
    title: string;
    body: string;
    severity: OperationsQueueSeverity;
    sourceRecordType?: string | null;
    sourceRecordId?: string | null;
    sourceSystem?: CustomerAccountTimelineSourceSystem;
    eventCode: string;
  }
) {
  if (!input.customerAccountId) {
    return null;
  }

  return recordCustomerAccountTimelineEvent(db, {
    customerAccountId: input.customerAccountId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? null,
    entryType: CustomerAccountTimelineEntryType.ESCALATION_UPDATED,
    category: getTimelineCategoryForQueueType(input.queueType),
    severity: getTimelineSeverityForQueueSeverity(input.severity),
    sourceSystem: input.sourceSystem ?? CustomerAccountTimelineSourceSystem.APP,
    eventCode: input.eventCode,
    sourceRecordType: input.sourceRecordType ?? "operationsQueueItem",
    sourceRecordId: input.sourceRecordId ?? input.queueItemId,
    title: input.title,
    body: input.body
  });
}

async function buildQueueRuleContexts(
  input: {
    organizationId?: string | null;
  },
  db: OperationsQueueDbClient
) {
  const customerAccounts = await db.customerAccount.findMany({
    where: {
      organizationId: input.organizationId ?? { not: null }
    },
    include: {
      organization: {
        include: {
          subscriptions: {
            orderBy: { updatedAt: "desc" },
            take: 1
          },
          provisioningRequests: {
            orderBy: { updatedAt: "desc" },
            take: 1
          },
          assessments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              createdAt: true,
              submittedAt: true
            }
          },
          reports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              createdAt: true,
              deliveredAt: true
            }
          },
          reportPackages: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              deliveryStatus: true,
              createdAt: true,
              updatedAt: true,
              sentAt: true,
              briefingBookedAt: true,
              briefingCompletedAt: true
            }
          },
          monitoringSubscription: {
            select: {
              id: true,
              status: true,
              activatedAt: true,
              updatedAt: true
            }
          },
          monitoringFindings: {
            where: {
              status: {
                in: [
                  MonitoringFindingStatus.OPEN,
                  MonitoringFindingStatus.IN_REMEDIATION,
                  MonitoringFindingStatus.DEFERRED
                ]
              },
              severity: {
                in: [FindingSeverity.HIGH, FindingSeverity.CRITICAL]
              }
            },
            orderBy: { lastStatusChangedAt: "asc" },
            take: 1,
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              lastStatusChangedAt: true
            }
          },
          customerRuns: {
            where: {
              status: CustomerRunStatus.ACTION_REQUIRED
            },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
              id: true,
              updatedAt: true,
              lastError: true,
              recoveryHint: true
            }
          }
        }
      }
    }
  });

  return Promise.all(
    customerAccounts
      .filter(
        (customerAccount): customerAccount is typeof customerAccounts[number] & {
          organization: NonNullable<typeof customerAccount.organization>;
        } => Boolean(customerAccount.organization)
      )
      .map(async (customerAccount) => {
        const usage = await getOrganizationUsageSnapshot(customerAccount.organizationId!, db);
        const latestSubscription = customerAccount.organization.subscriptions[0] ?? null;
        const latestActionRequiredRun =
          customerAccount.organization.customerRuns[0] ?? null;

        return {
          organizationId: customerAccount.organizationId!,
          customerAccountId: customerAccount.id,
          companyName: customerAccount.companyName ?? customerAccount.organization.name,
          primaryContactEmail: customerAccount.primaryContactEmail,
          lifecycleStage: customerAccount.lifecycleStage,
          wonAt: customerAccount.wonAt,
          onboardingCompletedAt: customerAccount.organization.onboardingCompletedAt,
          lastSystemSyncedAt: customerAccount.lastSystemSyncedAt,
          latestSubscription: latestSubscription
            ? {
                id: latestSubscription.id,
                status: latestSubscription.status,
                accessState: latestSubscription.accessState,
                createdAt: latestSubscription.createdAt,
                updatedAt: latestSubscription.updatedAt,
                currentPeriodEnd: latestSubscription.currentPeriodEnd,
                cancelAtPeriodEnd: latestSubscription.cancelAtPeriodEnd,
                canceledAt: latestSubscription.canceledAt,
                endedAt: latestSubscription.endedAt,
                lastInvoicePaidAt: latestSubscription.lastInvoicePaidAt,
                lastPaymentFailedAt: latestSubscription.lastPaymentFailedAt,
                lastPaymentFailureMessage: latestSubscription.lastPaymentFailureMessage
              }
            : null,
          provisioningRequest:
            customerAccount.organization.provisioningRequests[0] ?? null,
          latestAssessment: customerAccount.organization.assessments[0] ?? null,
          latestReport: customerAccount.organization.reports[0] ?? null,
          latestReportPackage:
            customerAccount.organization.reportPackages[0] ?? null,
          monitoringSubscription:
            customerAccount.organization.monitoringSubscription ?? null,
          oldestStalledHighRiskFinding:
            customerAccount.organization.monitoringFindings[0] ?? null,
          actionRequiredRunCount:
            customerAccount.organization.customerRuns.length,
          latestActionRequiredRun,
          lastActivityAt: usage.lastActivityAt
        } satisfies OperationsQueueRuleContext;
      })
  );
}

function buildQueueCandidateRecord(
  candidate: QueueRuleCandidate,
  context: OperationsQueueRuleContext
): QueueCandidateRecord {
  return {
    ...candidate,
    organizationId: context.organizationId,
    customerAccountId: context.customerAccountId,
    dedupeKey: buildOperationsQueueDedupeKey({
      queueType: candidate.queueType,
      ruleCode: candidate.ruleCode,
      organizationId: context.organizationId,
      customerAccountId: context.customerAccountId,
      sourceRecordType: candidate.sourceRecordType,
      sourceRecordId: candidate.sourceRecordId
    })
  };
}

export async function recordOperationalFinding(
  input: RecordedOperationalFindingInput,
  db: OperationsQueueDbClient = prisma
) {
  const customerAccountId =
    input.customerAccountId ??
    (await db.customerAccount.findFirst({
      where: { organizationId: input.organizationId },
      select: { id: true }
    }))?.id ??
    null;
  const dedupeKey = buildOperationsQueueDedupeKey({
    queueType: input.queueType,
    ruleCode: input.ruleCode,
    organizationId: input.organizationId,
    customerAccountId,
    sourceRecordType: input.sourceRecordType,
    sourceRecordId: input.sourceRecordId
  });
  const now = new Date();
  const existing = await db.operationsQueueItem.findUnique({
    where: { dedupeKey }
  });

  if (!existing) {
    const created = await db.operationsQueueItem.create({
      data: {
        organizationId: input.organizationId,
        customerAccountId,
        queueType: input.queueType,
        ruleCode: input.ruleCode,
        dedupeKey,
        sourceSystem: input.sourceSystem,
        sourceRecordType: input.sourceRecordType ?? null,
        sourceRecordId: input.sourceRecordId ?? null,
        severity: input.severity,
        title: input.title,
        summary: input.summary,
        recommendedAction: input.recommendedAction ?? null,
        reasonLabel: input.reasonLabel ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        firstDetectedAt: now,
        lastDetectedAt: now,
        lastEvaluatedAt: now,
        statusUpdatedAt: now
      }
    });

    await recordQueueHistoryEntry(db, {
      queueItemId: created.id,
      organizationId: created.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      entryType: OperationsQueueHistoryEntryType.SYSTEM_DETECTED,
      toStatus: created.status,
      note: input.summary,
      metadata: {
        ruleCode: input.ruleCode,
        queueType: input.queueType
      }
    });

    await recordQueueTimelineEvent(db, {
      queueItemId: created.id,
      queueType: created.queueType,
      customerAccountId: created.customerAccountId,
      organizationId: created.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      title: created.title,
      body: created.summary,
      severity: created.severity,
      sourceRecordType: created.sourceRecordType,
      sourceRecordId: created.sourceRecordId,
      sourceSystem:
        input.sourceSystem === OperationsQueueSourceSystem.STRIPE
          ? CustomerAccountTimelineSourceSystem.STRIPE
          : CustomerAccountTimelineSourceSystem.APP,
      eventCode: "ops.queue_detected"
    });

    return created;
  }

  const nextStatus =
    existing.status === OperationsQueueStatus.RESOLVED ||
    existing.status === OperationsQueueStatus.DISMISSED
      ? OperationsQueueStatus.NEW
      : existing.status;

  const updated = await db.operationsQueueItem.update({
    where: { id: existing.id },
    data: {
      customerAccountId,
      sourceSystem: input.sourceSystem,
      sourceRecordType: input.sourceRecordType ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      recommendedAction: input.recommendedAction ?? null,
      reasonLabel: input.reasonLabel ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
      lastDetectedAt: now,
      lastEvaluatedAt: now,
      status: nextStatus,
      statusUpdatedAt:
        nextStatus !== existing.status ? now : existing.statusUpdatedAt,
      resolvedAt: nextStatus === OperationsQueueStatus.NEW ? null : existing.resolvedAt,
      dismissedAt:
        nextStatus === OperationsQueueStatus.NEW ? null : existing.dismissedAt
    }
  });

  if (nextStatus !== existing.status) {
    await recordQueueHistoryEntry(db, {
      queueItemId: updated.id,
      organizationId: updated.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      entryType: OperationsQueueHistoryEntryType.SYSTEM_REOPENED,
      fromStatus: existing.status,
      toStatus: updated.status,
      note: input.summary,
      metadata: {
        ruleCode: updated.ruleCode
      }
    });

    await recordQueueTimelineEvent(db, {
      queueItemId: updated.id,
      queueType: updated.queueType,
      customerAccountId: updated.customerAccountId,
      organizationId: updated.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      title: `${updated.title} reopened`,
      body: updated.summary,
      severity: updated.severity,
      sourceRecordType: updated.sourceRecordType,
      sourceRecordId: updated.sourceRecordId,
      sourceSystem:
        input.sourceSystem === OperationsQueueSourceSystem.STRIPE
          ? CustomerAccountTimelineSourceSystem.STRIPE
          : CustomerAccountTimelineSourceSystem.APP,
      eventCode: "ops.queue_reopened"
    });
  }

  return updated;
}

export async function synchronizeOperationsQueues(
  input: {
    organizationId?: string | null;
  } = {},
  db: OperationsQueueDbClient = prisma
) {
  const now = new Date();
  const contexts = await buildQueueRuleContexts(input, db);
  const activeCandidates = contexts.flatMap((context) =>
    evaluateOperationsQueueRules(context, now).map((candidate) =>
      buildQueueCandidateRecord(candidate, context)
    )
  );
  const activeCandidateKeys = new Set(activeCandidates.map((candidate) => candidate.dedupeKey));
  const organizationIds = Array.from(new Set(contexts.map((context) => context.organizationId)));
  const existingItems = organizationIds.length
    ? await db.operationsQueueItem.findMany({
        where: {
          organizationId: {
            in: organizationIds
          }
        }
      })
    : [];
  const existingByKey = new Map(existingItems.map((item) => [item.dedupeKey, item]));

  for (const candidate of activeCandidates) {
    const existing = existingByKey.get(candidate.dedupeKey);

    if (!existing) {
      const created = await db.operationsQueueItem.create({
        data: {
          organizationId: candidate.organizationId,
          customerAccountId: candidate.customerAccountId,
          queueType: candidate.queueType,
          ruleCode: candidate.ruleCode,
          dedupeKey: candidate.dedupeKey,
          sourceSystem: candidate.sourceSystem,
          sourceRecordType: candidate.sourceRecordType ?? null,
          sourceRecordId: candidate.sourceRecordId ?? null,
          severity: candidate.severity,
          title: candidate.title,
          summary: candidate.summary,
          recommendedAction: candidate.recommendedAction ?? null,
          reasonLabel: candidate.reasonLabel ?? null,
          metadata: candidate.metadata ?? Prisma.JsonNull,
          firstDetectedAt: now,
          lastDetectedAt: now,
          lastEvaluatedAt: now,
          statusUpdatedAt: now
        }
      });

      await recordQueueHistoryEntry(db, {
        queueItemId: created.id,
        organizationId: created.organizationId,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "system",
        entryType: OperationsQueueHistoryEntryType.SYSTEM_DETECTED,
        toStatus: created.status,
        note: candidate.summary,
        metadata: {
          ruleCode: candidate.ruleCode,
          queueType: candidate.queueType
        }
      });

      await recordQueueTimelineEvent(db, {
        queueItemId: created.id,
        queueType: created.queueType,
        customerAccountId: created.customerAccountId,
        organizationId: created.organizationId,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "system",
        title: created.title,
        body: created.summary,
        severity: created.severity,
        sourceRecordType: created.sourceRecordType,
        sourceRecordId: created.sourceRecordId,
        sourceSystem:
          created.queueType === OperationsQueueType.BILLING_ANOMALY
            ? CustomerAccountTimelineSourceSystem.STRIPE
            : CustomerAccountTimelineSourceSystem.APP,
        eventCode: "ops.queue_detected"
      });

      existingByKey.set(created.dedupeKey, created);
      continue;
    }

    let nextStatus = existing.status;
    let historyEntryType: OperationsQueueHistoryEntryType | null = null;

    if (existing.status === OperationsQueueStatus.RESOLVED) {
      nextStatus = OperationsQueueStatus.NEW;
      historyEntryType = OperationsQueueHistoryEntryType.SYSTEM_REOPENED;
    }

    const updated = await db.operationsQueueItem.update({
      where: { id: existing.id },
      data: {
        customerAccountId: candidate.customerAccountId,
        sourceSystem: candidate.sourceSystem,
        sourceRecordType: candidate.sourceRecordType ?? null,
        sourceRecordId: candidate.sourceRecordId ?? null,
        severity: candidate.severity,
        title: candidate.title,
        summary: candidate.summary,
        recommendedAction: candidate.recommendedAction ?? null,
        reasonLabel: candidate.reasonLabel ?? null,
        metadata: candidate.metadata ?? Prisma.JsonNull,
        lastDetectedAt: now,
        lastEvaluatedAt: now,
        status: nextStatus,
        statusUpdatedAt: nextStatus !== existing.status ? now : existing.statusUpdatedAt,
        resolvedAt: nextStatus === OperationsQueueStatus.NEW ? null : existing.resolvedAt,
        dismissedAt:
          nextStatus === OperationsQueueStatus.NEW ? null : existing.dismissedAt
      }
    });

    if (historyEntryType) {
      await recordQueueHistoryEntry(db, {
        queueItemId: updated.id,
        organizationId: updated.organizationId,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "system",
        entryType: historyEntryType,
        fromStatus: existing.status,
        toStatus: updated.status,
        note: candidate.summary,
        metadata: {
          ruleCode: updated.ruleCode
        }
      });

      await recordQueueTimelineEvent(db, {
        queueItemId: updated.id,
        queueType: updated.queueType,
        customerAccountId: updated.customerAccountId,
        organizationId: updated.organizationId,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "system",
        title: `${updated.title} reopened`,
        body: updated.summary,
        severity: updated.severity,
        sourceRecordType: updated.sourceRecordType,
        sourceRecordId: updated.sourceRecordId,
        eventCode: "ops.queue_reopened"
      });
    }
  }

  for (const existing of existingItems) {
    if (activeCandidateKeys.has(existing.dedupeKey)) {
      continue;
    }

    if (
      existing.status === OperationsQueueStatus.RESOLVED ||
      existing.status === OperationsQueueStatus.DISMISSED
    ) {
      await db.operationsQueueItem.update({
        where: { id: existing.id },
        data: {
          lastEvaluatedAt: now
        }
      });
      continue;
    }

    const resolved = await db.operationsQueueItem.update({
      where: { id: existing.id },
      data: {
        status: OperationsQueueStatus.RESOLVED,
        statusUpdatedAt: now,
        resolvedAt: now,
        lastEvaluatedAt: now
      }
    });

    await recordQueueHistoryEntry(db, {
      queueItemId: resolved.id,
      organizationId: resolved.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      entryType: OperationsQueueHistoryEntryType.SYSTEM_RESOLVED,
      fromStatus: existing.status,
      toStatus: OperationsQueueStatus.RESOLVED,
      note: "The underlying condition is no longer present in the latest system evaluation.",
      metadata: {
        ruleCode: resolved.ruleCode
      }
    });

    await recordQueueTimelineEvent(db, {
      queueItemId: resolved.id,
      queueType: resolved.queueType,
      customerAccountId: resolved.customerAccountId,
      organizationId: resolved.organizationId,
      actorType: AuditActorType.SYSTEM,
      actorLabel: "system",
      title: `${resolved.title} resolved`,
      body: "The underlying queue condition cleared during the latest system evaluation.",
      severity: resolved.severity,
      sourceRecordType: resolved.sourceRecordType,
      sourceRecordId: resolved.sourceRecordId,
      eventCode: "ops.queue_resolved"
    });
  }

  return {
    scannedAccounts: contexts.length,
    activeCandidates: activeCandidates.length
  };
}

function buildOperationsQueueWhere(
  filters: OperationsQueueFilters
): Prisma.OperationsQueueItemWhereInput {
  const q = filters.q?.trim();

  return {
    ...(filters.queueType ? { queueType: filters.queueType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    ...(filters.assigned === "assigned"
      ? { assignedUserId: { not: null } }
      : filters.assigned === "unassigned"
        ? { assignedUserId: null }
        : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { ruleCode: { contains: q, mode: "insensitive" } },
            { sourceRecordId: { contains: q, mode: "insensitive" } },
            { sourceRecordType: { contains: q, mode: "insensitive" } },
            { organization: { name: { contains: q, mode: "insensitive" } } },
            { organization: { slug: { contains: q, mode: "insensitive" } } },
            { customerAccount: { primaryContactEmail: { contains: q, mode: "insensitive" } } },
            { customerAccount: { companyName: { contains: q, mode: "insensitive" } } },
            { assignedUser: { email: { contains: q, mode: "insensitive" } } }
          ]
        }
      : {})
  };
}

export async function listOperationsQueueItems(
  filters: OperationsQueueFilters = {},
  db: OperationsQueueDbClient = prisma
) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);
  const where = buildOperationsQueueWhere(filters);

  const [items, totalCount, counts] = await Promise.all([
    db.operationsQueueItem.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        customerAccount: {
          select: {
            id: true,
            companyName: true,
            primaryContactEmail: true,
            lifecycleStage: true
          }
        },
        assignedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        historyEntries: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            entryType: true,
            note: true,
            createdAt: true,
            actorLabel: true
          }
        }
      },
      orderBy: [
        { severity: "desc" },
        { statusUpdatedAt: "asc" },
        { lastDetectedAt: "desc" }
      ],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.operationsQueueItem.count({ where }),
    db.operationsQueueItem.groupBy({
      by: ["queueType", "status"],
      _count: {
        _all: true
      }
    })
  ]);

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
    counts
  };
}

export async function getOperationsQueueDetail(
  queueItemId: string,
  db: OperationsQueueDbClient = prisma
) {
  // Queue detail is a platform-admin read surface, so a globally unique queue item
  // id is acceptable here. Tenant-scoped mutation paths must still prove
  // organization ownership at the service boundary.
  return db.operationsQueueItem.findUnique({
    where: { id: queueItemId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      customerAccount: {
        select: {
          id: true,
          companyName: true,
          primaryContactEmail: true,
          lifecycleStage: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      historyEntries: {
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
        orderBy: { createdAt: "desc" },
        take: 50
      }
    }
  });
}

export async function getOperationsQueueAssignableUsers(
  db: OperationsQueueDbClient = prisma
) {
  return db.user.findMany({
    where: {
      platformRole: {
        not: "NONE"
      }
    },
    orderBy: [{ firstName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      platformRole: true
    }
  });
}

export async function updateOperationsQueueStatus(input: {
  queueItemId: string;
  organizationId: string;
  status: OperationsQueueStatus;
  actorUserId: string;
  actorEmail: string;
  note?: string | null;
  db?: OperationsQueueDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await requireRecordInOrganization({
    recordId: input.queueItemId,
    organizationId: input.organizationId,
    entityLabel: "Queue item",
    load: ({ recordId, organizationId }) =>
      db.operationsQueueItem.findFirst({
        where: {
          id: recordId,
          organizationId
        }
      })
  });

  const trimmedNote = input.note?.trim() || null;
  if (input.status === OperationsQueueStatus.DISMISSED && !trimmedNote) {
    throw new Error("A dismissal note is required.");
  }

  if (existing.status === input.status) {
    return existing;
  }

  const now = new Date();
  const updated = await db.operationsQueueItem.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      statusUpdatedAt: now,
      resolvedAt:
        input.status === OperationsQueueStatus.RESOLVED ? now : existing.resolvedAt,
      dismissedAt:
        input.status === OperationsQueueStatus.DISMISSED ? now : existing.dismissedAt
    }
  });

  await recordQueueHistoryEntry(db, {
    queueItemId: updated.id,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId,
    actorType: AuditActorType.ADMIN,
    actorLabel: input.actorEmail,
    entryType: OperationsQueueHistoryEntryType.STATUS_CHANGED,
    fromStatus: existing.status,
    toStatus: input.status,
    note: trimmedNote
  });

  await recordQueueTimelineEvent(db, {
    queueItemId: updated.id,
    queueType: updated.queueType,
    customerAccountId: updated.customerAccountId,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId,
    actorType: AuditActorType.ADMIN,
    actorLabel: input.actorEmail,
    title: `${updated.title} marked ${formatOperationsQueueStatus(updated.status).toLowerCase()}`,
    body:
      trimmedNote ??
      "An operator updated the queue workflow status for this account issue.",
    severity: updated.severity,
    sourceRecordType: updated.sourceRecordType,
    sourceRecordId: updated.sourceRecordId,
    sourceSystem: CustomerAccountTimelineSourceSystem.MANUAL,
    eventCode: "ops.queue_status_updated"
  });

  return updated;
}

export async function assignOperationsQueueItem(input: {
  queueItemId: string;
  organizationId: string;
  assignedUserId?: string | null;
  actorUserId: string;
  actorEmail: string;
  note?: string | null;
  db?: OperationsQueueDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await requireRecordInOrganization({
    recordId: input.queueItemId,
    organizationId: input.organizationId,
    entityLabel: "Queue item",
    load: ({ recordId, organizationId }) =>
      db.operationsQueueItem.findFirst({
        where: {
          id: recordId,
          organizationId
        }
      })
  });

  const assignedUserId = input.assignedUserId?.trim() || null;
  const now = new Date();
  const updated = await db.operationsQueueItem.update({
    where: { id: existing.id },
    data: {
      assignedUserId,
      assignedAt: assignedUserId ? now : null
    },
    include: {
      assignedUser: {
        select: {
          email: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });

  await recordQueueHistoryEntry(db, {
    queueItemId: updated.id,
    organizationId: updated.organizationId,
    actorUserId: input.actorUserId,
    actorType: AuditActorType.ADMIN,
    actorLabel: input.actorEmail,
    entryType: OperationsQueueHistoryEntryType.ASSIGNED,
    note: input.note?.trim() || null,
    metadata: {
      assignedUserId,
      assignedEmail: updated.assignedUser?.email ?? null
    }
  });

  return updated;
}

export async function addOperationsQueueNote(input: {
  queueItemId: string;
  organizationId: string;
  note: string;
  actorUserId: string;
  actorEmail: string;
  db?: OperationsQueueDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await requireRecordInOrganization({
    recordId: input.queueItemId,
    organizationId: input.organizationId,
    entityLabel: "Queue item",
    load: ({ recordId, organizationId }) =>
      db.operationsQueueItem.findFirst({
        where: {
          id: recordId,
          organizationId
        }
      })
  });

  const trimmedNote = input.note.trim();
  if (!trimmedNote) {
    throw new Error("A note is required.");
  }

  return recordQueueHistoryEntry(db, {
    queueItemId: existing.id,
    organizationId: existing.organizationId,
    actorUserId: input.actorUserId,
    actorType: AuditActorType.ADMIN,
    actorLabel: input.actorEmail,
    entryType: OperationsQueueHistoryEntryType.NOTE_ADDED,
    note: trimmedNote
  });
}
