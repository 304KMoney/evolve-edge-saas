import { BillingAccessState, Prisma, SubscriptionStatus, prisma } from "@evolve-edge/db";
import { getOrganizationActivationSnapshot } from "./activation";
import { getCurrentSubscription } from "./billing";
import { getOrganizationEntitlements } from "./entitlements";
import { getPrimaryOwnerMembership } from "./roles";
import { getOrganizationRetentionSnapshot } from "./retention";
import { getOrganizationUsageSnapshot } from "./usage";
import { getOrganizationUsageMeteringSnapshot } from "./usage-metering";

type CustomerLifecycleDbClient = Prisma.TransactionClient | typeof prisma;

function formatGrowthStage(input: {
  hasLead: boolean;
  hasOrganization: boolean;
  hasLiveSubscription: boolean;
  isActivated: boolean;
  isReadOnly: boolean;
}) {
  if (input.isReadOnly) {
    return "retention_recovery" as const;
  }

  if (input.isActivated) {
    return "activated" as const;
  }

  if (input.hasLiveSubscription) {
    return "paying_unactivated" as const;
  }

  if (input.hasOrganization) {
    return "workspace_created" as const;
  }

  if (input.hasLead) {
    return "lead_captured" as const;
  }

  return "unknown" as const;
}

export type CustomerLifecycleSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    ownerEmail: string | null;
    createdAt: Date;
    onboardingCompletedAt: Date | null;
  };
  lead: {
    email: string;
    source: string;
    stage: string;
    requestedPlanCode: string | null;
    pricingContext: string | null;
    submittedAt: Date;
  } | null;
  billing: {
    planName: string;
    planCode: string;
    workspaceMode: string;
    subscriptionStatus: SubscriptionStatus | null;
    accessState: BillingAccessState | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    lastPaymentFailureMessage: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  usage: Awaited<ReturnType<typeof getOrganizationUsageSnapshot>>;
  activation: Awaited<ReturnType<typeof getOrganizationActivationSnapshot>>;
  retention: ReturnType<typeof getOrganizationRetentionSnapshot>;
  usageMetering: Awaited<ReturnType<typeof getOrganizationUsageMeteringSnapshot>>;
  analytics: {
    productEventsLast30Days: number;
    upgradeEventsLast30Days: number;
    usageLimitEventsLast30Days: number;
  };
  growthStage:
    | "lead_captured"
    | "workspace_created"
    | "paying_unactivated"
    | "activated"
    | "retention_recovery"
    | "unknown";
};

export async function getCustomerLifecycleSnapshot(
  organizationId: string,
  db: CustomerLifecycleDbClient = prisma
): Promise<CustomerLifecycleSnapshot | null> {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
      _count: {
        select: {
          vendors: true,
          models: true
        }
      }
    }
  });

  if (!organization) {
    return null;
  }

  const ownerMembership = getPrimaryOwnerMembership(organization.members);

  const [entitlements, currentSubscription, usage, findingsCount, analyticsCounts] =
    await Promise.all([
      getOrganizationEntitlements(organizationId),
      getCurrentSubscription(organizationId),
      getOrganizationUsageSnapshot(organizationId),
      db.finding.count({
        where: {
          assessment: {
            organizationId
          }
        }
      }),
      Promise.all([
        db.productAnalyticsEvent.count({
          where: {
            organizationId,
            occurredAt: {
              gte: last30Days
            }
          }
        }),
        db.productAnalyticsEvent.count({
          where: {
            organizationId,
            name: "revenue.upgrade_completed",
            occurredAt: {
              gte: last30Days
            }
          }
        }),
        db.productAnalyticsEvent.count({
          where: {
            organizationId,
            name: "usage.limit_reached",
            occurredAt: {
              gte: last30Days
            }
          }
        })
      ])
    ]);
  const activation = await getOrganizationActivationSnapshot(
    organizationId,
    entitlements,
    db
  );
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    organizationId,
    entitlements.planCode,
    db
  );
  const retention = getOrganizationRetentionSnapshot({
    entitlements,
    activation,
    usageMetering,
    assessmentsCount: usage.assessmentsCount,
    reportsCount: usage.reportsCount,
    findingsCount,
    monitoredAssetsCount: organization._count.vendors + organization._count.models,
    memberCount: organization.members.length,
    currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
    hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
  });

  const latestLead = organization.leadSubmissions[0] ?? null;

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      ownerEmail: ownerMembership?.user.email ?? null,
      createdAt: organization.createdAt,
      onboardingCompletedAt: organization.onboardingCompletedAt
    },
    lead: latestLead
      ? {
          email: latestLead.email,
          source: latestLead.source,
          stage: latestLead.stage,
          requestedPlanCode: latestLead.requestedPlanCode,
          pricingContext: latestLead.pricingContext,
          submittedAt: latestLead.submittedAt
        }
      : null,
    billing: {
      planName: entitlements.planName,
      planCode: entitlements.planCode,
      workspaceMode: entitlements.workspaceMode,
      subscriptionStatus:
        entitlements.subscriptionStatus === "NONE"
          ? null
          : entitlements.subscriptionStatus,
      accessState:
        entitlements.billingAccessState === "NONE"
          ? null
          : entitlements.billingAccessState,
      currentPeriodEnd: entitlements.currentPeriodEnd,
      trialEndsAt: entitlements.trialEndsAt,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      lastPaymentFailureMessage: currentSubscription?.lastPaymentFailureMessage ?? null,
      stripeCustomerId: currentSubscription?.stripeCustomerId ?? null,
      stripeSubscriptionId: currentSubscription?.stripeSubscriptionId ?? null
    },
    usage,
    activation,
    retention,
    usageMetering,
    analytics: {
      productEventsLast30Days: analyticsCounts[0],
      upgradeEventsLast30Days: analyticsCounts[1],
      usageLimitEventsLast30Days: analyticsCounts[2]
    },
    growthStage: formatGrowthStage({
      hasLead: Boolean(latestLead),
      hasOrganization: true,
      hasLiveSubscription: entitlements.hasLiveSubscription,
      isActivated: activation.isActivated,
      isReadOnly: entitlements.isReadOnly
    })
  };
}
