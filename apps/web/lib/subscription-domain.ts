import {
  AuditActorType,
  BillingAccessState,
  BillingCustomer,
  BillingEventLog,
  BillingEventLogSource,
  BillingProvider,
  CanonicalPlanKey,
  Plan,
  Prisma,
  Subscription,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import { ensureDefaultPlans } from "./billing";
import {
  getCanonicalCommercialPlanCatalog,
  getCanonicalCommercialPlanDefinition,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  type CanonicalCommercialPlan
} from "./commercial-catalog";
import { publishDomainEvent } from "./domain-events";
import {
  getCanonicalPlanDefinition,
  getDefaultRevenuePlanCodeForCanonicalKey,
  getRevenuePlanDefinition,
  type CanonicalPlanDefinition,
  type RevenuePlanCode,
  type RevenuePlanDefinition
} from "./revenue-catalog";

type BillingDbClient = Prisma.TransactionClient | typeof prisma;

function toNullableJsonInput(
  value: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined
) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : value;
}

export type BillingCustomerSnapshot = {
  customer: BillingCustomer;
  billingOwnerUserId: string | null;
};

export type PublicCanonicalPlanSnapshot = Pick<
  CanonicalCommercialPlan,
  | "code"
  | "displayName"
  | "publicPriceUsd"
  | "publicPriceLabel"
  | "billingMotion"
  | "workflowCode"
  | "reportTemplate"
  | "processingDepth"
  | "publicRevenuePlanCode"
  | "contactSalesOnly"
  | "hostingerCtaTarget"
>;

export type OrganizationSubscriptionSnapshot = {
  subscription: (Subscription & { plan: Plan }) | null;
  billingCustomer: BillingCustomer | null;
  canonicalPlan: CanonicalPlanDefinition | null;
  revenuePlan: RevenuePlanDefinition | null;
};

export type EnsureBillingCustomerInput = {
  organizationId: string;
  billingProvider?: BillingProvider;
  providerCustomerId: string;
  email?: string | null;
  name?: string | null;
  billingOwnerUserId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  db?: BillingDbClient;
};

export type SetOrganizationSubscriptionSnapshotInput = {
  organizationId: string;
  canonicalPlanKey: CanonicalPlanKey;
  revenuePlanCode?: RevenuePlanCode | null;
  billingProvider?: BillingProvider;
  subscriptionStatus: SubscriptionStatus;
  accessState?: BillingAccessState | null;
  externalStatus?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  accessEndsAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelScheduledAt?: Date | null;
  canceledAt?: Date | null;
  endedAt?: Date | null;
  reactivatedAt?: Date | null;
  latestInvoiceId?: string | null;
  latestInvoiceStatus?: string | null;
  lastInvoicePaidAt?: Date | null;
  lastPaymentFailedAt?: Date | null;
  lastPaymentFailureMessage?: string | null;
  billingOwnerUserId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string | null;
  requestContext?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  db?: BillingDbClient;
};

export type BillingEventLogInput = {
  organizationId: string;
  billingCustomerId?: string | null;
  subscriptionId?: string | null;
  planId?: string | null;
  canonicalPlanKey?: CanonicalPlanKey | null;
  planCodeSnapshot?: string | null;
  recordedByUserId?: string | null;
  eventSource?: BillingEventLogSource;
  eventType: string;
  idempotencyKey?: string | null;
  sourceReference?: string | null;
  stripeEventId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  payload: Prisma.InputJsonValue;
  occurredAt?: Date;
  db?: BillingDbClient;
};

export function normalizeBillingAmountCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

