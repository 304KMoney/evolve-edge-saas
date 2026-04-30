import { randomBytes } from "node:crypto";
import Link from "next/link";
import {
  EntitlementOverrideSource,
  Prisma,
  UserRole,
  hashOpaqueToken,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import {
  getSessionAuthorizationContext,
  requireCurrentSession,
  requireOrganizationPermission,
  requireOrganizationRole
} from "../../../lib/auth";
import {
  canViewUsage,
  canManageInventoryWithContext,
  canManageOrganizationBilling,
  canManageOrganizationMembers,
  canViewBilling
} from "../../../lib/authorization";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import {
  BillingAdminError,
  createEntitlementOverride,
  expireEntitlementOverride,
  getOrganizationBillingManagementSnapshot,
  setOrganizationBillingOwner,
  setOrganizationMembershipBillingAdmin
} from "../../../lib/billing-admin";
import {
  formatPriceCents,
  formatBillingAccessState,
  getPlanDisplaySummary,
  getCurrentSubscription,
  getLatestSubscription,
  getSubscriptionLifecycleLabel,
  hasStripeBillingConfig,
  listBillablePlans
} from "../../../lib/billing";
import { getCanonicalPublicPriceLabelForCadence } from "../../../lib/canonical-domain";
import {
  getCanonicalCommercialPlanDefinition,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "../../../lib/commercial-catalog";
import { getPostBillingNextAction } from "../../../lib/conversion-funnel";
import { publishDomainEvents } from "../../../lib/domain-events";
import { queueEmailNotification } from "../../../lib/email";
import { getOrganizationEntitlements, requireEntitlement } from "../../../lib/entitlements";
import { getExpansionOffers } from "../../../lib/expansion-engine";
import { getOrganizationActivationSnapshot } from "../../../lib/activation";
import { shouldBlockDemoExternalSideEffects } from "../../../lib/demo-mode";
import { logServerEvent } from "../../../lib/monitoring";
import { trackProductAnalyticsEvent } from "../../../lib/product-analytics";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import { getPlanTransitionDirection } from "../../../lib/revenue-catalog";
import { getOrganizationRetentionSnapshot } from "../../../lib/retention";
import { getAppUrl } from "../../../lib/runtime-config";
import { buildUsageThresholdEvents, getOrganizationUsageSnapshot } from "../../../lib/usage";
import {
  dispatchPendingWebhookDeliveries,
  getFailedWebhookDeliveries
} from "../../../lib/webhook-dispatcher";
import { UsageMeterGrid } from "../../../components/usage-meter-grid";
import { RetentionOverview } from "../../../components/retention-overview";
import { UpsellOfferStack } from "../../../components/upsell-offer-stack";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageThresholdEventMetricKey
} from "../../../lib/usage-metering";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
function formatDateTime(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function renderSettingsRuntimeCompatibilityFallback(input: {
  organizationName: string;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Billing & Settings</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Workspace controls temporarily limited
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">
              {input.organizationName} is reachable, but some billing and
              operational support records are unavailable in this deployment.
              Settings is staying in a safe read-only fallback until the
              production database schema is aligned with the current Prisma
              client.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-warning">
          Billing management, usage controls, and workflow diagnostics are
          intentionally hidden in this fallback view to avoid partial writes
          against an incompatible production schema.
        </div>
      </div>
    </main>
  );
}

async function addMemberAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("members.manage");
  await requireEntitlement(session.organization!.id, "members.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const requestContext = await getServerAuditRequestContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as UserRole;
  const isBillingAdmin = formData.get("isBillingAdmin") === "on";

  if (!email) {
    redirect("/dashboard/settings?error=member");
  }

  if (isBillingAdmin && session.organization?.role !== "OWNER") {
    redirect("/dashboard/settings?error=billing-admin");
  }

  const entitlements = await getOrganizationEntitlements(session.organization!.id);

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email }
    });
    const user = existingUser
      ? await tx.user.update({
          where: { email },
          data: {
            firstName: firstName || undefined,
            lastName: lastName || undefined
          }
        })
      : await tx.user.create({
          data: {
            email,
            firstName: firstName || null,
            lastName: lastName || null
          }
        });

    const existingMembership = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organization!.id,
          userId: user.id
        }
      }
    });

    if (!existingMembership && !entitlements.hasSeatCapacity) {
      redirect("/dashboard/settings?error=seat-limit");
    }

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: session.organization!.id,
          userId: user.id
        }
      },
      update: { role, isBillingAdmin },
      create: {
        organizationId: session.organization!.id,
        userId: user.id,
        role,
        isBillingAdmin
      }
    });

    const events = [];

    if (!existingUser) {
      events.push({
        type: "user.created",
        aggregateType: "user",
        aggregateId: user.id,
        userId: user.id,
        idempotencyKey: `user.created:${user.id}`,
        payload: {
          userId: user.id,
          email: user.email,
          source: "settings.add-member"
        } satisfies Prisma.InputJsonValue
      });
    }

    if (!existingMembership) {
      events.push({
        type: "membership.added",
        aggregateType: "organizationMember",
        aggregateId: `${session.organization!.id}:${user.id}`,
        orgId: session.organization!.id,
        userId: user.id,
        idempotencyKey: `membership.added:${session.organization!.id}:${user.id}`,
        payload: {
          organizationId: session.organization!.id,
          userId: user.id,
          role,
          source: "settings.add-member"
        } satisfies Prisma.InputJsonValue
      });
    }

    if (events.length > 0) {
      await publishDomainEvents(tx, events);
    }

    const membershipCount = await tx.organizationMember.count({
      where: { organizationId: session.organization!.id }
    });

    const subscription = await tx.subscription.findFirst({
      where: { organizationId: session.organization!.id },
      include: { plan: true },
      orderBy: { createdAt: "desc" }
    });

    const usageEvents = buildUsageThresholdEvents({
      metric: "seats",
      used: membershipCount,
      limit: subscription?.plan.seatsLimit ?? null,
      organizationId: session.organization!.id
    });

    if (usageEvents.length > 0) {
      await publishDomainEvents(tx, usageEvents);
    }

    for (const event of usageEvents) {
      const thresholdPercent =
        typeof event.payload === "object" &&
        event.payload &&
        "thresholdPercent" in event.payload
          ? Number((event.payload as Record<string, unknown>).thresholdPercent)
          : 0;

      if (thresholdPercent >= 100) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "usage.limit_reached",
          payload: {
            metric: "seats",
            thresholdPercent,
            limit: subscription?.plan.seatsLimit ?? null,
            used: membershipCount
          },
          source: "settings-members",
          path: "/dashboard/settings",
          session,
          organizationId: session.organization!.id,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }
    }

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: existingMembership ? "membership.role_updated" : "membership.added",
      entityType: "organizationMember",
      entityId: `${session.organization!.id}:${user.id}`,
      metadata: {
        memberEmail: user.email,
        previousRole: existingMembership?.role ?? null,
        nextRole: role,
        previousIsBillingAdmin: existingMembership?.isBillingAdmin ?? null,
        nextIsBillingAdmin: isBillingAdmin,
        isNewMember: !existingMembership
      },
      requestContext
    });
  });

  redirect("/dashboard/settings?member=created");
}

