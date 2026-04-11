import {
  AuditActorType,
  BillingEventStatus,
  BillingEventLogSource,
  EntitlementOverrideSource,
  Prisma,
  prisma,
  type CanonicalPlanKey
} from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import {
  ENTITLEMENT_FEATURE_KEYS,
  ENTITLEMENT_LIMIT_KEYS,
  getOrganizationEntitlements,
  type EntitlementFeatureKey,
  type EntitlementLimitKey,
  type EntitlementSnapshot
} from "./entitlements";
import { getOrganizationSubscriptionSnapshot } from "./subscription-domain";
import { getOrganizationUsageSnapshot } from "./usage";
import {
  USAGE_QUOTA_KEYS,
  getUsageRemaining,
  type UsageQuotaKey
} from "./usage-quotas";
import { appendBillingEventLog } from "./subscription-domain";
import { synchronizeStripeSubscription } from "./billing";
import { listOrganizationWorkflowRoutingDecisions } from "./workflow-routing";

type BillingAdminDbClient = Prisma.TransactionClient | typeof prisma;

const OVERRIDE_SOURCE_OPTIONS = [
  EntitlementOverrideSource.MANUAL,
  EntitlementOverrideSource.ENTERPRISE,
  EntitlementOverrideSource.PROMO
] as const;

const USAGE_QUOTA_LABELS: Record<UsageQuotaKey, string> = {
  audits: "Audits created",
  evidence_uploads: "Evidence uploads",
  documents_processed: "Documents processed"
};

export class BillingAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingAdminError";
  }
}

function isRetryableStripeWebhookFailure(message: string | null | undefined) {
  const normalized = String(message ?? "").toLowerCase();

  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("temporar") ||
    normalized.includes("network") ||
    normalized.includes("connection") ||
    normalized.includes("rate limit") ||
    normalized.includes("try again")
  ) {
    return true;
  }

  if (
    normalized.includes("missing a customer reference") ||
    normalized.includes("missing required event fields") ||
    normalized.includes("plan mapping")
  ) {
    return false;
  }

  return true;
}

function getStringRecord(
  value: Prisma.JsonValue | null | undefined
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : []
    )
  );
}

function billingEventMatchesOrganization(
  event: {
    payload: Prisma.JsonValue;
  },
  input: {
    organizationId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }
) {
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  const data =
    payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null;
  const eventObject =
    data?.object && typeof data.object === "object" && !Array.isArray(data.object)
      ? (data.object as Record<string, unknown>)
      : null;
  const metadata = getStringRecord(
    eventObject && "metadata" in eventObject
      ? (eventObject.metadata as Prisma.JsonValue | null | undefined)
      : null
  );
  const customerId =
    eventObject && typeof eventObject.customer === "string"
      ? eventObject.customer
      : null;
  const subscriptionId =
    eventObject && typeof eventObject.subscription === "string"
      ? eventObject.subscription
      : eventObject && typeof eventObject.id === "string"
        ? eventObject.id
        : null;

  return (
    metadata.organizationId === input.organizationId ||
    (input.stripeCustomerId !== null && customerId === input.stripeCustomerId) ||
    (input.stripeSubscriptionId !== null && subscriptionId === input.stripeSubscriptionId)
  );
}

