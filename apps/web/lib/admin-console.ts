import {
  BillingEventStatus,
  DomainEventStatus,
  EmailNotificationStatus,
  CanonicalPlanKey,
  LeadSubmissionStatus,
  OperationsQueueType,
  Prisma,
  SubscriptionStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import { getCurrentSubscription, hasStripeBillingConfig } from "./billing";
import {
  getCanonicalCommercialPlanDefinition,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import { listDeliveryMismatchFindings } from "./delivery-mismatch-detection";
import { getFeatureFlags } from "./feature-flags";
import {
  buildFulfillmentVisibilitySummary,
  listFulfillmentVisibilityEntries
} from "./fulfillment-visibility";
import { getOpsReadinessSnapshot } from "./ops-readiness";
import { getPrimaryOwnerMembership } from "./roles";
import { getOutboundWebhookDestinations } from "./webhook-dispatcher";
import { getAuthMode, getOptionalEnv, getOptionalListEnv } from "./runtime-config";
import { getOrganizationUsageSnapshot } from "./usage";

type AdminConsoleDbClient = Prisma.TransactionClient | typeof prisma;

function buildContainsFilter(q: string) {
  return q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
}

function resolveSupportSafePlanCode(input: {
  planCode?: string | null;
  canonicalPlanKey?: CanonicalPlanKey | null;
}) {
  return (
    resolveCanonicalPlanCode(input.planCode) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(input.planCode) ??
    (input.canonicalPlanKey
      ? mapCanonicalPlanKeyToCanonicalPlanCode(input.canonicalPlanKey)
      : null)
  );
}

function matchesGlobalOpsSearch(
  q: string,
  values: Array<string | null | undefined>
) {
  if (!q) {
    return true;
  }

  const normalizedQuery = q.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

export async function getAdminConsoleScaleSnapshot(input: {
  q: string;
  db?: AdminConsoleDbClient;
}) {
  const db = input.db ?? prisma;
  const containsFilter = buildContainsFilter(input.q);
  const featureFlags = getFeatureFlags();
  const webhookDestinations = getOutboundWebhookDestinations();
  const opsReadiness = await getOpsReadinessSnapshot();

  const [
    organizations,
    recentBillingEvents,
    recentLeadSubmissions,
    analyticsCounts,
    recentDeliveryOpsQueueItems,
    rawGlobalMismatchFindings,
    fulfillmentVisibilityEntries
  ] =
    await Promise.all([
      db.organization.findMany({
        where: input.q
          ? {
              OR: [
                { name: containsFilter },
                { slug: containsFilter },
                { hubspotCompanyId: containsFilter }
              ]
            }
          : undefined,
        include: {
          members: {
            include: {
              user: true
            },
            orderBy: { createdAt: "asc" },
            take: 5
          },
          leadSubmissions: {
            orderBy: { submittedAt: "desc" },
            take: 1
          },
          reports: {
            orderBy: { createdAt: "desc" },
            take: 1
          },
          assessments: {
            orderBy: { updatedAt: "desc" },
            take: 1
          },
          _count: {
            select: {
              reports: true,
              assessments: true,
              vendors: true,
              models: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 12
      }),
      db.billingEvent.findMany({
        where: input.q
          ? {
              OR: [
                { stripeEventId: containsFilter },
                { type: containsFilter },
                { lastError: containsFilter }
              ]
            }
          : undefined,
        orderBy: [{ createdAt: "desc" }],
        take: 12
      }),
      db.leadSubmission.findMany({
        where: input.q
          ? {
              OR: [
                { email: containsFilter },
                { companyName: containsFilter },
                { source: containsFilter },
                { requestedPlanCode: containsFilter }
              ]
            }
          : undefined,
        orderBy: [{ submittedAt: "desc" }],
        take: 12
      }),
      Promise.all([
        db.productAnalyticsEvent.count({
          where: {
            occurredAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        db.leadSubmission.count({
          where: {
            submittedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        db.billingEvent.count({
          where: {
            status: BillingEventStatus.FAILED
          }
        }),
        db.emailNotification.count({
          where: {
            status: EmailNotificationStatus.FAILED
          }
        }),
        db.domainEvent.count({
          where: {
            status: {
              in: [DomainEventStatus.FAILED, DomainEventStatus.PENDING]
            }
          }
        }),
        db.webhookDelivery.count({
          where: {
            status: {
              in: [WebhookDeliveryStatus.FAILED, WebhookDeliveryStatus.RETRYING]
            }
          }
        })
      ]),
      db.operationsQueueItem.findMany({
        where: {
          queueType: OperationsQueueType.SUCCESS_RISK,
          OR: [{ sourceRecordType: "report" }, { sourceRecordType: "reportPackage" }],
          ...(input.q
            ? {
                OR: [
                  { title: containsFilter },
                  { summary: containsFilter },
                  { ruleCode: containsFilter },
                  { sourceRecordId: containsFilter },
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
          }
        },
        orderBy: [{ lastDetectedAt: "desc" }, { createdAt: "desc" }],
        take: 8
      }),
      listDeliveryMismatchFindings({
        db,
        limit: 80
      }),
      listFulfillmentVisibilityEntries({
        db,
        q: input.q,
        limit: 16
      })
    ]);

  const fulfillmentVisibilitySummary = buildFulfillmentVisibilitySummary(
    fulfillmentVisibilityEntries
  );

  const recentGlobalMismatchFindings = rawGlobalMismatchFindings
    .filter((finding) =>
      matchesGlobalOpsSearch(input.q, [
        finding.code,
        finding.title,
        finding.summary,
        finding.organization.name,
        finding.organization.slug,
        finding.linkage.stripeEventId,
        finding.linkage.externalExecutionId,
        finding.linkage.billingEventId,
        finding.linkage.routingSnapshotId,
        finding.linkage.workflowDispatchId
      ])
    )
    .slice(0, 8);

  const supportSafeAccountSummaries = await Promise.all(
    organizations.map(async (organization) => {
      const currentSubscription = await getCurrentSubscription(organization.id);
      const usage = await getOrganizationUsageSnapshot(organization.id);
      const ownerMembership = getPrimaryOwnerMembership(organization.members);
      const latestLead = organization.leadSubmissions[0] ?? null;
      const latestReport = organization.reports[0] ?? null;
      const latestAssessment = organization.assessments[0] ?? null;
      const supportSafePlanCode = resolveSupportSafePlanCode({
        planCode: currentSubscription?.planCodeSnapshot ?? currentSubscription?.plan.code ?? null,
        canonicalPlanKey: currentSubscription?.canonicalPlanKeySnapshot ?? null
      });
      const supportSafePlan =
        getCanonicalCommercialPlanDefinition(supportSafePlanCode);
      const supportSafeLeadPlanCode = resolveSupportSafePlanCode({
        planCode: latestLead?.requestedPlanCode ?? null
      });

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        slug: organization.slug,
        ownerEmail: ownerMembership?.user.email ?? null,
        billing: {
          planName:
            supportSafePlan?.displayName ??
            currentSubscription?.plan.name ??
            "No active plan",
          planCode: supportSafePlan?.code ?? "none",
          status: currentSubscription?.status ?? null,
          accessState: currentSubscription?.accessState ?? null,
          renewsAt: currentSubscription?.currentPeriodEnd ?? null,
          lastPaymentFailureMessage: currentSubscription?.lastPaymentFailureMessage ?? null
        },
        usage: {
          activeMembersCount: usage.activeMembersCount,
          activeAssessmentsCount: usage.activeAssessmentsCount,
          reportsCount: usage.reportsCount,
          lastActivityAt: usage.lastActivityAt
        },
        product: {
          latestAssessmentName: latestAssessment?.name ?? null,
          latestReportTitle: latestReport?.title ?? null,
          monitoredAssetsCount: organization._count.vendors + organization._count.models
        },
        lead: latestLead
          ? {
              email: latestLead.email,
              source: latestLead.source,
              stage: latestLead.stage,
              requestedPlanCode:
                supportSafeLeadPlanCode ?? latestLead.requestedPlanCode,
              submittedAt: latestLead.submittedAt
            }
          : null
      };
    })
  );

  return {
    supportSafeAccountSummaries,
    recentBillingEvents,
    recentLeadSubmissions,
    globalOpsDashboard: {
      counts: {
        recentMismatchFindings: recentGlobalMismatchFindings.length,
        recentDeliveryOpsFindings: recentDeliveryOpsQueueItems.length,
        recentFulfillmentAttentionFindings:
          fulfillmentVisibilitySummary.counts.attention,
        recentFulfillmentRecovered:
          fulfillmentVisibilitySummary.counts.recovered
      },
      recentMismatchFindings: recentGlobalMismatchFindings,
      recentFulfillmentAttentionFindings:
        fulfillmentVisibilitySummary.recentAttention,
      recentFulfillmentRecovered:
        fulfillmentVisibilitySummary.recentRecovered,
      recentDeliveryOpsFindings: recentDeliveryOpsQueueItems.map((finding) => ({
        id: finding.id,
        organizationId: finding.organizationId,
        organizationName: finding.organization.name,
        organizationSlug: finding.organization.slug,
        queueType: finding.queueType,
        ruleCode: finding.ruleCode,
        title: finding.title,
        summary: finding.summary,
        recommendedAction: finding.recommendedAction,
        severity: finding.severity,
        status: finding.status,
        sourceRecordType: finding.sourceRecordType,
        sourceRecordId: finding.sourceRecordId,
        lastDetectedAt: finding.lastDetectedAt
      }))
    },
    configSummary: {
      authMode: getAuthMode(),
      stripeConfigured: hasStripeBillingConfig(),
      adminEmailCount: getOptionalListEnv("INTERNAL_ADMIN_EMAILS").length,
      webhookDestinationsConfigured: webhookDestinations.length,
      opsAlertsConfigured: Boolean(getOptionalEnv("OPS_ALERT_WEBHOOK_URL")),
      cronConfigured: Boolean(getOptionalEnv("CRON_SECRET")),
      outboundDispatchConfigured: Boolean(getOptionalEnv("OUTBOUND_DISPATCH_SECRET")),
      featureFlags
    },
    growthSummary: {
      analyticsEventsLast7Days: analyticsCounts[0],
      leadsLast7Days: analyticsCounts[1],
      failedBillingEvents: analyticsCounts[2],
      failedEmails: analyticsCounts[3],
      unresolvedDomainEvents: analyticsCounts[4],
      blockedWebhookDeliveries: analyticsCounts[5]
    },
    opsReadiness
  };
}

export function getLeadStageLabel(stage: LeadSubmissionStatus) {
  return stage.toLowerCase().replaceAll("_", " ");
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus | null) {
  return status ? status.toLowerCase().replaceAll("_", " ") : "none";
}
