import "server-only";

import {
  AuditActorType,
  BillingAccessState,
  BillingEventLogSource,
  BillingInterval,
  BillingProvider,
  CanonicalPlanKey,
  Plan,
  Prisma,
  Subscription,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import { publishDomainEvent } from "./domain-events";
import {
  type CanonicalPlanCode,
  getCanonicalCommercialPlanDefinition,
  getCanonicalCommercialPlanCatalog,
  getStripeCheckoutModeForCanonicalPlan,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalBillingCadence,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  resolveRevenuePlanCodeForCanonicalPlan,
  supportsStripeCheckoutForCanonicalPlan
} from "./commercial-catalog";
import { trackProductAnalyticsEvent } from "./product-analytics";
import {
  buildPlanEntitlementConfig,
  getPlanTransitionDirection,
  getRevenuePlanCatalog,
  getStripePriceIdForPlan
} from "./revenue-catalog";
import {
  buildStripeContextMetadata,
  readStripeContextMetadata
} from "./integration-contracts";
import { getOptionalEnv, requireEnv } from "./runtime-config";

type BillingDbClient = Prisma.TransactionClient | typeof prisma;

export type StripePlanResolutionSource =
  | "stripe_price_id"
  | "metadata_plan_code"
  | "existing_subscription";

type StripeCustomerRecord = {
  id: string;
  email?: string | null;
  metadata?: Record<string, string>;
};

type StripeInvoiceRecord = {
  id?: string;
  status?: string | null;
  status_transitions?: {
    paid_at?: number | null;
  } | null;
  last_finalization_error?: {
    message?: string | null;
  } | null;
};

type StripeSubscriptionRecord = {
  id: string;
  customer: string | { id: string };
  status?: string | null;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  canceled_at?: number | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  ended_at?: number | null;
  trial_end?: number | null;
  pause_collection?: Record<string, unknown> | null;
  metadata?: Record<string, string>;
  latest_invoice?: string | StripeInvoiceRecord | null;
  items?: {
    data?: Array<{
      price?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
};

type StripeCheckoutSessionRecord = {
  id: string;
  customer?: string | StripeCustomerRecord | null;
  subscription?: string | StripeSubscriptionRecord | null;
  payment_status?: string | null;
  status?: string | null;
  metadata?: Record<string, string>;
};

function getDefaultPlanCode() {
  const configuredPlanCode = getOptionalEnv("DEFAULT_PLAN_CODE") ?? "scale";
  const canonicalPlanCode =
    resolveCanonicalPlanCode(configuredPlanCode) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(configuredPlanCode) ??
    ("scale" satisfies CanonicalPlanCode);

  return resolveRevenuePlanCodeForCanonicalPlan(canonicalPlanCode) ?? "scale-annual";
}

function normalizeBillingPlanCode(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  return (
    resolveRevenuePlanCodeForCanonicalPlan(
      resolveCanonicalPlanCode(normalized) ??
        resolveCanonicalPlanCodeFromRevenuePlanCode(normalized)
    ) ?? normalized
  );
}

function resolveStripeFallbackPlanCode(input: {
  stripeMetadata: ReturnType<typeof readStripeContextMetadata>;
  fallbackPlanCode?: string | null;
}) {
  return (
    normalizeBillingPlanCode(input.stripeMetadata.revenuePlanCode) ??
    normalizeBillingPlanCode(input.stripeMetadata.planCode) ??
    normalizeBillingPlanCode(input.fallbackPlanCode) ??
    null
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildBillingMetadata(input: {
  stripePriceId?: string | null;
  latestInvoiceId?: string | null;
  latestInvoiceStatus?: string | null;
  source: "trial" | "stripe";
}) {
  return {
    source: input.source,
    stripePriceId: input.stripePriceId ?? null,
    latestInvoiceId: input.latestInvoiceId ?? null,
    latestInvoiceStatus: input.latestInvoiceStatus ?? null
  } satisfies Prisma.InputJsonValue;
}

function inferBillingIntervalMode(interval: string) {
  switch (interval.toLowerCase()) {
    case "monthly":
      return BillingInterval.MONTHLY;
    case "annual":
    case "yearly":
      return BillingInterval.ANNUAL;
    default:
      return BillingInterval.CUSTOM;
  }
}

function mapStripeSubscriptionStatus(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "unpaid":
      return SubscriptionStatus.CANCELED;
    case "paused":
      return SubscriptionStatus.PAUSED;
    case "incomplete":
    case "incomplete_expired":
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

export function resolveStripeSubscriptionStatus(status: string | null | undefined) {
  return mapStripeSubscriptionStatus(status);
}

function fromUnixTimestamp(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value * 1000);
}

function getStripeCustomerId(value: string | StripeCustomerRecord | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getStripeSubscriptionId(
  value: string | StripeSubscriptionRecord | null | undefined
) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getStripeInvoiceRecord(
  value: string | StripeInvoiceRecord | null | undefined
) {
  if (!value || typeof value === "string") {
    return null;
  }

  return value;
}

function determineAccessState(input: {
  status: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  endedAt?: Date | null;
}) {
  const now = Date.now();
  const currentPeriodEndMs = input.currentPeriodEnd?.getTime() ?? null;
  const trialEndsAtMs = input.trialEndsAt?.getTime() ?? null;
  const endedAtMs = input.endedAt?.getTime() ?? null;

  switch (input.status) {
    case SubscriptionStatus.TRIALING:
      return trialEndsAtMs && trialEndsAtMs < now
        ? BillingAccessState.INACTIVE
        : BillingAccessState.TRIALING;
    case SubscriptionStatus.ACTIVE:
      return input.cancelAtPeriodEnd && currentPeriodEndMs && currentPeriodEndMs > now
        ? BillingAccessState.GRACE_PERIOD
        : BillingAccessState.ACTIVE;
    case SubscriptionStatus.PAST_DUE:
      return BillingAccessState.PAST_DUE;
    case SubscriptionStatus.PAUSED:
      return BillingAccessState.PAUSED;
    case SubscriptionStatus.CANCELED:
      return currentPeriodEndMs && currentPeriodEndMs > now
        ? BillingAccessState.GRACE_PERIOD
        : endedAtMs && endedAtMs > now
          ? BillingAccessState.GRACE_PERIOD
          : BillingAccessState.CANCELED;
    case SubscriptionStatus.INCOMPLETE:
    default:
      return BillingAccessState.INCOMPLETE;
  }
}

export function formatPriceCents(priceCents: number, interval: string) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(priceCents / 100);
  return `${formatted} / ${interval}`;
}

export function formatBillingAccessState(accessState: BillingAccessState | null | undefined) {
  if (!accessState) {
    return "Unknown";
  }

  return accessState
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function ensureDefaultPlans() {
  const plans = getRevenuePlanCatalog();

  for (const plan of plans) {
    const stripePriceId = getStripePriceIdForPlan(plan);

    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        canonicalKey: plan.canonicalKey,
        family: plan.family,
        version: plan.version,
        name: plan.name,
        description: plan.description,
        currency: plan.currency,
        billingIntervalMode: plan.billingIntervalMode,
        billingInterval: plan.billingInterval,
        priceCents: plan.priceCents,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        billingProvider: plan.billingProvider,
        billingLookupKey: plan.billingLookupKey,
        stripePriceId: stripePriceId ?? null,
        activeAssessmentsLimit: plan.usageLimits.activeAssessments ?? 0,
        seatsLimit: plan.usageLimits.seats ?? 0,
        frameworksLimit: plan.usageLimits.frameworks ?? 0,
        features: plan.features,
        entitlementConfig: buildPlanEntitlementConfig(plan),
        adminMetadata: plan.adminMetadata
      },
      create: {
        code: plan.code,
        canonicalKey: plan.canonicalKey,
        family: plan.family,
        version: plan.version,
        name: plan.name,
        description: plan.description,
        currency: plan.currency,
        billingIntervalMode: plan.billingIntervalMode,
        billingInterval: plan.billingInterval,
        priceCents: plan.priceCents,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        billingProvider: plan.billingProvider,
        billingLookupKey: plan.billingLookupKey,
        stripePriceId: stripePriceId ?? null,
        activeAssessmentsLimit: plan.usageLimits.activeAssessments ?? 0,
        seatsLimit: plan.usageLimits.seats ?? 0,
        frameworksLimit: plan.usageLimits.frameworks ?? 0,
        features: plan.features,
        entitlementConfig: buildPlanEntitlementConfig(plan),
        adminMetadata: plan.adminMetadata
      }
    });
  }

  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }]
  });
}