async function createInviteAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("members.manage");
  await requireEntitlement(session.organization!.id, "members.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const requestContext = await getServerAuditRequestContext();
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const email = String(formData.get("inviteEmail") ?? "").trim().toLowerCase();
  const role = String(formData.get("inviteRole") ?? "MEMBER") as UserRole;
  const isBillingAdmin = formData.get("isBillingAdmin") === "on";

  if (!email) {
    redirect("/dashboard/settings?error=invite");
  }

  if (isBillingAdmin && session.organization?.role !== "OWNER") {
    redirect("/dashboard/settings?error=billing-admin");
  }

  if (!entitlements.hasSeatCapacity) {
    redirect("/dashboard/settings?error=seat-limit");
  }

  const token = randomBytes(32).toString("base64url");

  const inviteUrl = `${getAppUrl()}/invite/${token}`;

  await prisma.$transaction(async (tx) => {
    await tx.organizationInvite.deleteMany({
      where: {
        organizationId: session.organization!.id,
        email,
        status: "PENDING"
      }
    });

    const invite = await tx.organizationInvite.create({
      data: {
        organizationId: session.organization!.id,
        email,
        role,
        isBillingAdmin,
        invitedByUserId: session.user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    await queueEmailNotification(tx, {
      templateKey: "invite",
      recipientEmail: email,
      orgId: session.organization!.id,
      userId: session.user.id,
      idempotencyKey: `email:invite:${invite.id}`,
      payload: {
        organizationName: session.organization!.name,
        inviterName: `${session.user.firstName} ${session.user.lastName}`.trim(),
        inviteUrl
      }
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "membership.invite_created",
      entityType: "organizationInvite",
      entityId: invite.id,
      metadata: {
        inviteeEmail: email,
        role
      },
      requestContext
    });
  });

  redirect(`/dashboard/settings?invite=created&inviteEmail=${encodeURIComponent(email)}&inviteToken=${encodeURIComponent(token)}`);
}

async function updateMemberRoleAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("members.manage");
  await requireEntitlement(session.organization!.id, "members.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const requestContext = await getServerAuditRequestContext();
  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "MEMBER") as UserRole;

  const membership = await prisma.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId: session.organization!.id
    }
  });

  if (!membership) {
    redirect("/dashboard/settings?error=member");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.organization!.id },
    select: { billingOwnerUserId: true }
  });

  if (
    organization?.billingOwnerUserId === membership.userId &&
    role !== "OWNER" &&
    !membership.isBillingAdmin
  ) {
    redirect("/dashboard/settings?error=billing-owner-role");
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: memberId },
      data: { role }
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "membership.role_updated",
      entityType: "organizationMember",
      entityId: memberId,
      metadata: {
        affectedUserId: membership.userId,
        previousRole: membership.role,
        nextRole: role,
        isBillingAdmin: membership.isBillingAdmin
      },
      requestContext
    });
  });

  redirect("/dashboard/settings?member=updated");
}

async function updateMemberBillingAdminAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationRole(["OWNER"]);
  const requestContext = await getServerAuditRequestContext();
  const memberId = String(formData.get("memberId") ?? "");
  const isBillingAdmin = String(formData.get("isBillingAdmin") ?? "") === "true";

  try {
    await setOrganizationMembershipBillingAdmin({
      organizationId: session.organization!.id,
      memberId,
      isBillingAdmin,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      requestContext
    });
  } catch (error) {
    if (error instanceof BillingAdminError) {
      redirect(
        `/dashboard/settings?error=${encodeURIComponent(error.message)}` as never
      );
    }

    throw error;
  }

  redirect(
    `/dashboard/settings?memberBillingAdmin=${isBillingAdmin ? "granted" : "revoked"}`
  );
}

async function assignBillingOwnerAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationRole(["OWNER"]);
  const requestContext = await getServerAuditRequestContext();
  const targetUserId = String(formData.get("targetUserId") ?? "");

  try {
    await setOrganizationBillingOwner({
      organizationId: session.organization!.id,
      targetUserId,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      requestContext
    });
  } catch (error) {
    if (error instanceof BillingAdminError) {
      redirect(
        `/dashboard/settings?error=${encodeURIComponent(error.message)}` as never
      );
    }

    throw error;
  }

  redirect("/dashboard/settings?billingOwner=updated");
}