export function summarizeBillingWebhookHealth(
  events: Array<{
    status: BillingEventStatus;
    processedAt: Date | null;
    failedAt: Date | null;
    lastError: string | null;
  }>
) {
  const failures = events.filter((event) => event.status === BillingEventStatus.FAILED);
  const retryableFailureCount = failures.filter((event) =>
    isRetryableStripeWebhookFailure(event.lastError)
  ).length;
  const pendingCount = events.filter(
    (event) => event.status === BillingEventStatus.PENDING
  ).length;
  const processingCount = events.filter(
    (event) => event.status === BillingEventStatus.PROCESSING
  ).length;
  const lastProcessedAt =
    events
      .filter((event) => event.processedAt)
      .sort(
        (left, right) =>
          (right.processedAt?.getTime() ?? 0) - (left.processedAt?.getTime() ?? 0)
      )[0]?.processedAt ?? null;
  const lastFailedAt =
    failures
      .filter((event) => event.failedAt)
      .sort(
        (left, right) =>
          (right.failedAt?.getTime() ?? 0) - (left.failedAt?.getTime() ?? 0)
      )[0]?.failedAt ?? null;
  const recommendedAction =
    failures.length > 0
      ? retryableFailureCount > 0
        ? "Review failed Stripe receipts and replay retryable events, or run a manual billing resync if Stripe already reflects the correct subscription state."
        : "Review terminal Stripe failures before replaying. These usually need config or payload correction rather than blind retries."
      : processingCount > 0
        ? "Stripe receipts are currently processing. If they remain stuck, use the replay console or a guarded manual resync after review."
        : pendingCount > 0
          ? "Pending Stripe receipts are waiting to be processed. Confirm webhook delivery and cron-driven recovery paths are healthy."
          : null;

  return {
    openFailureCount: failures.length,
    retryableFailureCount,
    pendingCount,
    processingCount,
    lastProcessedAt,
    lastFailedAt,
    recommendedAction
  };
}

export type BillingManagementSnapshot = {
  organization: {
    id: string;
    name: string;
    billingOwnerUserId: string | null;
    billingOwnerEmail: string | null;
    billingOwnerName: string | null;
  };
  subscription: {
    id: string | null;
    canonicalPlanKey: CanonicalPlanKey | null;
    planName: string;
    planCode: string;
    status: string;
    accessState: string;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    lastPaymentFailedAt: Date | null;
    lastPaymentFailureMessage: string | null;
  };
  billingCustomer: {
    id: string | null;
    providerCustomerId: string | null;
    billingProvider: string | null;
    email: string | null;
    name: string | null;
  };
  members: Array<{
    id: string;
    userId: string;
    email: string;
    fullName: string;
    role: string;
    isBillingAdmin: boolean;
    isBillingOwner: boolean;
  }>;
  entitlements: EntitlementSnapshot;
  entitlementBreakdown: Array<
    | {
        kind: "feature";
        key: EntitlementFeatureKey;
        label: string;
        value: boolean;
        overrideSources: string[];
      }
    | {
        kind: "limit";
        key: EntitlementLimitKey;
        label: string;
        value: number | null;
        overrideSources: string[];
      }
  >;
  activeOverrides: Array<{
    id: string;
    entitlementKey: string;
    label: string;
    source: string;
    enabled: boolean | null;
    limitOverride: string | null;
    reason: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    createdByEmail: string | null;
    isExpired: boolean;
  }>;
  usageOverview: Awaited<ReturnType<typeof getOrganizationUsageSnapshot>>;
  usageQuotas: Array<{
    key: UsageQuotaKey;
    label: string;
    used: number;
    limit: number | null;
    remaining: number | null;
    periodStart: Date;
    periodEnd: Date;
    isExceeded: boolean;
  }>;
  recentBillingEventLogs: Array<{
    id: string;
    eventSource: string;
    eventType: string;
    idempotencyKey: string | null;
    sourceReference: string | null;
    canonicalPlanKey: string | null;
    payload: Prisma.JsonValue;
    occurredAt: Date;
    createdAt: Date;
  }>;
  recentUsageEvents: Array<{
    id: string;
    meterKey: string;
    quantity: number;
    source: string;
    sourceRecordType: string | null;
    sourceRecordId: string | null;
    idempotencyKey: string;
    metadata: Prisma.JsonValue | null;
    occurredAt: Date;
    createdAt: Date;
  }>;
  recentWorkflowRoutingDecisions: Array<{
    id: string;
    workflowFamily: string;
    sourceRecordType: string;
    sourceRecordId: string;
    routeKey: string;
    processingTier: string;
    disposition: string;
    decisionVersion: string;
    planCode: string | null;
    reasonCodes: Prisma.JsonValue;
    workflowHints: Prisma.JsonValue;
    createdAt: Date;
  }>;
  billingWebhookHealth: {
    openFailureCount: number;
    retryableFailureCount: number;
    pendingCount: number;
    processingCount: number;
    lastProcessedAt: Date | null;
    lastFailedAt: Date | null;
    recommendedAction: string | null;
  };
};