export async function listBillablePlans() {
  await ensureDefaultPlans();
  const publicRevenuePlanCodes = getCanonicalCommercialPlanCatalog().flatMap((plan) => {
    if (plan.billingMotion === "stripe_checkout") {
      return [
        resolveRevenuePlanCodeForCanonicalPlan(plan.code, "monthly"),
        resolveRevenuePlanCodeForCanonicalPlan(plan.code, "annual")
      ].filter((value): value is NonNullable<typeof value> => value !== null);
    }

    return plan.publicRevenuePlanCode ? [plan.publicRevenuePlanCode] : [];
  });
  const planOrder = new Map(
    publicRevenuePlanCodes.map((planCode, index) => [planCode, index] as const)
  );

  const plans = await prisma.plan.findMany({
    where: {
      isActive: true,
      isPublic: true,
      code: {
        in: publicRevenuePlanCodes
      }
    }
  });

  return plans.sort(
    (left, right) =>
      (planOrder.get(left.code) ?? Number.MAX_SAFE_INTEGER) -
      (planOrder.get(right.code) ?? Number.MAX_SAFE_INTEGER)
  );
}

async function findPlanByCode(db: BillingDbClient, planCode: string) {
  return db.plan.findUnique({
    where: { code: planCode }
  });
}

async function appendStripeBillingEventLog(
  db: BillingDbClient,
  input: {
    organizationId: string;
    billingCustomerId?: string | null;
    subscriptionId?: string | null;
    planId?: string | null;
    canonicalPlanKey?: CanonicalPlanKey | null;
    planCodeSnapshot?: string | null;
    eventType: string;
    idempotencyKey?: string | null;
    sourceReference?: string | null;
    payload: Prisma.InputJsonValue;
    occurredAt?: Date;
  }
) {
  if (input.idempotencyKey) {
    const existing = await db.billingEventLog.findUnique({
      where: {
        eventSource_idempotencyKey: {
          eventSource: BillingEventLogSource.STRIPE,
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
        eventSource: BillingEventLogSource.STRIPE,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey ?? null,
        sourceReference: input.sourceReference ?? null,
        canonicalPlanKey: input.canonicalPlanKey ?? null,
        planCodeSnapshot: input.planCodeSnapshot ?? null,
        payload: input.payload,
        occurredAt: input.occurredAt ?? new Date()
      }
    });
  }

async function ensureStripeBillingCustomer(
  db: BillingDbClient,
  input: {
    organizationId: string;
    stripeCustomerId: string;
  }
) {
  return db.billingCustomer.upsert({
    where: {
      organizationId_billingProvider: {
        organizationId: input.organizationId,
        billingProvider: BillingProvider.STRIPE
      }
    },
    update: {
      providerCustomerId: input.stripeCustomerId
    },
    create: {
      organizationId: input.organizationId,
      billingProvider: BillingProvider.STRIPE,
      providerCustomerId: input.stripeCustomerId
    }
  });
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

export async function getLatestSubscription(organizationId: string) {
  return findPreferredOrganizationSubscription(prisma, organizationId);
}

export async function getCurrentSubscription(organizationId: string) {
  return findPreferredOrganizationSubscription(prisma, organizationId);
}

function preserveOptionalDate(
  incoming: Date | null | undefined,
  current: Date | null | undefined
) {
  if (incoming === undefined) {
    return current ?? null;
  }

  return incoming;
}

function preserveOptionalString(
  incoming: string | null | undefined,
  current: string | null | undefined
) {
  if (incoming === undefined) {
    return current ?? null;
  }

  return incoming;
}

function preserveOptionalBoolean(
  incoming: boolean | undefined,
  current: boolean | undefined
) {
  if (incoming === undefined) {
    return current ?? false;
  }

  return incoming;
}

function getStripeSecretKey() {
  return getOptionalEnv("STRIPE_SECRET_KEY") ?? "";
}

export function hasStripeBillingConfig() {
  return Boolean(getStripeSecretKey() && getOptionalEnv("STRIPE_WEBHOOK_SECRET"));
}

async function callStripe<T>(
  path: string,
  init?: RequestInit & {
    formBody?: URLSearchParams;
    query?: URLSearchParams;
    idempotencyKey?: string;
  }
) {
  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    requireEnv("STRIPE_SECRET_KEY");
  }

  const queryString = init?.query?.toString();
  const requestPath = queryString ? `${path}?${queryString}` : path;

  const response = await fetch(`https://api.stripe.com/v1/${requestPath}`, {
    method: init?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init?.idempotencyKey
        ? { "Idempotency-Key": init.idempotencyKey }
        : {})
    },
    body: init?.formBody?.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe API error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function ensureStripeCustomerForOrganization(input: {
  organizationId: string;
  email: string;
  existingCustomerId?: string | null;
}) {
  const formBody = new URLSearchParams({
    email: input.email,
    "metadata[organizationId]": input.organizationId
  });

  if (input.existingCustomerId) {
    try {
      const existingCustomer = await callStripe<StripeCustomerRecord>(
        `customers/${input.existingCustomerId}`,
        {
          formBody,
          idempotencyKey: `stripe-customer-update:${input.organizationId}:${input.existingCustomerId}`
        }
      );

      return existingCustomer.id;
    } catch (error) {
      console.warn(
        "Failed to update existing Stripe customer, creating a replacement customer instead.",
        error
      );
    }
  }

  const customer = await callStripe<StripeCustomerRecord>("customers", {
    formBody,
    idempotencyKey: `stripe-customer-create:${input.organizationId}:${input.email}`
  });

  return customer.id;
}

async function retrieveStripeSubscription(stripeSubscriptionId: string) {
  const query = new URLSearchParams();
  query.append("expand[]", "latest_invoice");

  return callStripe<StripeSubscriptionRecord>(`subscriptions/${stripeSubscriptionId}`, {
    method: "GET",
    query
  });
}

export async function retrieveStripeCheckoutSession(checkoutSessionId: string) {
  const query = new URLSearchParams();
  query.append("expand[]", "customer");
  query.append("expand[]", "subscription");
  query.append("expand[]", "subscription.latest_invoice");

  return callStripe<StripeCheckoutSessionRecord>(
    `checkout/sessions/${checkoutSessionId}`,
    {
      method: "GET",
      query
    }
  );
}

export async function createTrialSubscription(
  organizationId: string,
  options?: {
    db?: BillingDbClient;
    userId?: string | null;
    planCode?: string | null;
    actorType?: AuditActorType;
    actorLabel?: string | null;
    requestContext?: Prisma.InputJsonValue | null;
  }
) {
  const db = options?.db ?? prisma;
  await ensureDefaultPlans();
  const defaultPlanCode = options?.planCode ?? getDefaultPlanCode();
  const defaultPlan =
    (await findPlanByCode(db, defaultPlanCode)) ??
    (await db.plan.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }]
    }));

  if (!defaultPlan) {
    throw new Error("No default plan is configured.");
  }

  const existingSubscription = await db.subscription.findFirst({
    where: { organizationId },
    orderBy: { updatedAt: "desc" }
  });

  if (existingSubscription) {
    return db.subscription.findFirstOrThrow({
      where: { id: existingSubscription.id },
      include: { plan: true }
    });
  }

  const now = new Date();
  const trialEndsAt = addDays(now, defaultPlan.trialDays);

  const subscription = await db.subscription.create({
    data: {
      organizationId,
      planId: defaultPlan.id,
      canonicalPlanKeySnapshot: defaultPlan.canonicalKey,
      accessState: BillingAccessState.TRIALING,
      billingProvider: defaultPlan.billingProvider,
      externalStatus: SubscriptionStatus.TRIALING,
      planCodeSnapshot: defaultPlan.code,
      status: SubscriptionStatus.TRIALING,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      accessEndsAt: trialEndsAt,
      trialStartedAt: now,
      trialEndsAt,
      reactivatedAt: now,
      statusUpdatedAt: now,
      billingMetadata: buildBillingMetadata({
        source: "trial"
      })
    },
    include: {
      plan: true
    }
  });

  await publishDomainEvent(db, {
    type: "subscription.created",
    aggregateType: "subscription",
    aggregateId: subscription.id,
    orgId: organizationId,
    userId: options?.userId ?? null,
    idempotencyKey: `subscription.created:${subscription.id}`,
    payload: {
      organizationId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      planCode: subscription.plan.code,
      canonicalPlanKey: subscription.canonicalPlanKeySnapshot,
      status: subscription.status,
      accessState: subscription.accessState,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null
    }
  });

  await writeAuditLog(db, {
    organizationId,
    userId: options?.userId ?? null,
    actorType: options?.actorType ?? AuditActorType.USER,
    actorLabel: options?.actorLabel ?? null,
    action: "subscription.created",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: {
      planCode: subscription.plan.code,
      canonicalPlanKey: subscription.canonicalPlanKeySnapshot,
      status: subscription.status,
      accessState: subscription.accessState,
      source: "trial"
    },
    requestContext: options?.requestContext ?? null
  });

  return subscription;
}