export function normalizeBillingCurrency(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function deriveBillingAccessStateFromSubscriptionStatus(
  status: SubscriptionStatus
) {
  switch (status) {
    case SubscriptionStatus.TRIALING:
      return BillingAccessState.TRIALING;
    case SubscriptionStatus.ACTIVE:
      return BillingAccessState.ACTIVE;
    case SubscriptionStatus.PAST_DUE:
      return BillingAccessState.PAST_DUE;
    case SubscriptionStatus.CANCELED:
      return BillingAccessState.CANCELED;
    case SubscriptionStatus.PAUSED:
      return BillingAccessState.PAUSED;
    case SubscriptionStatus.INCOMPLETE:
    default:
      return BillingAccessState.INCOMPLETE;
  }
}

async function findPreferredOrganizationSubscription(
  db: BillingDbClient,
  organizationId: string
) {
  const subscriptions = await db.subscription.findMany({
    where: { organizationId },
    include: { plan: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 10
  });

  if (subscriptions.length === 0) {
    return null;
  }

  const accessPriority: Record<BillingAccessState, number> = {
    TRIALING: 100,
    ACTIVE: 90,
    GRACE_PERIOD: 80,
    PAST_DUE: 70,
    PAUSED: 60,
    INCOMPLETE: 40,
    CANCELED: 20,
    INACTIVE: 10
  };

  return subscriptions
    .slice()
    .sort((left, right) => {
      const leftPriority = accessPriority[left.accessState];
      const rightPriority = accessPriority[right.accessState];

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })[0];
}

async function resolvePlanRecord(
  db: BillingDbClient,
  canonicalPlanKey: CanonicalPlanKey,
  revenuePlanCode?: RevenuePlanCode | null
) {
  await ensureDefaultPlans();

  const explicitCode =
    revenuePlanCode ?? getDefaultRevenuePlanCodeForCanonicalKey(canonicalPlanKey);

  if (explicitCode) {
    const explicitPlan = await db.plan.findUnique({
      where: { code: explicitCode }
    });

    if (explicitPlan) {
      return explicitPlan;
    }
  }

  return db.plan.findFirst({
    where: {
      canonicalKey: canonicalPlanKey,
      isActive: true
    },
    orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }]
  });
}

function buildSubscriptionLogPayload(
  subscription: Subscription & { plan: Plan },
  metadata: Prisma.InputJsonValue | null | undefined
) {
  return {
    subscriptionId: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    planCode: subscription.plan.code,
    canonicalPlanKey: subscription.canonicalPlanKeySnapshot,
    status: subscription.status,
    accessState: subscription.accessState,
    billingProvider: subscription.billingProvider,
    metadata: metadata ?? null
  } satisfies Prisma.InputJsonValue;
}

export function listCanonicalPlans() {
  return getCanonicalCommercialPlanCatalog().map((plan: CanonicalCommercialPlan) => ({
    code: plan.code,
    displayName: plan.displayName,
    publicPriceUsd: plan.publicPriceUsd,
    publicPriceLabel: plan.publicPriceLabel,
    billingMotion: plan.billingMotion,
    workflowCode: plan.workflowCode,
    reportTemplate: plan.reportTemplate,
    processingDepth: plan.processingDepth,
    publicRevenuePlanCode: plan.publicRevenuePlanCode,
    contactSalesOnly: plan.contactSalesOnly,
    hostingerCtaTarget: plan.hostingerCtaTarget
  })) satisfies readonly PublicCanonicalPlanSnapshot[];
}

export function retrieveCanonicalPlan(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
) {
  if (!canonicalPlanKey) {
    return null;
  }

  const planCode = mapCanonicalPlanKeyToCanonicalPlanCode(canonicalPlanKey);
  const plan = getCanonicalCommercialPlanDefinition(planCode);

  if (!plan) {
    return null;
  }

  return {
    code: plan.code,
    displayName: plan.displayName,
    publicPriceUsd: plan.publicPriceUsd,
    publicPriceLabel: plan.publicPriceLabel,
    billingMotion: plan.billingMotion,
    workflowCode: plan.workflowCode,
    reportTemplate: plan.reportTemplate,
    processingDepth: plan.processingDepth,
    publicRevenuePlanCode: plan.publicRevenuePlanCode,
    contactSalesOnly: plan.contactSalesOnly,
    hostingerCtaTarget: plan.hostingerCtaTarget
  } satisfies PublicCanonicalPlanSnapshot;
}

