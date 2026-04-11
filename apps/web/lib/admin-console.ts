import {
  BillingEventStatus,
  DomainEventStatus,
  EmailNotificationStatus,
  LeadSubmissionStatus,
  Prisma,
  SubscriptionStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import { getCurrentSubscription, hasStripeBillingConfig } from "./billing";
import { getFeatureFlags } from "./feature-flags";
import { getOpsReadinessSnapshot } from "./ops-readiness";
import { getPrimaryOwnerMembership } from "./roles";
import { getOutboundWebhookDestinations } from "./webhook-dispatcher";
import { getOptionalEnv, getOptionalListEnv } from "./runtime-config";
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

export async function getAdminConsoleScaleSnapshot(input: {
  q: string;
  db?: AdminConsoleDbClient;
}) {
  const db = input.db ?? prisma;
  const containsFilter = buildContainsFilter(input.q);
  const featureFlags = getFeatureFlags();
  const webhookDestinations = getOutboundWebhookDestinations();
  const opsReadiness = await getOpsReadinessSnapshot();

  const [organizations, recentBillingEvents, recentLeadSubmissions, analyticsCounts] =
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
      ])
    ]);

  const supportSafeAccountSummaries = await Promise.all(
    organizations.map(async (organization) => {
      const currentSubscription = await getCurrentSubscription(organization.id);
      const usage = await getOrganizationUsageSnapshot(organization.id);
      const ownerMembership = getPrimaryOwnerMembership(organization.members);
      const latestLead = organization.leadSubmissions[0] ?? null;
      const latestReport = organization.reports[0] ?? null;
      const latestAssessment = organization.assessments[0] ?? null;

      return {
        organizationId: organization.id,
        organizationName: organization.name,
        slug: organization.slug,
        ownerEmail: ownerMembership?.user.email ?? null,
        billing: {
          planName: currentSubscription?.plan.name ?? "No active plan",
          planCode: currentSubscription?.plan.code ?? currentSubscription?.planCodeSnapshot ?? "none",
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
              requestedPlanCode: latestLead.requestedPlanCode,
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
    configSummary: {
      authMode: getOptionalEnv("AUTH_MODE") ?? "demo",
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