export async function resolvePlanForStripeSubscription(
  db: BillingDbClient,
  input: {
    organizationId: string;
    stripeSubscriptionId: string;
    stripePriceId?: string | null;
    fallbackPlanCode?: string | null;
  }
): Promise<{ plan: Plan | null; source: StripePlanResolutionSource | null }> {
  if (input.stripePriceId) {
    const mappedPlan = await db.plan.findFirst({
      where: { stripePriceId: input.stripePriceId }
    });

    if (mappedPlan) {
      return {
        plan: mappedPlan,
        source: "stripe_price_id"
      };
    }
  }

  if (input.fallbackPlanCode) {
    const fallbackPlan = await db.plan.findUnique({
      where: { code: input.fallbackPlanCode }
    });

    if (fallbackPlan) {
      return {
        plan: fallbackPlan,
        source: "metadata_plan_code"
      };
    }
  }

  const existingSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
    include: { plan: true }
  });

  if (existingSubscription?.plan) {
    return {
      plan: existingSubscription.plan,
      source: "existing_subscription"
    };
  }

  return {
    plan: null,
    source: null
  };
}

function buildTransitionMetadata(input: {
  previousPlanCode: string | null | undefined;
  nextPlanCode: string;
  previousStatus: SubscriptionStatus | null | undefined;
  nextStatus: SubscriptionStatus;
  accessState: BillingAccessState;
  currentPeriodEnd: Date | null;
  latestInvoiceStatus: string | null;
  stripePriceId: string | null;
}) {
  return {
    planTransition: getPlanTransitionDirection(
      input.previousPlanCode,
      input.nextPlanCode
    ),
    previousPlanCode: input.previousPlanCode ?? null,
    nextPlanCode: input.nextPlanCode,
    previousStatus: input.previousStatus ?? null,
    nextStatus: input.nextStatus,
    accessState: input.accessState,
    currentPeriodEnd: input.currentPeriodEnd?.toISOString() ?? null,
    latestInvoiceStatus: input.latestInvoiceStatus,
    stripePriceId: input.stripePriceId
  };
}