export function retrieveCanonicalPlanForRevenueCode(
  revenuePlanCode: string | null | undefined
) {
  const revenuePlan = getRevenuePlanDefinition(revenuePlanCode);
  return revenuePlan ? getCanonicalPlanDefinition(revenuePlan.canonicalKey) : null;
}

export async function getOrganizationBillingCustomer(
  organizationId: string,
  billingProvider: BillingProvider = BillingProvider.STRIPE,
  db: BillingDbClient = prisma
) {
  return db.billingCustomer.findUnique({
    where: {
      organizationId_billingProvider: {
        organizationId,
        billingProvider
      }
    }
  });
}

export async function ensureOrganizationBillingCustomer(
  input: EnsureBillingCustomerInput
): Promise<BillingCustomerSnapshot> {
  const db = input.db ?? prisma;
  const billingProvider = input.billingProvider ?? BillingProvider.STRIPE;

  const customer = await db.billingCustomer.upsert({
    where: {
      organizationId_billingProvider: {
        organizationId: input.organizationId,
        billingProvider
      }
    },
    update: {
      providerCustomerId: input.providerCustomerId,
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      billingOwnerUserId: input.billingOwnerUserId ?? undefined,
      metadata: toNullableJsonInput(input.metadata)
    },
    create: {
      organizationId: input.organizationId,
      billingProvider,
      providerCustomerId: input.providerCustomerId,
      email: input.email ?? null,
      name: input.name ?? null,
      billingOwnerUserId: input.billingOwnerUserId ?? null,
      metadata: toNullableJsonInput(input.metadata)
    }
  });

  if (input.billingOwnerUserId !== undefined) {
    await db.organization.update({
      where: { id: input.organizationId },
      data: {
        billingOwnerUserId: input.billingOwnerUserId
      }
    });
  }

  return {
    customer,
    billingOwnerUserId: input.billingOwnerUserId ?? customer.billingOwnerUserId ?? null
  };
}

export async function appendBillingEventLog(
  input: BillingEventLogInput
): Promise<BillingEventLog> {
  const db = input.db ?? prisma;
  const eventSource = input.eventSource ?? BillingEventLogSource.APP;

  if (input.idempotencyKey) {
    const existing = await db.billingEventLog.findUnique({
      where: {
        eventSource_idempotencyKey: {
          eventSource,
          idempotencyKey: input.idempotencyKey
        }
      }
    });

    if (existing) {
      return existing;
    }
  }

  return db.billingEventLog.create({
    data: {
      organizationId: input.organizationId,
      billingCustomerId: input.billingCustomerId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      planId: input.planId ?? null,
      planCodeSnapshot: input.planCodeSnapshot ?? null,
      recordedByUserId: input.recordedByUserId ?? null,
      eventSource,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey ?? null,
      sourceReference: input.sourceReference ?? null,
      canonicalPlanKey: input.canonicalPlanKey ?? null,
      stripeEventId: input.stripeEventId ?? null,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      amountCents: input.amountCents ?? null,
      currency: input.currency ?? null,
      payload: input.payload,
      occurredAt: input.occurredAt ?? new Date()
    }
  });
}

export async function getOrganizationSubscriptionSnapshot(
  organizationId: string,
  db: BillingDbClient = prisma
): Promise<OrganizationSubscriptionSnapshot> {
  const [subscription, billingCustomer] = await Promise.all([
    findPreferredOrganizationSubscription(db, organizationId),
    getOrganizationBillingCustomer(organizationId, BillingProvider.STRIPE, db)
  ]);

  const revenuePlan = subscription?.plan
    ? getRevenuePlanDefinition(subscription.plan.code)
    : getRevenuePlanDefinition(subscription?.planCodeSnapshot ?? null);
  const canonicalPlan = getCanonicalPlanDefinition(
    subscription?.canonicalPlanKeySnapshot ??
      revenuePlan?.canonicalKey ??
      null
  );

  return {
    subscription,
    billingCustomer,
    canonicalPlan,
    revenuePlan
  };
}