type AuditActorInput = {
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
};

function formatLabel(key: string) {
  return key
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getEntitlementBreakdown(
  entitlements: Pick<
    EntitlementSnapshot,
    "featureAccess" | "limits" | "appliedOverrides"
  >
) {
  const overrideMap = new Map<string, string[]>();

  for (const override of entitlements.appliedOverrides) {
    const existing = overrideMap.get(override.key) ?? [];
    existing.push(override.source);
    overrideMap.set(override.key, existing);
  }

  const featureRows = ENTITLEMENT_FEATURE_KEYS.map((key) => ({
    kind: "feature" as const,
    key,
    label: formatLabel(key),
    value: entitlements.featureAccess[key],
    overrideSources: overrideMap.get(key) ?? []
  }));

  const limitRows = ENTITLEMENT_LIMIT_KEYS.map((key) => ({
    kind: "limit" as const,
    key,
    label: formatLabel(key),
    value: entitlements.limits[key],
    overrideSources: overrideMap.get(key) ?? []
  }));

  return [...featureRows, ...limitRows];
}

function ensureOverrideSource(value: string): EntitlementOverrideSource {
  if (
    OVERRIDE_SOURCE_OPTIONS.includes(value as EntitlementOverrideSource)
  ) {
    return value as EntitlementOverrideSource;
  }

  throw new BillingAdminError("Unsupported entitlement override source.");
}

async function syncBillingCustomerOwner(
  db: BillingAdminDbClient,
  organizationId: string,
  billingOwnerUserId: string | null
) {
  await db.billingCustomer.updateMany({
    where: { organizationId },
    data: { billingOwnerUserId }
  });
}

export async function getOrganizationBillingManagementSnapshot(
  organizationId: string,
  db: BillingAdminDbClient = prisma
): Promise<BillingManagementSnapshot> {
  const [organization, subscriptionSnapshot, entitlements, usageOverview, rawOverrides] =
    await Promise.all([
      db.organization.findUniqueOrThrow({
        where: { id: organizationId },
        include: {
          billingOwner: true,
          members: {
            include: { user: true },
            orderBy: [{ isBillingAdmin: "desc" }, { createdAt: "asc" }]
          }
        }
      }),
      getOrganizationSubscriptionSnapshot(organizationId, db),
      getOrganizationEntitlements(organizationId, db),
      getOrganizationUsageSnapshot(organizationId, db),
      db.entitlementOverride.findMany({
        where: { organizationId },
        include: { createdBy: true },
        orderBy: [{ createdAt: "desc" }]
      })
    ]);

  const recentBillingEventLogsPromise = db.billingEventLog.findMany({
    where: { organizationId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 12
  });

  const recentUsageEventsPromise = db.usageEvent.findMany({
    where: { organizationId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 12
  });

  const recentBillingEventsPromise = db.billingEvent.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 150
  });

  const recentWorkflowRoutingDecisionsPromise =
    listOrganizationWorkflowRoutingDecisions(organizationId, {
      limit: 12,
      db
    });

  const [recentBillingEventLogs, recentUsageEvents, recentBillingEvents] =
    await Promise.all([
      recentBillingEventLogsPromise,
      recentUsageEventsPromise,
      recentBillingEventsPromise
    ]);
  const recentWorkflowRoutingDecisions =
    await recentWorkflowRoutingDecisionsPromise;

  const organizationBillingEvents = recentBillingEvents.filter((event) =>
    billingEventMatchesOrganization(event, {
      organizationId,
      stripeCustomerId:
        subscriptionSnapshot.billingCustomer?.providerCustomerId ??
        subscriptionSnapshot.subscription?.stripeCustomerId ??
        null,
      stripeSubscriptionId:
        subscriptionSnapshot.subscription?.stripeSubscriptionId ?? null
    })
  );

  const billingWebhookHealth = summarizeBillingWebhookHealth(organizationBillingEvents);

  const usageQuotas = await Promise.all(
    USAGE_QUOTA_KEYS.map(async (key) => {
      const usage = await getUsageRemaining(organizationId, key, { db });

      return {
        key,
        label: USAGE_QUOTA_LABELS[key],
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        isExceeded: !usage.isUnlimited && usage.remaining !== null && usage.remaining <= 0
      };
    })
  );

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      billingOwnerUserId: organization.billingOwnerUserId ?? null,
      billingOwnerEmail: organization.billingOwner?.email ?? null,
      billingOwnerName: organization.billingOwner
        ? `${organization.billingOwner.firstName ?? ""} ${organization.billingOwner.lastName ?? ""}`.trim() ||
          organization.billingOwner.email
        : null
    },
    subscription: {
      id: subscriptionSnapshot.subscription?.id ?? null,
      canonicalPlanKey:
        subscriptionSnapshot.subscription?.canonicalPlanKeySnapshot ??
        subscriptionSnapshot.canonicalPlan?.key ??
        null,
      planName: entitlements.planName,
      planCode: entitlements.planCode,
      status: entitlements.subscriptionStatus,
      accessState: entitlements.billingAccessState,
      currentPeriodEnd: entitlements.currentPeriodEnd,
      trialEndsAt: entitlements.trialEndsAt,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
      lastPaymentFailedAt:
        subscriptionSnapshot.subscription?.lastPaymentFailedAt ?? null,
      lastPaymentFailureMessage:
        subscriptionSnapshot.subscription?.lastPaymentFailureMessage ?? null
    },
    billingCustomer: {
      id: subscriptionSnapshot.billingCustomer?.id ?? null,
      providerCustomerId:
        subscriptionSnapshot.billingCustomer?.providerCustomerId ?? null,
      billingProvider:
        subscriptionSnapshot.billingCustomer?.billingProvider ?? null,
      email: subscriptionSnapshot.billingCustomer?.email ?? null,
      name: subscriptionSnapshot.billingCustomer?.name ?? null
    },
    members: organization.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      fullName:
        `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim() ||
        member.user.email,
      role: member.role,
      isBillingAdmin: member.isBillingAdmin,
      isBillingOwner: organization.billingOwnerUserId === member.userId
    })),
    entitlements,
    entitlementBreakdown: getEntitlementBreakdown(entitlements),
    activeOverrides: rawOverrides.map((override) => ({
      id: override.id,
      entitlementKey: override.entitlementKey,
      label: formatLabel(override.entitlementKey),
      source: override.source,
      enabled: override.enabled,
      limitOverride: override.limitOverride,
      reason: override.reason ?? null,
      expiresAt: override.expiresAt ?? null,
      createdAt: override.createdAt,
      createdByEmail: override.createdBy?.email ?? null,
      isExpired: Boolean(override.expiresAt && override.expiresAt <= new Date())
    })),
    usageOverview,
    usageQuotas,
    recentBillingEventLogs: recentBillingEventLogs.map((event) => ({
      id: event.id,
      eventSource: event.eventSource,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      sourceReference: event.sourceReference,
      canonicalPlanKey: event.canonicalPlanKey,
      payload: event.payload,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt
    })),
    recentUsageEvents: recentUsageEvents.map((event) => ({
      id: event.id,
      meterKey: event.meterKey,
      quantity: event.quantity,
      source: event.source,
      sourceRecordType: event.sourceRecordType,
      sourceRecordId: event.sourceRecordId,
      idempotencyKey: event.idempotencyKey,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt
    })),
    recentWorkflowRoutingDecisions: recentWorkflowRoutingDecisions.map((decision) => ({
      id: decision.id,
      workflowFamily: decision.workflowFamily,
      sourceRecordType: decision.sourceRecordType,
      sourceRecordId: decision.sourceRecordId,
      routeKey: decision.routeKey,
      processingTier: decision.processingTier,
      disposition: decision.disposition,
      decisionVersion: decision.decisionVersion,
      planCode: decision.planCode ?? null,
      reasonCodes: decision.reasonCodes,
      workflowHints: decision.workflowHints,
      createdAt: decision.createdAt
    })),
    billingWebhookHealth
  };
}

export async function setOrganizationBillingOwner(
  input: {
    organizationId: string;
    targetUserId: string;
    db?: BillingAdminDbClient;
  } & AuditActorInput
) {
  const db = input.db ?? prisma;
  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.targetUserId
      }
    }
  });

  if (!membership) {
    throw new BillingAdminError("Billing owner must belong to the organization.");
  }

  if (membership.role !== "OWNER" && !membership.isBillingAdmin) {
    throw new BillingAdminError(
      "Billing owner must be a workspace owner or designated billing admin."
    );
  }

  await db.organization.update({
    where: { id: input.organizationId },
    data: { billingOwnerUserId: input.targetUserId }
  });

  await syncBillingCustomerOwner(db, input.organizationId, input.targetUserId);

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.USER,
    actorLabel: input.actorLabel ?? null,
    action: "billing.owner_assigned",
    entityType: "organization",
    entityId: input.organizationId,
    metadata: {
      billingOwnerUserId: input.targetUserId
    },
    requestContext: input.requestContext ?? null
  });
}

export async function setOrganizationMembershipBillingAdmin(
  input: {
    organizationId: string;
    memberId: string;
    isBillingAdmin: boolean;
    db?: BillingAdminDbClient;
  } & AuditActorInput
) {
  const db = input.db ?? prisma;
  const [membership, organization] = await Promise.all([
    db.organizationMember.findFirst({
      where: {
        id: input.memberId,
        organizationId: input.organizationId
      }
    }),
    db.organization.findUnique({
      where: { id: input.organizationId },
      select: { billingOwnerUserId: true }
    })
  ]);

  if (!membership) {
    throw new BillingAdminError("Organization member not found.");
  }

  if (
    !input.isBillingAdmin &&
    membership.role !== "OWNER" &&
    organization?.billingOwnerUserId === membership.userId
  ) {
    throw new BillingAdminError(
      "Reassign billing ownership before removing billing admin from the current billing owner."
    );
  }

  await db.organizationMember.update({
    where: { id: input.memberId },
    data: { isBillingAdmin: input.isBillingAdmin }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.USER,
    actorLabel: input.actorLabel ?? null,
    action: input.isBillingAdmin
      ? "billing.admin_granted"
      : "billing.admin_revoked",
    entityType: "organizationMember",
    entityId: input.memberId,
    metadata: {
      userId: membership.userId,
      role: membership.role,
      isBillingAdmin: input.isBillingAdmin
    },
    requestContext: input.requestContext ?? null
  });
}

export async function createEntitlementOverride(
  input: {
    organizationId: string;
    entitlementKey: string;
    source: string;
    enabled?: boolean | null;
    limitOverride?: string | null;
    reason: string;
    expiresAt?: Date | null;
    db?: BillingAdminDbClient;
  } & AuditActorInput
) {
  const db = input.db ?? prisma;
  const normalizedKey = input.entitlementKey.trim();
  const reason = input.reason.trim();

  if (!normalizedKey) {
    throw new BillingAdminError("Entitlement key is required.");
  }

  if (!reason) {
    throw new BillingAdminError("Override reason is required.");
  }

  const isFeatureKey = ENTITLEMENT_FEATURE_KEYS.includes(
    normalizedKey as EntitlementFeatureKey
  );
  const isLimitKey = ENTITLEMENT_LIMIT_KEYS.includes(
    normalizedKey as EntitlementLimitKey
  );

  if (!isFeatureKey && !isLimitKey) {
    throw new BillingAdminError("Unsupported entitlement key.");
  }

  if (isFeatureKey && typeof input.enabled !== "boolean") {
    throw new BillingAdminError("Feature overrides must set enabled true or false.");
  }

  if (isLimitKey) {
    const normalizedLimit = input.limitOverride?.trim() ?? "";
    const parsedLimit = Number(normalizedLimit);

    if (
      !normalizedLimit ||
      !Number.isFinite(parsedLimit) ||
      parsedLimit < 0 ||
      !Number.isInteger(parsedLimit)
    ) {
      throw new BillingAdminError(
        "Limit overrides must provide a non-negative whole number."
      );
    }
  }

  const source = ensureOverrideSource(input.source);
  if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
    throw new BillingAdminError("Override expiration must be a valid date.");
  }
  const activeOverrides = await db.entitlementOverride.findMany({
    where: {
      organizationId: input.organizationId,
      entitlementKey: normalizedKey,
      source,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    }
  });

  if (activeOverrides.length > 0) {
    await db.entitlementOverride.updateMany({
      where: {
        id: {
          in: activeOverrides.map((override) => override.id)
        }
      },
      data: {
        expiresAt: new Date()
      }
    });
  }

  const override = await db.entitlementOverride.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.actorUserId ?? null,
      source,
      entitlementKey: normalizedKey,
      enabled: isFeatureKey ? input.enabled ?? null : null,
      limitOverride: isLimitKey ? input.limitOverride?.trim() ?? null : null,
      reason,
      expiresAt: input.expiresAt ?? null
    }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.USER,
    actorLabel: input.actorLabel ?? null,
    action: "billing.entitlement_override_created",
    entityType: "entitlementOverride",
    entityId: override.id,
    metadata: {
      entitlementKey: normalizedKey,
      source,
      enabled: override.enabled,
      limitOverride: override.limitOverride,
      expiresAt: override.expiresAt?.toISOString() ?? null,
      reason
    },
    requestContext: input.requestContext ?? null
  });

  return override;
}

export async function expireEntitlementOverride(
  input: {
    organizationId: string;
    overrideId: string;
    db?: BillingAdminDbClient;
  } & AuditActorInput
) {
  const db = input.db ?? prisma;
  const override = await db.entitlementOverride.findFirst({
    where: {
      id: input.overrideId,
      organizationId: input.organizationId
    }
  });

  if (!override) {
    throw new BillingAdminError("Entitlement override not found.");
  }

  const updated = await db.entitlementOverride.update({
    where: { id: override.id },
    data: {
      expiresAt: new Date()
    }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.USER,
    actorLabel: input.actorLabel ?? null,
    action: "billing.entitlement_override_expired",
    entityType: "entitlementOverride",
    entityId: override.id,
    metadata: {
      entitlementKey: override.entitlementKey,
      source: override.source
    },
    requestContext: input.requestContext ?? null
  });

  return updated;
}

export async function recoverOrganizationBillingSync(
  input: {
    organizationId: string;
    reason: string;
    db?: BillingAdminDbClient;
  } & AuditActorInput
) {
  const db = input.db ?? prisma;
  const snapshot = await getOrganizationSubscriptionSnapshot(input.organizationId, db);
  const stripeSubscriptionId = snapshot.subscription?.stripeSubscriptionId ?? null;

  if (!stripeSubscriptionId) {
    throw new BillingAdminError(
      "This organization is not linked to a Stripe subscription yet."
    );
  }

  const synchronized = await synchronizeStripeSubscription({
    organizationId: input.organizationId,
    stripeSubscriptionId,
    db,
    auditActorType: input.actorType ?? AuditActorType.ADMIN,
    auditActorLabel: input.actorLabel ?? null,
    auditUserId: input.actorUserId ?? null,
    auditRequestContext: input.requestContext ?? null
  });

  await appendBillingEventLog({
    db,
    organizationId: input.organizationId,
    billingCustomerId: synchronized.billingCustomerId ?? null,
    subscriptionId: synchronized.id,
    planId: synchronized.planId,
    recordedByUserId: input.actorUserId ?? null,
    eventSource: BillingEventLogSource.APP,
    eventType: "billing.sync.manual_recovery",
    idempotencyKey: `billing.sync.manual_recovery:${input.organizationId}:${stripeSubscriptionId}:${synchronized.updatedAt.toISOString()}`,
    sourceReference: stripeSubscriptionId,
    canonicalPlanKey: synchronized.canonicalPlanKeySnapshot,
    payload: {
      organizationId: input.organizationId,
      stripeSubscriptionId,
      status: synchronized.status,
      accessState: synchronized.accessState,
      reason: input.reason
    }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.ADMIN,
    actorLabel: input.actorLabel ?? null,
    action: "billing.sync_manual_recovery",
    entityType: "organization",
    entityId: input.organizationId,
    metadata: {
      stripeSubscriptionId,
      subscriptionId: synchronized.id,
      status: synchronized.status,
      accessState: synchronized.accessState,
      reason: input.reason
    },
    requestContext: input.requestContext ?? null
  });

  return synchronized;
}