export async function createStripeCheckoutSession(input: {
  organizationId: string;
  email: string;
  planCode: string;
  billingCadence?: "monthly" | "annual" | null;
  successUrl: string;
  cancelUrl: string;
}) {
  await ensureDefaultPlans();
  const canonicalPlanCode =
    resolveCanonicalPlanCode(input.planCode) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(input.planCode);
  const billingCadence = resolveCanonicalBillingCadence(
    input.billingCadence ?? undefined,
    "annual"
  );
  const resolvedPlanCode =
    canonicalPlanCode
      ? resolveRevenuePlanCodeForCanonicalPlan(canonicalPlanCode, billingCadence)
      : input.planCode;

  if (canonicalPlanCode && !supportsStripeCheckoutForCanonicalPlan(canonicalPlanCode)) {
    throw new Error(
      `${getCanonicalCommercialPlanDefinition(canonicalPlanCode)?.displayName ?? "Enterprise"} is sales-led and does not support direct checkout.`
    );
  }

  const plan = await prisma.plan.findUnique({
    where: { code: resolvedPlanCode ?? input.planCode }
  });

  if (!plan?.stripePriceId) {
    throw new Error(`Plan ${resolvedPlanCode ?? input.planCode} is not mapped to a Stripe price.`);
  }

  const metadataPlanCode =
    canonicalPlanCode ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(plan.code) ??
    mapCanonicalPlanKeyToCanonicalPlanCode(plan.canonicalKey);
  const checkoutMode = getStripeCheckoutModeForCanonicalPlan(metadataPlanCode) ?? "subscription";

  const stripeMetadata = buildStripeContextMetadata({
    organizationId: input.organizationId,
    customerEmail: input.email,
    planKey: metadataPlanCode,
    planCode: metadataPlanCode,
    revenuePlanCode: plan.code,
    source: "app.checkout",
    workflowType: "subscription_checkout"
  });

  const currentSubscription = await getCurrentSubscription(input.organizationId);
  const stripeCustomerId = await ensureStripeCustomerForOrganization({
    organizationId: input.organizationId,
    email: input.email,
    existingCustomerId: currentSubscription?.stripeCustomerId ?? null
  });

  const session = await callStripe<{ id: string; url: string }>("checkout/sessions", {
    formBody: new URLSearchParams({
      mode: checkoutMode,
      customer: stripeCustomerId,
      client_reference_id: input.organizationId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: "true",
      "customer_update[address]": "auto",
      "customer_update[name]": "auto",
      "line_items[0][price]": plan.stripePriceId,
      "line_items[0][quantity]": "1",
      ...Object.fromEntries(
        Object.entries(stripeMetadata).flatMap(([key, value]) =>
          [
            [`metadata[${key}]`, value],
            [`subscription_data[metadata][${key}]`, value]
          ]
        )
      )
    }),
    idempotencyKey: `stripe-checkout:${input.organizationId}:${resolvedPlanCode ?? input.planCode}:${stripeCustomerId}`
  });

  return {
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    stripeCustomerId
  };
}