export async function setOrganizationSubscriptionSnapshot(
  input: SetOrganizationSubscriptionSnapshotInput
) {
  const db = input.db ?? prisma;
  const billingProvider = input.billingProvider ?? BillingProvider.INTERNAL;
  const plan = await resolvePlanRecord(
    db,
    input.canonicalPlanKey,
    input.revenuePlanCode ?? null
  );

  if (!plan) {
    throw new Error(
      `No active plan is configured for canonical key ${input.canonicalPlanKey}.`
    );
  }

  const existingSubscription =
    (input.stripeSubscriptionId
      ? await db.subscription.findUnique({
          where: { stripeSubscriptionId: input.stripeSubscriptionId },
          include: { plan: true }
        })
      : null) ??
    (await findPreferredOrganizationSubscription(db, input.organizationId));

  let billingCustomerId = existingSubscription?.billingCustomerId ?? null;

  if (input.stripeCustomerId) {
    const billingCustomer = await ensureOrganizationBillingCustomer({
      db,
      organizationId: input.organizationId,
      billingProvider: BillingProvider.STRIPE,
      providerCustomerId: input.stripeCustomerId,
      billingOwnerUserId: input.billingOwnerUserId ?? null
    });

    billingCustomerId = billingCustomer.customer.id;
  } else if (input.billingOwnerUserId !== undefined) {
    await db.organization.update({
      where: { id: input.organizationId },
      data: { billingOwnerUserId: input.billingOwnerUserId }
    });
  }

  const accessState =
    input.accessState ??
    deriveBillingAccessStateFromSubscriptionStatus(input.subscriptionStatus);
  const now = new Date();

  const subscriptionData = {
    organizationId: input.organizationId,
    planId: plan.id,
    billingCustomerId,
    accessState,
    billingProvider,
    externalStatus: input.externalStatus ?? input.subscriptionStatus,
    canonicalPlanKeySnapshot: input.canonicalPlanKey,
    planCodeSnapshot: plan.code,
    stripeCustomerId:
      billingProvider === BillingProvider.STRIPE
        ? input.stripeCustomerId ??
          existingSubscription?.stripeCustomerId ??
          null
        : existingSubscription?.stripeCustomerId ?? null,
    stripeSubscriptionId:
      billingProvider === BillingProvider.STRIPE
        ? input.stripeSubscriptionId ??
          existingSubscription?.stripeSubscriptionId ??
          null
        : existingSubscription?.stripeSubscriptionId ?? null,
    stripePriceIdSnapshot: plan.stripePriceId ?? existingSubscription?.stripePriceIdSnapshot ?? null,
    status: input.subscriptionStatus,
    currentPeriodStart:
      input.currentPeriodStart ?? existingSubscription?.currentPeriodStart ?? null,
    currentPeriodEnd:
      input.currentPeriodEnd ?? existingSubscription?.currentPeriodEnd ?? null,
    accessEndsAt: input.accessEndsAt ?? existingSubscription?.accessEndsAt ?? null,
    gracePeriodEndsAt:
      input.gracePeriodEndsAt ?? existingSubscription?.gracePeriodEndsAt ?? null,
    trialStartedAt:
      input.trialStartedAt ?? existingSubscription?.trialStartedAt ?? null,
    trialEndsAt: input.trialEndsAt ?? existingSubscription?.trialEndsAt ?? null,
    cancelAtPeriodEnd:
      input.cancelAtPeriodEnd ?? existingSubscription?.cancelAtPeriodEnd ?? false,
    cancelScheduledAt:
      input.cancelScheduledAt ?? existingSubscription?.cancelScheduledAt ?? null,
    canceledAt: input.canceledAt ?? existingSubscription?.canceledAt ?? null,
    endedAt: input.endedAt ?? existingSubscription?.endedAt ?? null,
    reactivatedAt:
      input.reactivatedAt ??
      (input.subscriptionStatus === SubscriptionStatus.ACTIVE ? now : null),
    statusUpdatedAt: now,
    latestInvoiceId:
      input.latestInvoiceId ?? existingSubscription?.latestInvoiceId ?? null,
    latestInvoiceStatus:
      input.latestInvoiceStatus ??
      existingSubscription?.latestInvoiceStatus ??
      null,
    lastInvoicePaidAt:
      input.lastInvoicePaidAt ?? existingSubscription?.lastInvoicePaidAt ?? null,
    lastPaymentFailedAt:
      input.lastPaymentFailedAt ??
      existingSubscription?.lastPaymentFailedAt ??
      null,
    lastPaymentFailureMessage:
      input.lastPaymentFailureMessage ??
      existingSubscription?.lastPaymentFailureMessage ??
      null,
    billingMetadata: toNullableJsonInput(
      input.metadata ?? existingSubscription?.billingMetadata ?? null
    )
  } satisfies Prisma.SubscriptionUncheckedCreateInput;

  const writtenSubscription = existingSubscription
    ? await db.subscription.update({
        where: { id: existingSubscription.id },
        data: subscriptionData
      })
    : await db.subscription.create({
        data: subscriptionData
      });

  const subscription = await db.subscription.findUniqueOrThrow({
    where: { id: writtenSubscription.id },
    include: { plan: true }
  });

  const eventType = existingSubscription
    ? "billing.subscription_snapshot.updated"
    : "billing.subscription_snapshot.created";

  await appendBillingEventLog({
    db,
    organizationId: input.organizationId,
    billingCustomerId,
    subscriptionId: subscription.id,
    planId: subscription.planId,
    recordedByUserId: input.actorUserId ?? null,
    eventSource:
      billingProvider === BillingProvider.STRIPE
        ? BillingEventLogSource.STRIPE
        : BillingEventLogSource.INTERNAL,
    eventType,
    idempotencyKey: `${eventType}:${subscription.id}:${subscription.status}:${subscription.statusUpdatedAt.toISOString()}`,
    sourceReference:
      subscription.stripeSubscriptionId ??
      subscription.stripeCustomerId ??
      null,
    canonicalPlanKey: input.canonicalPlanKey,
    payload: buildSubscriptionLogPayload(subscription, input.metadata)
  });

  await publishDomainEvent(db, {
    type: existingSubscription ? "subscription.updated" : "subscription.created",
    aggregateType: "subscription",
    aggregateId: subscription.id,
    orgId: input.organizationId,
    userId: input.actorUserId ?? null,
    idempotencyKey: `${existingSubscription ? "subscription.updated" : "subscription.created"}:${subscription.id}:${subscription.statusUpdatedAt.toISOString()}`,
    payload: {
      subscriptionId: subscription.id,
      planCode: subscription.plan.code,
      canonicalPlanKey: subscription.canonicalPlanKeySnapshot,
      status: subscription.status,
      accessState: subscription.accessState,
      billingProvider: subscription.billingProvider
    }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.actorUserId ?? null,
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorLabel: input.actorLabel ?? "subscription-domain",
    action: existingSubscription ? "subscription.updated" : "subscription.created",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      planCode: subscription.plan.code,
      canonicalPlanKey: subscription.canonicalPlanKeySnapshot,
      status: subscription.status,
      accessState: subscription.accessState,
      billingProvider: subscription.billingProvider
    },
    requestContext: input.requestContext ?? null
  });

  return subscription;
}