async function createEntitlementOverrideAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("billing.manage");
  const requestContext = await getServerAuditRequestContext();
  const entitlementKey = String(formData.get("entitlementKey") ?? "").trim();
  const source = String(formData.get("source") ?? EntitlementOverrideSource.MANUAL);
  const overrideType = String(formData.get("overrideType") ?? "feature");
  const enabledValue = String(formData.get("enabled") ?? "");
  const limitOverride = String(formData.get("limitOverride") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();

  try {
    await createEntitlementOverride({
      organizationId: session.organization!.id,
      entitlementKey,
      source,
      enabled:
        overrideType === "feature" && enabledValue
          ? enabledValue === "true"
          : null,
      limitOverride: overrideType === "limit" ? limitOverride : null,
      reason,
      expiresAt: expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59.999Z`) : null,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      requestContext
    });
  } catch (error) {
    if (error instanceof BillingAdminError) {
      redirect(
        `/dashboard/settings?error=${encodeURIComponent(error.message)}` as never
      );
    }

    throw error;
  }

  redirect("/dashboard/settings?override=created");
}

async function expireEntitlementOverrideAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("billing.manage");
  const requestContext = await getServerAuditRequestContext();
  const overrideId = String(formData.get("overrideId") ?? "");

  try {
    await expireEntitlementOverride({
      organizationId: session.organization!.id,
      overrideId,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      requestContext
    });
  } catch (error) {
    if (error instanceof BillingAdminError) {
      redirect(
        `/dashboard/settings?error=${encodeURIComponent(error.message)}` as never
      );
    }

    throw error;
  }

  redirect("/dashboard/settings?override=expired");
}

async function revokeInviteAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("members.manage");
  await requireEntitlement(session.organization!.id, "members.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const requestContext = await getServerAuditRequestContext();
  const inviteId = String(formData.get("inviteId") ?? "");

  await prisma.$transaction(async (tx) => {
    await tx.organizationInvite.updateMany({
      where: {
        id: inviteId,
        organizationId: session.organization!.id,
        status: "PENDING"
      },
      data: {
        status: "REVOKED"
      }
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "membership.invite_revoked",
      entityType: "organizationInvite",
      entityId: inviteId,
      requestContext
    });
  });

  redirect("/dashboard/settings?invite=revoked");
}

async function addVendorAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("inventory.manage");
  await requireEntitlement(session.organization!.id, "monitoring.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const name = String(formData.get("vendorName") ?? "").trim();
  const category = String(formData.get("vendorCategory") ?? "").trim();
  const riskNotes = String(formData.get("vendorRiskNotes") ?? "").trim();
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    entitlements.planCode
  );
  const monitoredAssetsMetric = usageMetering.metrics.find(
    (metric) => metric.key === "monitoredAssets"
  );

  if (!name) {
    redirect("/dashboard/settings?error=vendor");
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendor.create({
      data: {
        organizationId: session.organization!.id,
        name,
        category: category || null,
        riskNotes: riskNotes || null
      }
    });

    await tx.notification.create({
      data: {
        organizationId: session.organization!.id,
        type: "vendor.created",
        title: "Vendor registry updated",
        body: `${name} was added to the vendor inventory.`,
        actionUrl: "/dashboard/settings"
      }
    });

    const usageEvents = buildUsageThresholdEvents({
      metric: getUsageThresholdEventMetricKey("monitoredAssets"),
      used: (monitoredAssetsMetric?.used ?? 0) + 1,
      limit: monitoredAssetsMetric?.limit ?? null,
      organizationId: session.organization!.id
    });

    if (usageEvents.length > 0) {
      await publishDomainEvents(tx, usageEvents);
    }

    for (const event of usageEvents) {
      const thresholdPercent =
        typeof event.payload === "object" &&
        event.payload &&
        "thresholdPercent" in event.payload
          ? Number((event.payload as Record<string, unknown>).thresholdPercent)
          : 0;

      if (thresholdPercent >= 100) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "usage.limit_reached",
          payload: {
            metric: getUsageThresholdEventMetricKey("monitoredAssets"),
            thresholdPercent,
            limit: monitoredAssetsMetric?.limit ?? null,
            used: (monitoredAssetsMetric?.used ?? 0) + 1
          },
          source: "settings-vendors",
          path: "/dashboard/settings",
          session,
          organizationId: session.organization!.id,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }
    }
  });

  redirect("/dashboard/settings?vendor=created");
}

async function addModelAction(formData: FormData) {
  "use server";

  const session = await requireOrganizationPermission("inventory.manage");
  await requireEntitlement(session.organization!.id, "monitoring.manage", {
    failureRedirect: "/dashboard/settings?error=plan"
  });
  const name = String(formData.get("modelName") ?? "").trim();
  const provider = String(formData.get("modelProvider") ?? "").trim();
  const usageContext = String(formData.get("modelUsageContext") ?? "").trim();
  const riskNotes = String(formData.get("modelRiskNotes") ?? "").trim();
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    entitlements.planCode
  );
  const monitoredAssetsMetric = usageMetering.metrics.find(
    (metric) => metric.key === "monitoredAssets"
  );

  if (!name || !provider) {
    redirect("/dashboard/settings?error=model");
  }

  await prisma.$transaction(async (tx) => {
    await tx.aIModel.create({
      data: {
        organizationId: session.organization!.id,
        name,
        provider,
        usageContext: usageContext || null,
        riskNotes: riskNotes || null
      }
    });

    await tx.notification.create({
      data: {
        organizationId: session.organization!.id,
        type: "model.created",
        title: "AI model registry updated",
        body: `${name} from ${provider} was added to the model inventory.`,
        actionUrl: "/dashboard/settings"
      }
    });

    const usageEvents = buildUsageThresholdEvents({
      metric: getUsageThresholdEventMetricKey("monitoredAssets"),
      used: (monitoredAssetsMetric?.used ?? 0) + 1,
      limit: monitoredAssetsMetric?.limit ?? null,
      organizationId: session.organization!.id
    });

    if (usageEvents.length > 0) {
      await publishDomainEvents(tx, usageEvents);
    }

    for (const event of usageEvents) {
      const thresholdPercent =
        typeof event.payload === "object" &&
        event.payload &&
        "thresholdPercent" in event.payload
          ? Number((event.payload as Record<string, unknown>).thresholdPercent)
          : 0;

      if (thresholdPercent >= 100) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "usage.limit_reached",
          payload: {
            metric: getUsageThresholdEventMetricKey("monitoredAssets"),
            thresholdPercent,
            limit: monitoredAssetsMetric?.limit ?? null,
            used: (monitoredAssetsMetric?.used ?? 0) + 1
          },
          source: "settings-models",
          path: "/dashboard/settings",
          session,
          organizationId: session.organization!.id,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }
    }
  });

  redirect("/dashboard/settings?model=created");
}

async function dispatchWebhooksAction() {
  "use server";

  const session = await requireOrganizationPermission("billing.manage");
  const requestContext = await getServerAuditRequestContext();
  await dispatchPendingWebhookDeliveries({ limit: 25 });
  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "admin.webhook_dispatch_requested",
    entityType: "organization",
    entityId: session.organization!.id,
    requestContext
  });
  redirect("/dashboard/settings?deliveries=run");
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    member?: string;
    invite?: string;
    inviteEmail?: string;
    inviteToken?: string;
    billing?: string;
    planCode?: string;
    billingCadence?: string;
    vendor?: string;
    model?: string;
    deliveries?: string;
    memberBillingAdmin?: string;
    billingOwner?: string;
    override?: string;
  }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const authz = getSessionAuthorizationContext(session);
  const loadSettingsData = async () => {
    const [
      organization,
      entitlements,
      usage,
      subscription,
      plans,
      failedDeliveries,
      findingsCount,
      params,
      billingAdminSnapshot,
      currentStripeSubscription
    ] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: session.organization!.id },
        include: {
          members: {
            include: { user: true },
            orderBy: { createdAt: "asc" }
          },
          invites: {
            orderBy: { createdAt: "desc" }
          },
          vendors: {
            orderBy: { createdAt: "desc" }
          },
          models: {
            orderBy: { createdAt: "desc" }
          }
        }
      }),
      getOrganizationEntitlements(session.organization!.id),
      getOrganizationUsageSnapshot(session.organization!.id),
      getLatestSubscription(session.organization!.id),
      listBillablePlans(),
      getFailedWebhookDeliveries({
        limit: 8,
        orgId: session.organization!.id
      }),
      prisma.finding.count({
        where: {
          assessment: {
            organizationId: session.organization!.id
          }
        }
      }),
      searchParams,
      getOrganizationBillingManagementSnapshot(session.organization!.id),
      getCurrentSubscription(session.organization!.id)
    ]);
    const usageMetering = await getOrganizationUsageMeteringSnapshot(
      session.organization!.id,
      entitlements.planCode
    );
    const activation = await getOrganizationActivationSnapshot(
      session.organization!.id,
      entitlements
    );

    return {
      organization,
      entitlements,
      usage,
      subscription,
      plans,
      failedDeliveries,
      findingsCount,
      params,
      billingAdminSnapshot,
      currentStripeSubscription,
      usageMetering,
      activation
    };
  };

  let loaded: Awaited<ReturnType<typeof loadSettingsData>> | null = null;

  try {
    loaded = await loadSettingsData();
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.settings", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.settings.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderSettingsRuntimeCompatibilityFallback({
      organizationName: session.organization!.name
    });
  }

  const {
    organization,
    entitlements,
    usage,
    subscription,
    plans,
    failedDeliveries,
    findingsCount,
    params,
    billingAdminSnapshot,
    currentStripeSubscription,
    usageMetering,
    activation
  } = loaded;
  const canManageMembers =
    canManageOrganizationMembers(authz) && entitlements.canManageMembers;
  const canManageBillingControls =
    canManageOrganizationBilling(authz) && entitlements.canManageBilling;
  const canViewBillingControls = canViewBilling(authz);
  const canViewUsageControls = canViewUsage(authz);
  const canManageInventoryControls = canManageInventoryWithContext(authz);
  const isWorkspaceOwner = session.organization!.role === "OWNER";
  const billingActionsBlockedInDemo = shouldBlockDemoExternalSideEffects();
  const currentPlanCode = subscription?.plan.code ?? entitlements.planCode;
  const upsellOffers = getExpansionOffers({
    placement: "settings",
    session,
    entitlements,
    usageMetering,
    currentPlanCode,
    hasStripeCustomer: Boolean(currentStripeSubscription?.stripeCustomerId)
  });
  const retention = getOrganizationRetentionSnapshot({
    entitlements,
    activation,
    usageMetering,
    assessmentsCount: usage.assessmentsCount,
    reportsCount: usage.reportsCount,
    findingsCount,
    monitoredAssetsCount:
      (organization?.vendors.length ?? 0) + (organization?.models.length ?? 0),
    memberCount: organization?.members.length ?? 0,
    currentPlanCode,
    hasStripeCustomer: Boolean(currentStripeSubscription?.stripeCustomerId)
  });
  const postBillingNextAction = getPostBillingNextAction({
    assessmentsCount: usage.assessmentsCount,
    reportsCount: usage.reportsCount,
    canGenerateReports: entitlements.canGenerateReports
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Billing & Settings</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Workspace controls
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        {params.error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            {params.error === "seat-limit"
              ? "The current plan has reached its seat limit. Upgrade billing or free a seat before adding another member."
              : params.error === "billing-admin"
                ? "Only workspace owners can grant or stage billing admin access."
                : params.error === "billing-owner-role"
                  ? "Reassign billing ownership or grant billing admin before demoting the current billing owner."
                  : decodeURIComponent(params.error)}
          </div>
        ) : null}

        {params.member ||
        params.invite ||
        params.vendor ||
        params.model ||
        params.deliveries ||
        params.memberBillingAdmin ||
        params.billingOwner ||
        params.override ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Workspace records were updated successfully.
          </div>
        ) : null}

        {params.billing === "success" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            <p>
              Billing checkout completed and the workspace subscription was reconciled successfully.
            </p>
            <p className="mt-2 text-sm text-emerald-800">
              Next step:{" "}
              <a href={postBillingNextAction.href} className="font-semibold underline">
                {postBillingNextAction.label}
              </a>
              . {postBillingNextAction.helperText}
            </p>
          </div>
        ) : null}

        {params.billing === "processing" ? (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
            Stripe checkout completed, but the final subscription sync is still processing. Refresh in a moment if the plan state has not updated yet.
          </div>
        ) : null}

        {params.billing === "cancelled" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Billing checkout was cancelled before Stripe finalized the subscription update. You can retry from the plan section below.
          </div>
        ) : null}

        {params.billing === "checkout-config" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Your workspace was created, but Stripe checkout is not fully configured yet. Add Stripe environment variables, then retry checkout from the plan section below.
          </div>
        ) : null}

        {params.billing === "checkout-error" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Your workspace was created, but checkout could not be started. Check Stripe plan mapping and retry from the plan section below.
          </div>
        ) : null}

        {params.billing === "portal-returned" ? (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
            Returned from the Stripe billing portal. Any plan or renewal changes will appear here after Stripe sync finishes.
          </div>
        ) : null}

        {params.billing === "demo-mode" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Billing changes are disabled in demo mode so the workspace can be presented safely without creating live Stripe activity.
          </div>
        ) : null}

        {params.billing === "error" || params.billing === "portal-error" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Billing request could not be completed. Check Stripe configuration and try again.
          </div>
        ) : null}

        {params.invite === "created" && params.inviteToken ? (
          <div className="mt-6 rounded-2xl border border-line bg-mist p-4 text-sm text-ink">
            Invite link for {params.inviteEmail}:{" "}
            <span className="font-mono">
              {`${getAppUrl()}/invite/${params.inviteToken}`}
            </span>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div id="billing-controls" className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Plan</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {entitlements.planName}
            </p>
            <p className="mt-2 text-sm text-steel">
              {subscription
                ? `${getSubscriptionLifecycleLabel(subscription)} • ${formatBillingAccessState(entitlements.billingAccessState === "NONE" ? undefined : entitlements.billingAccessState)}`
                : "No subscription has been synced yet"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {subscription?.currentPeriodEnd
                ? `Current term ends ${new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  }).format(subscription.currentPeriodEnd)}`
                : "No active renewal date yet"}
            </p>
            <p className="mt-3 text-sm text-steel">
              {entitlements.workspaceMode === "DEMO"
                ? "Demo mode leaves billing disabled so the seeded workspace stays explorable."
                : hasStripeBillingConfig()
                  ? "Billing integration is configured."
                  : "Billing still needs Stripe environment variables."}
            </p>
            {entitlements.isReadOnly ? (
              <p className="mt-3 text-sm text-warning">
                Billing is currently read-only. Existing data stays accessible, but new usage remains gated until the subscription returns to an active state.
              </p>
            ) : null}
            {subscription?.accessState === "PAST_DUE" ? (
              <p className="mt-3 text-sm text-warning">
                The latest invoice is past due. Restore payment in Stripe to return this workspace to full access.
              </p>
            ) : null}
            {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
              <p className="mt-3 text-sm text-steel">
                Cancellation is scheduled for the end of the current term on {formatDate(subscription.currentPeriodEnd)} unless it is reactivated in Stripe first.
              </p>
            ) : null}
            {canManageBillingControls ? (
              <div className="mt-4 space-y-3">
                {subscription?.stripeCustomerId ? (
                  billingActionsBlockedInDemo ? (
                    <Link
                      href="/dashboard/settings?billing=demo-mode#billing-controls"
                      className="inline-flex rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                    >
                      Billing disabled in demo
                    </Link>
                  ) : (
                    <form action="/api/billing/portal" method="post">
                      <input type="hidden" name="source" value="settings-primary-billing" />
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                      >
                        Open billing portal
                      </button>
                    </form>
                  )
                ) : null}
                <div className="grid gap-3">
                  {plans.map((plan) => (
                    (() => {
                      const canonicalPlanCode = resolveCanonicalPlanCodeFromRevenuePlanCode(plan.code);
                      const canonicalPlan = getCanonicalCommercialPlanDefinition(canonicalPlanCode);
                      const billingCadence =
                        plan.billingInterval === "monthly" ? "monthly" : "annual";
                      const isContactSalesPlan =
                        canonicalPlan?.billingMotion === "contact_sales";
                      const isCurrentPlan =
                        subscription?.planId === plan.id ||
                        (isContactSalesPlan &&
                          canonicalPlanCode !== null &&
                          resolveCanonicalPlanCodeFromRevenuePlanCode(
                            subscription?.plan.code ?? null
                          ) === canonicalPlanCode);
                      const priceLabel =
                        canonicalPlan && canonicalPlanCode
                          ? getCanonicalPublicPriceLabelForCadence(
                              canonicalPlanCode,
                              billingCadence
                            )
                          : formatPriceCents(plan.priceCents, plan.billingInterval);
                      const transitionDirection = getPlanTransitionDirection(
                        currentPlanCode,
                        plan.code
                      );

                      return (
                    <div
                      key={plan.id}
                      className="rounded-2xl border border-line bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {canonicalPlan?.displayName ?? plan.name}
                          </p>
                          <p className="mt-1 text-sm text-steel">
                            {priceLabel}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-steel">
                            {isContactSalesPlan
                              ? "Sales-led commercial packaging"
                              : billingCadence === "monthly"
                                ? "Billed monthly"
                                : "Billed annually"}
                          </p>
                          <p className="mt-1 text-sm text-steel">
                            {canonicalPlan
                              ? `Workflow ${canonicalPlan.workflowCode} - ${canonicalPlan.publicDescription}`
                              : getPlanDisplaySummary(plan)}
                          </p>
                        </div>
                        {isCurrentPlan ? (
                          <button
                            type="button"
                            disabled
                            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Current plan
                          </button>
                        ) : isContactSalesPlan ? (
                          <Link
                            href="/contact-sales?intent=enterprise-plan&source=settings-billing"
                            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                          >
                            Talk to sales
                          </Link>
                        ) : subscription?.stripeCustomerId &&
                          subscription?.stripeSubscriptionId ? (
                          <form action="/api/billing/portal" method="post">
                            <input
                              type="hidden"
                              name="source"
                              value={`settings-plan-change:${plan.code}`}
                            />
                            <button
                              type="submit"
                              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                            >
                              Manage in Stripe
                            </button>
                          </form>
                        ) : billingActionsBlockedInDemo ? (
                          <Link
                            href="/dashboard/settings?billing=demo-mode#billing-controls"
                            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                          >
                            Billing disabled in demo
                          </Link>
                        ) : (
                          <form action="/api/billing/checkout" method="post">
                            <input type="hidden" name="planCode" value={plan.code} />
                            <input
                              type="hidden"
                              name="billingCadence"
                              value={billingCadence}
                            />
                            <input
                              type="hidden"
                              name="source"
                              value={`settings-plan-selection:${plan.code}`}
                            />
                            <button
                              type="submit"
                              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                            >
                              {transitionDirection === "upgrade"
                                ? `Upgrade to ${billingCadence} billing`
                                : transitionDirection === "downgrade"
                                  ? `Move to ${billingCadence} billing`
                                  : `Choose ${billingCadence} plan`}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-steel">
                {!canViewBillingControls
                  ? "Only authorized workspace admins can view billing."
                  : !canManageBillingControls
                    ? "Only workspace owners or billing admins can manage billing changes."
                  : "Billing is unavailable until this workspace is moved out of demo or inactive mode."}
              </p>
            )}
          </div>

          <div id="billing-ownership" className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Billing ownership</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {billingAdminSnapshot.organization.billingOwnerName ?? "Not assigned"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {billingAdminSnapshot.organization.billingOwnerEmail ?? "Choose a workspace owner or billing admin to own billing contacts and plan actions."}
            </p>
            <p className="mt-2 text-sm text-steel">
              Billing admins:{" "}
              {billingAdminSnapshot.members.filter((member) => member.isBillingAdmin).length || "None"}
            </p>
            {isWorkspaceOwner ? (
              <form action={assignBillingOwnerAction} className="mt-4 flex flex-wrap gap-3">
                <select
                  name="targetUserId"
                  defaultValue={
                    billingAdminSnapshot.organization.billingOwnerUserId ??
                    billingAdminSnapshot.members[0]?.userId ??
                    ""
                  }
                  className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink"
                >
                  {billingAdminSnapshot.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName}
                      {member.isBillingAdmin ? " - Billing admin" : ""}
                      {member.role === "OWNER" ? " - Owner" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink"
                >
                  Save billing owner
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {canViewUsageControls ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Assessments</p>
              <p className="mt-2 text-xl font-semibold text-ink">
                {usage.assessmentsCount}
              </p>
              <p className="mt-2 text-sm text-steel">
                {entitlements.activeAssessmentsLimit
                  ? `${entitlements.activeAssessments} active of ${entitlements.activeAssessmentsLimit}`
                  : `${entitlements.activeAssessments} active`}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Reports</p>
              <p className="mt-2 text-xl font-semibold text-ink">
                {usage.reportsCount}
              </p>
              <p className="mt-2 text-sm text-steel">
                Executive deliverables generated for this workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Active Members</p>
              <p className="mt-2 text-xl font-semibold text-ink">
                {usage.activeMembersCount}
              </p>
              <p className="mt-2 text-sm text-steel">
                {entitlements.seatsLimit
                  ? `${entitlements.seatsUsagePercent ?? 0}% of seat allowance used`
                  : "Unlimited seats on current plan"}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Last Activity</p>
              <p className="mt-2 text-xl font-semibold text-ink">
                {usage.lastActivityAt ? formatDate(usage.lastActivityAt) : "No activity"}
              </p>
              <p className="mt-2 text-sm text-steel">
                Derived from the latest assessment, report, membership, subscription, or domain event.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-line bg-white p-5 text-sm text-steel">
            Usage visibility is limited to workspace owners, billing admins, admins, and analysts.
          </div>
        )}

        <div className="mt-6">
          <RetentionOverview
            retention={retention}
            title="Retention, renewal, and reactivation"
          />
        </div>

        {canViewUsageControls ? (
          <>
            <div id="usage-and-limits" className="mt-6">
              <UsageMeterGrid
                title="Usage and limits"
                description="Current plan utilization across the main recurring SaaS resources in this workspace."
                metrics={usageMetering.metrics.filter((metric) =>
                  [
                    "activeAssessments",
                    "reportsGenerated",
                    "monitoredAssets",
                    "seats",
                    "aiProcessingRuns",
                    "storageBytes"
                  ].includes(metric.key)
                )}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-line p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Quota windows</p>
                  <p className="mt-2 text-sm text-steel">
                    Backend-enforced monthly quotas derived from plan entitlements.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {billingAdminSnapshot.usageQuotas.map((quota) => (
                  <div key={quota.key} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-medium text-steel">{quota.label}</p>
                    <p className="mt-2 text-xl font-semibold text-ink">
                      {quota.used}
                      {quota.limit !== null ? ` / ${quota.limit}` : " / unlimited"}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Remaining: {quota.remaining ?? "Unlimited"}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Window: {formatDate(quota.periodStart)} - {formatDate(quota.periodEnd)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {canViewBillingControls ? (
          <div id="trust-center" className="mt-6 grid gap-4 lg:grid-cols-2">
            <div id="entitlement-breakdown" className="rounded-2xl border border-line p-5">
              <p className="text-lg font-semibold text-ink">Entitlement breakdown</p>
              <p className="mt-2 text-sm text-steel">
                Plan-derived feature access and limits, with active override sources shown inline.
              </p>
              <div className="mt-4 space-y-3">
                {billingAdminSnapshot.entitlementBreakdown.map((entry) => (
                  <div key={`${entry.kind}:${entry.key}`} className="rounded-2xl bg-mist p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{entry.label}</p>
                        <p className="mt-1 text-sm text-steel">
                          {entry.kind === "feature"
                            ? entry.value
                              ? "Enabled"
                              : "Disabled"
                            : entry.value ?? "Unlimited"}
                        </p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                        {entry.kind === "feature" ? "Feature" : "Limit"}
                      </p>
                    </div>
                    {entry.overrideSources.length > 0 ? (
                      <p className="mt-2 text-sm text-accent">
                        Override: {entry.overrideSources.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-line p-5">
              <p className="text-lg font-semibold text-ink">Enterprise overrides</p>
              <p className="mt-2 text-sm text-steel">
                Manual, enterprise, and promo overrides apply on top of the canonical plan model and are audited on every change.
              </p>
              <div className="mt-4 space-y-3">
                {billingAdminSnapshot.activeOverrides.length > 0 ? (
                  billingAdminSnapshot.activeOverrides.map((override) => (
                    <div key={override.id} className="rounded-2xl bg-mist p-4">
                      <p className="text-sm font-semibold text-ink">{override.label}</p>
                      <p className="mt-1 text-sm text-steel">
                        {override.source} |{" "}
                        {override.enabled === null
                          ? `Limit ${override.limitOverride ?? "unset"}`
                          : override.enabled
                            ? "Enabled"
                            : "Disabled"}
                      </p>
                      <p className="mt-2 text-sm text-steel">
                        Expires: {formatDateTime(override.expiresAt)} | Created by{" "}
                        {override.createdByEmail ?? "system"}
                      </p>
                      {override.reason ? (
                        <p className="mt-2 text-sm text-steel">{override.reason}</p>
                      ) : null}
                      {!override.isExpired && canManageBillingControls ? (
                        <form action={expireEntitlementOverrideAction} className="mt-3">
                          <input type="hidden" name="overrideId" value={override.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                          >
                            Expire override
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                    No manual or enterprise overrides are active for this workspace.
                  </div>
                )}
              </div>

              {canManageBillingControls ? (
                <form action={createEntitlementOverrideAction} className="mt-5 grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      name="overrideType"
                      defaultValue="feature"
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                    >
                      <option value="feature">Feature override</option>
                      <option value="limit">Limit override</option>
                    </select>
                    <select
                      name="source"
                      defaultValue={EntitlementOverrideSource.MANUAL}
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                    >
                      <option value={EntitlementOverrideSource.MANUAL}>Manual</option>
                      <option value={EntitlementOverrideSource.ENTERPRISE}>Enterprise</option>
                      <option value={EntitlementOverrideSource.PROMO}>Promo</option>
                    </select>
                  </div>
                  <input
                    name="entitlementKey"
                    placeholder="billing.portal or users"
                    className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      name="enabled"
                      defaultValue="true"
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                    >
                      <option value="true">Enable feature</option>
                      <option value="false">Disable feature</option>
                    </select>
                    <input
                      name="limitOverride"
                      placeholder="Numeric limit for limit overrides"
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <input
                    type="date"
                    name="expiresAt"
                    className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                  />
                  <textarea
                    name="reason"
                    rows={3}
                    placeholder="Why is this override required?"
                    className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-fit rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                  >
                    Save override
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ) : null}

        {upsellOffers.length > 0 ? (
          <div className="mt-6">
            <UpsellOfferStack
              offers={upsellOffers}
              title="Billing and expansion"
              description="Settings is the commercial control center, so expansion offers here focus on seats, asset growth, support tiers, and owner-safe upgrade actions."
            />
          </div>
        ) : null}

        {entitlements.isSeatLimitReached || entitlements.isAssessmentLimitReached ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            {entitlements.isSeatLimitReached
              ? "Seat usage has reached the current plan limit."
              : "Active assessments have reached the current plan limit."}{" "}
            This workspace will stay read-only for that resource until billing is upgraded or usage is reduced.
          </div>
        ) : null}

        {canManageMembers ? (
          <div id="workspace-members" className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-lg font-semibold text-ink">Add internal member</p>
              <form action={addMemberAction} className="mt-4 grid gap-3">
                <input
                  name="email"
                  placeholder="teammate@company.com"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    name="firstName"
                    placeholder="First name"
                    className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                  />
                  <input
                    name="lastName"
                    placeholder="Last name"
                    className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                  />
                </div>
                <select
                  name="role"
                  defaultValue="MEMBER"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                {isWorkspaceOwner ? (
                  <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink">
                    <input type="checkbox" name="isBillingAdmin" />
                    Grant billing admin access
                  </label>
                ) : null}
                <button
                  type="submit"
                  className="w-fit rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                >
                  Save member
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-lg font-semibold text-ink">Create invite link</p>
              <form action={createInviteAction} className="mt-4 grid gap-3">
                <input
                  name="inviteEmail"
                  placeholder="new-user@company.com"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <select
                  name="inviteRole"
                  defaultValue="MEMBER"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                {isWorkspaceOwner ? (
                  <label className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink">
                    <input type="checkbox" name="isBillingAdmin" />
                    Stage billing admin access on accept
                  </label>
                ) : null}
                <button
                  type="submit"
                  className="w-fit rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Save invite
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-line bg-mist p-5 text-sm text-steel">
            {["OWNER", "ADMIN"].includes(session.organization!.role)
              ? "This plan does not currently allow multi-user workspace management."
              : "Membership management is limited to workspace owners and admins."}
          </div>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <p className="text-lg font-semibold text-ink">Current members</p>
            <div className="mt-4 space-y-3">
              {organization?.members.map((member) => (
                <div key={member.id} className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">
                    {member.user.firstName ?? member.user.email}{" "}
                    {member.user.lastName ?? ""}
                  </p>
                  <p className="mt-1 text-xs text-steel">
                    {member.isBillingAdmin ? "Billing admin" : "Standard access"}
                    {organization?.billingOwnerUserId === member.userId
                      ? " | Billing owner"
                      : ""}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {member.user.email} • {member.role}
                  </p>
                  {canManageMembers ? (
                    <div className="mt-3 space-y-3">
                      <form action={updateMemberRoleAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="memberId" value={member.id} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className="rounded-full border border-line bg-white px-3 py-2 text-sm"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="ADMIN">Admin</option>
                          <option value="ANALYST">Analyst</option>
                          <option value="MEMBER">Member</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                        >
                          Update role
                        </button>
                      </form>
                      {isWorkspaceOwner ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={updateMemberBillingAdminAction}>
                            <input type="hidden" name="memberId" value={member.id} />
                            <input
                              type="hidden"
                              name="isBillingAdmin"
                              value={member.isBillingAdmin ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                            >
                              {member.isBillingAdmin
                                ? "Remove billing admin"
                                : "Grant billing admin"}
                            </button>
                          </form>
                          {organization?.billingOwnerUserId !== member.userId ? (
                            <form action={assignBillingOwnerAction}>
                              <input type="hidden" name="targetUserId" value={member.userId} />
                              <button
                                type="submit"
                                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                              >
                                Make billing owner
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <p className="text-lg font-semibold text-ink">Pending invites</p>
            <div className="mt-4 space-y-3">
              {organization?.invites.map((invite) => (
                <div key={invite.id} className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">{invite.email}</p>
                  {invite.isBillingAdmin ? (
                    <p className="mt-2 text-xs text-steel">
                      Billing admin access will be granted if this invite is accepted.
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-steel">
                    {invite.role} • {invite.status}
                  </p>
                  {invite.status === "PENDING" && canManageMembers ? (
                    <form action={revokeInviteAction} className="mt-3">
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                      >
                        Revoke invite
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
              {organization?.invites.length === 0 ? (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No invite placeholders have been created yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div id="inventory-registry" className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-lg font-semibold text-ink">Vendor registry</p>
            <p className="mt-2 text-sm text-steel">
              Track third-party AI vendors and critical service providers used by this customer workspace.
            </p>
            {canManageInventoryControls ? (
              <form action={addVendorAction} className="mt-4 grid gap-3">
                <input
                  name="vendorName"
                  placeholder="OpenAI"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <input
                  name="vendorCategory"
                  placeholder="Foundation model provider"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <textarea
                  name="vendorRiskNotes"
                  placeholder="Contract, data handling, or review notes"
                  rows={3}
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <button
                  type="submit"
                  className="w-fit rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                >
                  Save vendor
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-steel">
                Vendor management is limited to owners, admins, and analysts.
              </div>
            )}

            <div className="mt-5 space-y-3">
              {organization?.vendors.map((vendor) => (
                <div key={vendor.id} className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-ink">{vendor.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {vendor.category ?? "Category pending"}
                  </p>
                  {vendor.riskNotes ? (
                    <p className="mt-2 text-sm leading-6 text-steel">
                      {vendor.riskNotes}
                    </p>
                  ) : null}
                </div>
              ))}
              {organization?.vendors.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-steel">
                  No vendors have been registered yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-lg font-semibold text-ink">AI model registry</p>
            <p className="mt-2 text-sm text-steel">
              Record the models in use so future assessments and reports can reference real production systems.
            </p>
            {canManageInventoryControls ? (
              <form action={addModelAction} className="mt-4 grid gap-3">
                <input
                  name="modelName"
                  placeholder="GPT-4.1"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <input
                  name="modelProvider"
                  placeholder="OpenAI"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <input
                  name="modelUsageContext"
                  placeholder="Used for policy drafting and internal copilots"
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <textarea
                  name="modelRiskNotes"
                  placeholder="Risk notes, guardrails, or approval status"
                  rows={3}
                  className="rounded-2xl border border-line bg-white px-4 py-3 text-sm"
                />
                <button
                  type="submit"
                  className="w-fit rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Save model
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-steel">
                AI model management is limited to owners, admins, and analysts.
              </div>
            )}

            <div className="mt-5 space-y-3">
              {organization?.models.map((model) => (
                <div key={model.id} className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-ink">{model.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {model.provider}
                    {model.usageContext ? ` • ${model.usageContext}` : ""}
                  </p>
                  {model.riskNotes ? (
                    <p className="mt-2 text-sm leading-6 text-steel">
                      {model.riskNotes}
                    </p>
                  ) : null}
                </div>
              ))}
              {organization?.models.length === 0 ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-steel">
                  No AI models have been registered yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div id="outbound-webhooks" className="mt-8 rounded-2xl border border-line bg-mist p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-ink">Outbound webhook deliveries</p>
              <p className="mt-2 text-sm text-steel">
                Failed or exhausted outbound deliveries stay visible here so n8n and other downstream automations are debuggable.
              </p>
            </div>
            {session.organization!.role === "OWNER" ? (
              <form action={dispatchWebhooksAction}>
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Run dispatcher
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {failedDeliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-ink">
                  {delivery.destination} • {delivery.event.type}
                </p>
                <p className="mt-1 text-sm text-steel">
                  Attempts: {delivery.attemptCount} • Last tried{" "}
                  {delivery.lastAttemptAt ? formatDate(delivery.lastAttemptAt) : "never"}
                </p>
                <p className="mt-2 text-sm leading-6 text-steel">
                  {delivery.lastError ?? "No error message recorded."}
                </p>
              </div>
            ))}
            {failedDeliveries.length === 0 ? (
              <div className="rounded-2xl bg-white p-4 text-sm text-steel">
                No failed outbound deliveries are currently recorded.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