export async function createStripeBillingPortalSession(input: {
  organizationId: string;
  returnUrl: string;
}) {
  const subscription = await getCurrentSubscription(input.organizationId);

  if (!subscription?.stripeCustomerId) {
    throw new Error("This organization does not have a Stripe customer yet.");
  }

  const session = await callStripe<{ url: string }>("billing_portal/sessions", {
    formBody: new URLSearchParams({
      customer: subscription.stripeCustomerId,
      return_url: input.returnUrl
    }),
    idempotencyKey: `stripe-portal:${input.organizationId}:${subscription.stripeCustomerId}`
  });

  return session.url;
}

export async function upsertSubscriptionFromStripe(input: {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string | null;
  fallbackPlanCode?: string | null;
  status: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelScheduledAt?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
  endedAt?: Date | null;
  latestInvoiceId?: string | null;
  latestInvoiceStatus?: string | null;
  lastInvoicePaidAt?: Date | null;
  lastPaymentFailedAt?: Date | null;
  lastPaymentFailureMessage?: string | null;
  db?: BillingDbClient;
  auditActorType?: AuditActorType;
  auditActorLabel?: string | null;
  auditUserId?: string | null;
  auditRequestContext?: Prisma.InputJsonValue | null;
}) {
  const db = input.db ?? prisma;
  const planResolution = await resolvePlanForStripeSubscription(db, {
    organizationId: input.organizationId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripePriceId: input.stripePriceId,
    fallbackPlanCode: input.fallbackPlanCode
  });
  const plan = planResolution.plan;

  if (!plan) {
    throw new Error(
      "Unable to resolve a Stripe plan mapping for the incoming subscription."
    );
  }

  const existingByStripeSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: input.stripeSubscriptionId }
  });

  const existingByCustomer = await db.subscription.findFirst({
    where: {
      organizationId: input.organizationId,
      stripeCustomerId: input.stripeCustomerId
    },
    orderBy: { updatedAt: "desc" }
  });

  const existingTrialPlaceholder =
    existingByStripeSubscription ??
    existingByCustomer ??
    (await db.subscription.findFirst({
      where: {
        organizationId: input.organizationId,
        stripeSubscriptionId: null
      },
      orderBy: { updatedAt: "desc" }
    }));
  const billingCustomer = await ensureStripeBillingCustomer(db, {
    organizationId: input.organizationId,
    stripeCustomerId: input.stripeCustomerId
  });

  const currentPeriodStart = preserveOptionalDate(
    input.currentPeriodStart,
    existingTrialPlaceholder?.currentPeriodStart
  );
  const currentPeriodEnd = preserveOptionalDate(
    input.currentPeriodEnd,
    existingTrialPlaceholder?.currentPeriodEnd
  );
  const trialEndsAt = preserveOptionalDate(
    input.trialEndsAt,
    existingTrialPlaceholder?.trialEndsAt
  );
  const cancelAtPeriodEnd = preserveOptionalBoolean(
    input.cancelAtPeriodEnd,
    existingTrialPlaceholder?.cancelAtPeriodEnd
  );
  const latestInvoiceId = preserveOptionalString(
    input.latestInvoiceId,
    existingTrialPlaceholder?.latestInvoiceId
  );
  const latestInvoiceStatus = preserveOptionalString(
    input.latestInvoiceStatus,
    existingTrialPlaceholder?.latestInvoiceStatus
  );
  const lastInvoicePaidAt = preserveOptionalDate(
    input.lastInvoicePaidAt,
    existingTrialPlaceholder?.lastInvoicePaidAt
  );
  const lastPaymentFailedAt = preserveOptionalDate(
    input.lastPaymentFailedAt,
    existingTrialPlaceholder?.lastPaymentFailedAt
  );
  const lastPaymentFailureMessage = preserveOptionalString(
    input.lastPaymentFailureMessage,
    existingTrialPlaceholder?.lastPaymentFailureMessage
  );

  const previousStatus = existingTrialPlaceholder?.status ?? null;
  const previousAccessState = existingTrialPlaceholder?.accessState ?? null;
  const previousPlanCode = existingTrialPlaceholder?.planCodeSnapshot ?? null;
  const now = new Date();
  const isReactivatedStatus =
    input.status === SubscriptionStatus.ACTIVE ||
    input.status === SubscriptionStatus.TRIALING;
  const cancelScheduledAt = preserveOptionalDate(
    input.cancelScheduledAt ??
      (cancelAtPeriodEnd
        ? currentPeriodEnd ?? existingTrialPlaceholder?.cancelScheduledAt ?? now
        : null),
    existingTrialPlaceholder?.cancelScheduledAt
  );
  const canceledAt = isReactivatedStatus
    ? null
    : input.status === SubscriptionStatus.CANCELED
      ? input.canceledAt ?? existingTrialPlaceholder?.canceledAt ?? now
      : preserveOptionalDate(input.canceledAt, existingTrialPlaceholder?.canceledAt);
  const endedAt = isReactivatedStatus
    ? null
    : input.status === SubscriptionStatus.CANCELED
      ? input.endedAt ??
        currentPeriodEnd ??
        canceledAt ??
        existingTrialPlaceholder?.endedAt ??
        now
      : preserveOptionalDate(input.endedAt, existingTrialPlaceholder?.endedAt);
  const accessState = determineAccessState({
    status: input.status,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    trialEndsAt,
    endedAt
  });
  const gracePeriodEndsAt =
    cancelAtPeriodEnd && currentPeriodEnd ? currentPeriodEnd : null;
  const accessEndsAt =
    accessState === BillingAccessState.CANCELED
      ? endedAt
      : currentPeriodEnd ?? trialEndsAt ?? null;
  const reactivatedAt =
    previousStatus &&
    previousStatus !== input.status &&
    (input.status === SubscriptionStatus.ACTIVE ||
      input.status === SubscriptionStatus.TRIALING)
      ? now
      : existingTrialPlaceholder?.reactivatedAt ??
        (input.status === SubscriptionStatus.ACTIVE ||
        input.status === SubscriptionStatus.TRIALING
          ? now
          : null);
  const trialStartedAt =
    input.status === SubscriptionStatus.TRIALING
      ? existingTrialPlaceholder?.trialStartedAt ?? currentPeriodStart ?? now
      : existingTrialPlaceholder?.trialStartedAt ?? null;
  const statusUpdatedAt =
    previousStatus === input.status ? existingTrialPlaceholder?.statusUpdatedAt ?? now : now;

  const subscriptionPayload = {
    organizationId: input.organizationId,
    planId: plan.id,
    billingCustomerId: billingCustomer.id,
    canonicalPlanKeySnapshot: plan.canonicalKey,
    accessState,
    billingProvider: BillingProvider.STRIPE,
    externalStatus: input.status,
    planCodeSnapshot: plan.code,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripePriceIdSnapshot: input.stripePriceId ?? existingTrialPlaceholder?.stripePriceIdSnapshot ?? null,
    status: input.status,
    currentPeriodStart,
    currentPeriodEnd,
    accessEndsAt,
    gracePeriodEndsAt,
    trialStartedAt,
    trialEndsAt,
    cancelAtPeriodEnd,
    cancelScheduledAt,
    canceledAt,
    endedAt,
    reactivatedAt,
    statusUpdatedAt,
    latestInvoiceId,
    latestInvoiceStatus,
    lastInvoicePaidAt,
    lastPaymentFailedAt,
    lastPaymentFailureMessage,
    billingMetadata: buildBillingMetadata({
      stripePriceId: input.stripePriceId ?? null,
      latestInvoiceId,
      latestInvoiceStatus,
      source: "stripe"
    })
  } satisfies Prisma.SubscriptionUncheckedUpdateInput;

  const subscription = existingTrialPlaceholder
    ? await db.subscription.update({
        where: { id: existingTrialPlaceholder.id },
        data: subscriptionPayload
      })
    : await db.subscription.create({
        data: subscriptionPayload
      });

  await publishDomainEvent(db, {
    type:
      existingTrialPlaceholder && previousPlanCode === plan.code && previousStatus === input.status
        ? "subscription.updated"
        : existingTrialPlaceholder
          ? "subscription.updated"
          : "subscription.created",
    aggregateType: "subscription",
    aggregateId: subscription.id,
    orgId: input.organizationId,
    idempotencyKey: existingTrialPlaceholder
      ? `subscription.updated:${subscription.id}:${input.status}:${currentPeriodEnd?.toISOString() ?? "none"}:${plan.code}`
      : `subscription.created:${subscription.id}`,
    payload: buildTransitionMetadata({
      previousPlanCode,
      nextPlanCode: plan.code,
      previousStatus,
      nextStatus: input.status,
      accessState,
      currentPeriodEnd,
      latestInvoiceStatus,
      stripePriceId: input.stripePriceId ?? null
    })
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.auditUserId ?? null,
    actorType: input.auditActorType ?? AuditActorType.SYSTEM,
    actorLabel: input.auditActorLabel ?? "billing-sync",
    action: existingTrialPlaceholder ? "subscription.updated" : "subscription.created",
    entityType: "subscription",
    entityId: subscription.id,
    metadata: buildTransitionMetadata({
      previousPlanCode,
      nextPlanCode: plan.code,
      previousStatus,
      nextStatus: input.status,
      accessState,
      currentPeriodEnd,
      latestInvoiceStatus,
      stripePriceId: input.stripePriceId ?? null
    }),
    requestContext: input.auditRequestContext ?? null
  });

  await appendStripeBillingEventLog(db, {
    organizationId: input.organizationId,
    billingCustomerId: billingCustomer.id,
    subscriptionId: subscription.id,
    planId: plan.id,
    canonicalPlanKey: plan.canonicalKey,
    planCodeSnapshot: plan.code,
    eventType: existingTrialPlaceholder
      ? "stripe.subscription_snapshot.updated"
      : "stripe.subscription_snapshot.created",
    idempotencyKey: `stripe.subscription_snapshot:${input.stripeSubscriptionId}:${input.status}:${latestInvoiceStatus ?? "none"}:${currentPeriodEnd?.toISOString() ?? "none"}:${input.stripePriceId ?? "no-price"}`,
    sourceReference: input.stripeSubscriptionId,
    payload: {
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId ?? null,
      previousPlanCode,
      nextPlanCode: plan.code,
      previousStatus,
      nextStatus: input.status,
      accessState,
      latestInvoiceId,
      latestInvoiceStatus,
      planResolutionSource: planResolution.source
    }
  });

  const planTransition = getPlanTransitionDirection(previousPlanCode, plan.code);
  const cancellationScheduledNow =
    Boolean(cancelAtPeriodEnd) && !existingTrialPlaceholder?.cancelAtPeriodEnd;
  const reactivatedNow =
    previousAccessState !== null &&
    previousAccessState !== accessState &&
    (previousAccessState === BillingAccessState.CANCELED ||
      previousAccessState === BillingAccessState.GRACE_PERIOD ||
      previousAccessState === BillingAccessState.PAST_DUE ||
      previousAccessState === BillingAccessState.PAUSED ||
      previousAccessState === BillingAccessState.INACTIVE ||
      previousAccessState === BillingAccessState.INCOMPLETE) &&
    (accessState === BillingAccessState.ACTIVE ||
      accessState === BillingAccessState.TRIALING);

  if (planTransition === "upgrade" && previousPlanCode && previousPlanCode !== plan.code) {
    await trackProductAnalyticsEvent({
      db,
      name: "revenue.upgrade_completed",
      payload: {
        fromPlanCode: previousPlanCode,
        toPlanCode: plan.code
      },
      source: "stripe-sync",
      path: "/api/stripe/webhook",
      organizationId: input.organizationId,
      userId: input.auditUserId ?? null,
      billingPlanCode: plan.code,
      attribution: null
    });
  }

  if (cancellationScheduledNow) {
    await trackProductAnalyticsEvent({
      db,
      name: "billing.cancellation_scheduled",
      payload: {
        planCode: plan.code,
        accessEndsAt: accessEndsAt?.toISOString() ?? null
      },
      source: "stripe-sync",
      path: "/api/stripe/webhook",
      organizationId: input.organizationId,
      userId: input.auditUserId ?? null,
      billingPlanCode: plan.code,
      attribution: null
    });
  }

  if (reactivatedNow) {
    await trackProductAnalyticsEvent({
      db,
      name: "billing.reactivated",
      payload: {
        planCode: plan.code
      },
      source: "stripe-sync",
      path: "/api/stripe/webhook",
      organizationId: input.organizationId,
      userId: input.auditUserId ?? null,
      billingPlanCode: plan.code,
      attribution: null
    });
  }

  return db.subscription.findUniqueOrThrow({
    where: { id: subscription.id },
    include: { plan: true }
  });
}

export function getPlanDisplaySummary(plan: Pick<Plan, "activeAssessmentsLimit" | "seatsLimit" | "frameworksLimit">) {
  return `${plan.activeAssessmentsLimit} active assessments | ${plan.seatsLimit} seats | ${plan.frameworksLimit} frameworks`;
}

export function getSubscriptionLifecycleLabel(
  subscription: Pick<Subscription, "status" | "accessState" | "cancelAtPeriodEnd">
) {
  if (subscription.accessState === BillingAccessState.GRACE_PERIOD) {
    return subscription.cancelAtPeriodEnd ? "Scheduled to cancel" : "Grace period";
  }

  return formatBillingAccessState(subscription.accessState);
}

export function getPlanCatalogAssumptions() {
  return {
    defaultPlanCode: getDefaultPlanCode(),
    supportedBillingProvider: BillingProvider.STRIPE,
    publicPlanCount: getRevenuePlanCatalog().filter((plan) => plan.isPublic).length
  };
}

export function normalizeLegacyBillingInterval(interval: string | null | undefined) {
  if (!interval) {
    return BillingInterval.ANNUAL;
  }

  return inferBillingIntervalMode(interval);
}

export async function synchronizeStripeSubscription(input: {
  organizationId: string;
  stripeSubscriptionId: string;
  fallbackPlanCode?: string | null;
  db?: BillingDbClient;
  auditActorType?: AuditActorType;
  auditActorLabel?: string | null;
  auditUserId?: string | null;
  auditRequestContext?: Prisma.InputJsonValue | null;
}) {
  const stripeSubscription = await retrieveStripeSubscription(input.stripeSubscriptionId);
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer);
  const subscriptionMetadata = readStripeContextMetadata(stripeSubscription.metadata);

  if (!stripeCustomerId) {
    throw new Error("Stripe subscription is missing a customer reference.");
  }

  const latestInvoice = getStripeInvoiceRecord(stripeSubscription.latest_invoice);
  const derivedStatus = stripeSubscription.pause_collection
    ? SubscriptionStatus.PAUSED
    : mapStripeSubscriptionStatus(stripeSubscription.status);

  return upsertSubscriptionFromStripe({
    db: input.db,
    organizationId: input.organizationId,
    stripeCustomerId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: stripeSubscription.items?.data?.[0]?.price?.id ?? null,
    fallbackPlanCode: resolveStripeFallbackPlanCode({
      stripeMetadata: subscriptionMetadata,
      fallbackPlanCode: input.fallbackPlanCode
    }),
    status: derivedStatus,
    currentPeriodStart: fromUnixTimestamp(stripeSubscription.current_period_start),
    currentPeriodEnd: fromUnixTimestamp(stripeSubscription.current_period_end),
    cancelAtPeriodEnd:
      typeof stripeSubscription.cancel_at_period_end === "boolean"
        ? stripeSubscription.cancel_at_period_end
        : undefined,
    cancelScheduledAt: fromUnixTimestamp(
      stripeSubscription.cancel_at ??
        stripeSubscription.current_period_end ??
        null
    ),
    trialEndsAt: fromUnixTimestamp(stripeSubscription.trial_end),
    canceledAt: fromUnixTimestamp(stripeSubscription.canceled_at),
    endedAt: fromUnixTimestamp(stripeSubscription.ended_at),
    latestInvoiceId:
      latestInvoice?.id ??
      (typeof stripeSubscription.latest_invoice === "string"
        ? stripeSubscription.latest_invoice
        : undefined),
    latestInvoiceStatus: latestInvoice?.status ?? undefined,
    lastInvoicePaidAt:
      latestInvoice?.status === "paid"
        ? fromUnixTimestamp(latestInvoice.status_transitions?.paid_at) ?? new Date()
        : undefined,
    lastPaymentFailureMessage:
      latestInvoice?.last_finalization_error?.message ?? undefined,
    auditActorType: input.auditActorType,
    auditActorLabel: input.auditActorLabel,
    auditUserId: input.auditUserId,
    auditRequestContext: input.auditRequestContext
  });
}

export async function synchronizeStripeCheckoutSession(input: {
  organizationId: string;
  checkoutSessionId: string;
  fallbackPlanCode?: string | null;
  db?: BillingDbClient;
  auditActorType?: AuditActorType;
  auditActorLabel?: string | null;
  auditUserId?: string | null;
  auditRequestContext?: Prisma.InputJsonValue | null;
}) {
  const checkoutSession = await retrieveStripeCheckoutSession(input.checkoutSessionId);
  const stripeSubscriptionId = getStripeSubscriptionId(checkoutSession.subscription);
  const checkoutMetadata = readStripeContextMetadata(checkoutSession.metadata);

  if (!stripeSubscriptionId) {
    return null;
  }

  return synchronizeStripeSubscription({
    organizationId: input.organizationId,
    stripeSubscriptionId,
    fallbackPlanCode: resolveStripeFallbackPlanCode({
      stripeMetadata: checkoutMetadata,
      fallbackPlanCode: input.fallbackPlanCode
    }),
    db: input.db,
    auditActorType: input.auditActorType,
    auditActorLabel: input.auditActorLabel,
    auditUserId: input.auditUserId,
    auditRequestContext: input.auditRequestContext
  });
}

