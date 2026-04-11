import {
  AuditActorType,
  BillingAccessState,
  CanonicalPlanKey,
  CanonicalWorkflowCode,
  CommercialPlanCode,
  Prisma,
  RoutingSnapshot,
  RoutingSnapshotStatus,
  SubscriptionStatus,
  UserRole,
  prisma
} from "@evolve-edge/db";
import { buildAuditRequestContextFromRequest } from "./audit";
import { writeAuditLog } from "./audit";
import {
  getCanonicalWorkflowCodeForPlan,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import { getOrganizationEntitlements } from "./entitlements";
import { getIntegrationEnvironmentLabel, readStripeContextMetadata } from "./integration-contracts";
import { buildCorrelationId } from "./reliability";
import {
  getCanonicalPlanKeyFromPlanCode,
  getRevenuePlanCatalog,
  getStripePriceIdForPlan,
  type RevenuePlanDefinition
} from "./revenue-catalog";
import { getOptionalEnv } from "./runtime-config";
import { ensureOrganizationBillingCustomer } from "./subscription-domain";

type CommercialRoutingDbClient = Prisma.TransactionClient | typeof prisma;

type StripeLikeObject = Record<string, any>;

export type NormalizedCommercialPlanCode = "starter" | "scale" | "enterprise";
export type NormalizedWorkflowCode =
  | "audit_starter"
  | "audit_scale"
  | "audit_enterprise"
  | "briefing_only"
  | "intake_review";

export type NormalizedRoutingHints = {
  workflow_family: "audit";
  workflow_code: NormalizedWorkflowCode;
  processing_tier: "starter" | "scale" | "enterprise" | "manual_review";
  route_category: "standard" | "trial" | "fallback" | "blocked";
  entitlement_summary: {
    workspace_access: boolean;
    reports_generate: boolean;
    monitoring_manage: boolean;
    executive_delivery: boolean;
    custom_frameworks: boolean;
    priority_support: boolean;
  };
  quota_state: {
    audits_remaining: number | null;
    uploads_remaining: number | null;
    documents_processed_remaining: number | null;
  };
  feature_flags: {
    monitoring_enabled: boolean;
    control_scoring_enabled: boolean;
    demo_safeguards_active: boolean;
    enterprise_override_active: boolean;
  };
};

export type CommercialRoutingReason = {
  codes: string[];
  summary: string;
  matched_rules: string[];
  fallback_applied: boolean;
};

export type CommercialRoutingDecision = {
  planCode: CommercialPlanCode;
  workflowCode: CanonicalWorkflowCode;
  normalizedPlanCode: NormalizedCommercialPlanCode;
  normalizedWorkflowCode: NormalizedWorkflowCode;
  entitlementsJson: Prisma.JsonObject;
  normalizedHintsJson: Prisma.JsonObject;
  routingReasonJson: Prisma.JsonObject;
  status: RoutingSnapshotStatus;
  commercialStateJson: Prisma.JsonObject;
};

type StripeCommercialMapping = {
  planCode: CommercialPlanCode;
  matchedBy: "price_id" | "product_id" | "metadata_plan_key" | "metadata_plan_code" | "subscription_plan";
  matchedValue: string;
  revenuePlanCode: string | null;
  canonicalPlanKey: CanonicalPlanKey | null;
};

function compactString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = compactString(value)?.toLowerCase();
  return normalized ?? null;
}

function asCommercialPlanCode(
  value: string | null | undefined
): CommercialPlanCode | null {
  switch (resolveCanonicalPlanCode(value)) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "scale":
      return CommercialPlanCode.SCALE;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    default:
      return null;
  }
}

function normalizeCommercialPlanFromCanonicalKey(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
): CommercialPlanCode {
  switch (mapCanonicalPlanKeyToCanonicalPlanCode(canonicalPlanKey)) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
    default:
      return CommercialPlanCode.SCALE;
  }
}

function normalizeWorkflowCode(workflowCode: CanonicalWorkflowCode): NormalizedWorkflowCode {
  switch (workflowCode) {
    case CanonicalWorkflowCode.AUDIT_STARTER:
      return "audit_starter";
    case CanonicalWorkflowCode.AUDIT_SCALE:
      return "audit_scale";
    case CanonicalWorkflowCode.AUDIT_ENTERPRISE:
      return "audit_enterprise";
    case CanonicalWorkflowCode.BRIEFING_ONLY:
      return "briefing_only";
    case CanonicalWorkflowCode.INTAKE_REVIEW:
    default:
      return "intake_review";
  }
}

function normalizeWorkflowCodeValue(
  workflowCode: NormalizedWorkflowCode
): CanonicalWorkflowCode {
  switch (workflowCode) {
    case "audit_starter":
      return CanonicalWorkflowCode.AUDIT_STARTER;
    case "audit_enterprise":
      return CanonicalWorkflowCode.AUDIT_ENTERPRISE;
    case "audit_scale":
      return CanonicalWorkflowCode.AUDIT_SCALE;
    case "briefing_only":
      return CanonicalWorkflowCode.BRIEFING_ONLY;
    case "intake_review":
    default:
      return CanonicalWorkflowCode.INTAKE_REVIEW;
  }
}

function normalizePlanCode(planCode: CommercialPlanCode): NormalizedCommercialPlanCode {
  switch (planCode) {
    case CommercialPlanCode.STARTER:
      return "starter";
    case CommercialPlanCode.ENTERPRISE:
      return "enterprise";
    case CommercialPlanCode.SCALE:
    default:
      return "scale";
  }
}

function buildCommercialPlanMappings() {
  const revenuePlans = getRevenuePlanCatalog();
  const entries = revenuePlans.map((plan) => {
    const commercialPlanCode = normalizeCommercialPlanFromCanonicalKey(plan.canonicalKey);
    return {
      commercialPlanCode,
      revenuePlanCode: plan.code,
      canonicalPlanKey: plan.canonicalKey,
      stripePriceId: getStripePriceIdForPlan(plan),
      stripeProductId: getOptionalEnv(getStripeProductEnvVarForPlan(plan)) ?? null
    };
  });

  return entries;
}

function getStripeProductEnvVarForPlan(plan: RevenuePlanDefinition) {
  switch (normalizeCommercialPlanFromCanonicalKey(plan.canonicalKey)) {
    case CommercialPlanCode.STARTER:
      return "STRIPE_PRODUCT_STARTER";
    case CommercialPlanCode.ENTERPRISE:
      return "STRIPE_PRODUCT_ENTERPRISE";
    case CommercialPlanCode.SCALE:
    default:
      return "STRIPE_PRODUCT_SCALE";
  }
}

function getStripeObjectPriceId(object: StripeLikeObject) {
  const directPriceId = compactString(object.price?.id);
  if (directPriceId) {
    return directPriceId;
  }

  const nestedPriceId = compactString(object.items?.data?.[0]?.price?.id);
  return nestedPriceId ?? null;
}

function getStripeObjectProductId(object: StripeLikeObject) {
  const directProductId = compactString(
    typeof object.price?.product === "string"
      ? object.price.product
      : object.price?.product?.id
  );
  if (directProductId) {
    return directProductId;
  }

  const nestedProduct = object.items?.data?.[0]?.price?.product;
  return compactString(typeof nestedProduct === "string" ? nestedProduct : nestedProduct?.id);
}

export function resolveCommercialPlanFromStripeContext(input: {
  metadata?: unknown;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  fallbackPlanCode?: string | null;
}): StripeCommercialMapping | null {
  const metadata = readStripeContextMetadata(input.metadata);
  const mappings = buildCommercialPlanMappings();
  const metadataPlanKey = asCommercialPlanCode(metadata.planKey);

  if (metadataPlanKey) {
    return {
      planCode: metadataPlanKey,
      matchedBy: "metadata_plan_key",
      matchedValue: metadata.planKey!,
      revenuePlanCode: metadata.planCode,
      canonicalPlanKey: getCanonicalPlanKeyFromPlanCode(metadata.planCode)
    };
  }

  const metadataPlanCode = compactString(metadata.planCode);
  if (metadataPlanCode) {
    const metadataCanonicalPlanCode =
      resolveCanonicalPlanCode(metadataPlanCode) ??
      resolveCanonicalPlanCodeFromRevenuePlanCode(metadataPlanCode);
    const canonicalPlanKey =
      getCanonicalPlanKeyFromPlanCode(metadata.revenuePlanCode ?? metadataPlanCode);
    if (metadataCanonicalPlanCode) {
      const resolvedPlanCode = asCommercialPlanCode(metadataCanonicalPlanCode);
      if (!resolvedPlanCode) {
        return null;
      }

      return {
        planCode: resolvedPlanCode,
        matchedBy: "metadata_plan_code",
        matchedValue: metadataPlanCode,
        revenuePlanCode: metadata.revenuePlanCode ?? metadataPlanCode,
        canonicalPlanKey
      };
    }
  }

  const priceMatch =
    input.stripePriceId &&
    mappings.find((mapping) => mapping.stripePriceId === input.stripePriceId);
  if (priceMatch) {
    return {
      planCode: priceMatch.commercialPlanCode,
      matchedBy: "price_id",
      matchedValue: input.stripePriceId!,
      revenuePlanCode: priceMatch.revenuePlanCode,
      canonicalPlanKey: priceMatch.canonicalPlanKey
    };
  }

  const productMatch =
    input.stripeProductId &&
    mappings.find((mapping) => mapping.stripeProductId === input.stripeProductId);
  if (productMatch) {
    return {
      planCode: productMatch.commercialPlanCode,
      matchedBy: "product_id",
      matchedValue: input.stripeProductId!,
      revenuePlanCode: productMatch.revenuePlanCode,
      canonicalPlanKey: productMatch.canonicalPlanKey
    };
  }

  if (input.fallbackPlanCode) {
    const canonicalPlanKey = getCanonicalPlanKeyFromPlanCode(input.fallbackPlanCode);
    if (canonicalPlanKey) {
      return {
        planCode: normalizeCommercialPlanFromCanonicalKey(canonicalPlanKey),
        matchedBy: "subscription_plan",
        matchedValue: input.fallbackPlanCode,
        revenuePlanCode: input.fallbackPlanCode,
        canonicalPlanKey
      };
    }
  }

  return null;
}

export async function resolveOrCreateCommercialUser(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  db?: CommercialRoutingDbClient;
}) {
  const db = input.db ?? prisma;
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("A valid customer email is required to resolve commercial routing.");
  }

  const existing = await db.user.findUnique({
    where: { email }
  });
  if (existing) {
    return existing;
  }

  return db.user.create({
    data: {
      email,
      firstName: compactString(input.firstName) ?? null,
      lastName: compactString(input.lastName) ?? null
    }
  });
}

function deriveCompanyNameFromCheckout(object: StripeLikeObject, email: string | null) {
  return (
    compactString(object.customer_details?.company) ??
    compactString(object.customer_details?.name) ??
    compactString(object.customer?.name) ??
    (email ? email.split("@")[0].replace(/[._-]+/g, " ") : null) ??
    "Stripe customer workspace"
  );
}

async function ensureOwnerMembership(input: {
  organizationId: string;
  userId: string;
  db: CommercialRoutingDbClient;
}) {
  const existingMembership = await input.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId
      }
    }
  });

  if (existingMembership) {
    return existingMembership;
  }

  return input.db.organizationMember.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: UserRole.OWNER
    }
  });
}

async function resolveOrCreateOrganizationFromCheckout(input: {
  stripeObject: StripeLikeObject;
  organizationId?: string | null;
  userId: string;
  email: string;
  db?: CommercialRoutingDbClient;
}) {
  const db = input.db ?? prisma;
  if (input.organizationId) {
    const existingOrganization = await db.organization.findUnique({
      where: { id: input.organizationId }
    });
    if (existingOrganization) {
      return existingOrganization;
    }
  }

  const existingMembership = await db.organizationMember.findFirst({
    where: {
      userId: input.userId
    },
    include: {
      organization: true
    },
    orderBy: { createdAt: "asc" }
  });
  if (existingMembership?.organization) {
    return existingMembership.organization;
  }

  const companyName = deriveCompanyNameFromCheckout(input.stripeObject, input.email);
  const baseSlug = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || `workspace-${buildCorrelationId("org").slice(-8)}`;

  let slug = baseSlug;
  let attempt = 1;
  while (
    await db.organization.findUnique({
      where: { slug }
    })
  ) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const organization = await db.organization.create({
    data: {
      name: companyName,
      slug,
      createdByUserId: input.userId
    }
  });

  await ensureOwnerMembership({
    organizationId: organization.id,
    userId: input.userId,
    db
  });

  return organization;
}

function buildEntitlementsJson(entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>>) {
  return {
    workspaceMode: entitlements.workspaceMode,
    subscriptionStatus: entitlements.subscriptionStatus,
    billingAccessState: entitlements.billingAccessState,
    featureAccess: entitlements.featureAccess,
    limits: entitlements.limits,
    appliedOverrides: entitlements.appliedOverrides.map((override) => ({
      key: override.key,
      source: override.source,
      reason: override.reason,
      expiresAt: override.expiresAt?.toISOString() ?? null
    }))
  } satisfies Prisma.JsonObject;
}

export function deriveCommercialWorkflowDecision(input: {
  planCode: CommercialPlanCode;
  entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>>;
}): {
  workflowCode: CanonicalWorkflowCode;
  hints: NormalizedRoutingHints;
  reason: CommercialRoutingReason;
  status: RoutingSnapshotStatus;
} {
  const reasonCodes: string[] = [`plan.${normalizePlanCode(input.planCode)}`];
  const matchedRules: string[] = ["commercial.plan.resolved"];
  let workflowCode: CanonicalWorkflowCode = CanonicalWorkflowCode.INTAKE_REVIEW;
  let routeCategory: NormalizedRoutingHints["route_category"] = "fallback";
  let processingTier: NormalizedRoutingHints["processing_tier"] = "manual_review";
  let status: RoutingSnapshotStatus = RoutingSnapshotStatus.PENDING;

  if (!input.entitlements.canAccessWorkspace) {
    reasonCodes.push("workspace.access.missing");
    matchedRules.push("routing.blocked.workspace_access");
    status = RoutingSnapshotStatus.FAILED;
  } else if (!input.entitlements.featureAccess["assessments.create"]) {
    reasonCodes.push("entitlement.assessments_create.missing");
    matchedRules.push("routing.fallback.intake_review");
  } else if (
    input.entitlements.limits.audits !== null &&
    input.entitlements.activeAssessments >= input.entitlements.limits.audits
  ) {
    reasonCodes.push("quota.audits.exceeded");
    matchedRules.push("routing.fallback.quota_review");
  } else if (!input.entitlements.featureAccess["reports.generate"]) {
    workflowCode = CanonicalWorkflowCode.BRIEFING_ONLY;
    routeCategory = "fallback";
    processingTier = "manual_review";
    reasonCodes.push("entitlement.reports_generate.disabled");
    matchedRules.push("routing.fallback.briefing_only");
  } else {
    workflowCode = normalizeWorkflowCodeValue(
      getCanonicalWorkflowCodeForPlan(normalizePlanCode(input.planCode))
    );

    switch (workflowCode) {
      case CanonicalWorkflowCode.AUDIT_STARTER:
        routeCategory =
          input.entitlements.workspaceMode === "TRIAL" ? "trial" : "standard";
        processingTier = "starter";
        matchedRules.push("routing.audit_starter");
        break;
      case CanonicalWorkflowCode.AUDIT_ENTERPRISE:
        routeCategory =
          input.entitlements.workspaceMode === "TRIAL" ? "trial" : "standard";
        processingTier = "enterprise";
        matchedRules.push("routing.audit_enterprise");
        break;
      case CanonicalWorkflowCode.AUDIT_SCALE:
      default:
        routeCategory =
          input.entitlements.workspaceMode === "TRIAL" ? "trial" : "standard";
        processingTier = "scale";
        matchedRules.push("routing.audit_scale");
        break;
    }
  }

  const quotaState = {
    audits_remaining:
      input.entitlements.limits.audits === null
        ? null
        : Math.max(input.entitlements.limits.audits - input.entitlements.activeAssessments, 0),
    uploads_remaining: input.entitlements.uploadsLimit,
    documents_processed_remaining: input.entitlements.aiProcessingRunsLimit
  };

  const normalizedHints: NormalizedRoutingHints = {
    workflow_family: "audit",
    workflow_code: normalizeWorkflowCode(workflowCode),
    processing_tier: processingTier,
    route_category: routeCategory,
    entitlement_summary: {
      workspace_access: input.entitlements.featureAccess["workspace.access"],
      reports_generate: input.entitlements.featureAccess["reports.generate"],
      monitoring_manage: input.entitlements.featureAccess["monitoring.manage"],
      executive_delivery: input.entitlements.featureAccess["executive.delivery"],
      custom_frameworks: input.entitlements.featureAccess["custom.frameworks"],
      priority_support: input.entitlements.featureAccess["priority.support"]
    },
    quota_state: quotaState,
    feature_flags: {
      monitoring_enabled: input.entitlements.featureAccess["monitoring.manage"],
      control_scoring_enabled:
        input.planCode === CommercialPlanCode.SCALE ||
        input.planCode === CommercialPlanCode.ENTERPRISE,
      demo_safeguards_active: getIntegrationEnvironmentLabel() !== "production",
      enterprise_override_active: input.entitlements.appliedOverrides.length > 0
    }
  };

  return {
    workflowCode,
    hints: normalizedHints,
    reason: {
      codes: reasonCodes,
      summary: `Resolved ${normalizeWorkflowCode(workflowCode)} from ${normalizePlanCode(input.planCode)} commercial state.`,
      matched_rules: matchedRules,
      fallback_applied:
        workflowCode === CanonicalWorkflowCode.INTAKE_REVIEW ||
        workflowCode === CanonicalWorkflowCode.BRIEFING_ONLY
    },
    status
  };
}

export async function computeAndPersistRoutingSnapshot(input: {
  organizationId: string;
  userId?: string | null;
  sourceSystem: string;
  sourceEventType: string;
  sourceEventId: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  planCode: CommercialPlanCode;
  idempotencyKey: string;
  db?: CommercialRoutingDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.routingSnapshot.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });

  if (existing) {
    return existing;
  }

  const entitlements = await getOrganizationEntitlements(input.organizationId, db);
  const decision = deriveCommercialWorkflowDecision({
    planCode: input.planCode,
    entitlements
  });

  const snapshot = await db.routingSnapshot.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      sourceSystem: input.sourceSystem,
      sourceEventType: input.sourceEventType,
      sourceEventId: input.sourceEventId,
      sourceRecordType: input.sourceRecordType ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      idempotencyKey: input.idempotencyKey,
      planCode: input.planCode,
      workflowCode: decision.workflowCode,
      entitlementsJson: buildEntitlementsJson(entitlements),
      normalizedHintsJson: decision.hints,
      routingReasonJson: decision.reason,
      commercialStateJson: {
        planCode: normalizePlanCode(input.planCode),
        workspaceMode: entitlements.workspaceMode,
        subscriptionStatus: entitlements.subscriptionStatus,
        billingAccessState: entitlements.billingAccessState,
        environment: getIntegrationEnvironmentLabel()
      },
      status: decision.status
    }
  });

  await writeAuditLog(db, {
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    actorType: AuditActorType.WEBHOOK,
    actorLabel: input.sourceSystem,
    action: "routing_snapshot.created",
    entityType: "routingSnapshot",
    entityId: snapshot.id,
    metadata: {
      sourceEventType: input.sourceEventType,
      sourceEventId: input.sourceEventId,
      planCode: normalizePlanCode(input.planCode),
      workflowCode: normalizeWorkflowCode(decision.workflowCode),
      reasonCodes: decision.reason.codes
    }
  });

  return snapshot;
}

export async function resolveCommercialRoutingContextFromCheckout(input: {
  stripeObject: StripeLikeObject;
  sourceEventId: string;
  db?: CommercialRoutingDbClient;
}) {
  const db = input.db ?? prisma;
  const planMapping = resolveCommercialPlanFromStripeContext({
    metadata: input.stripeObject.metadata,
    stripePriceId: getStripeObjectPriceId(input.stripeObject),
    stripeProductId: getStripeObjectProductId(input.stripeObject)
  });

  if (!planMapping) {
    throw new Error("Missing Stripe commercial mapping for checkout event.");
  }

  const metadata = readStripeContextMetadata(input.stripeObject.metadata);
  const email =
    normalizeEmail(metadata.customerEmail) ??
    normalizeEmail(input.stripeObject.customer_details?.email) ??
    normalizeEmail(input.stripeObject.customer_email) ??
    normalizeEmail(input.stripeObject.customer?.email);

  if (!email) {
    throw new Error("Stripe checkout event is missing a customer email for routing.");
  }

  const user = await resolveOrCreateCommercialUser({
    db,
    email,
    firstName: compactString(input.stripeObject.customer_details?.name) ?? null
  });

  const organization = await resolveOrCreateOrganizationFromCheckout({
    db,
    stripeObject: input.stripeObject,
    organizationId: metadata.organizationId,
    userId: user.id,
    email
  });

  if (input.stripeObject.customer) {
    await ensureOrganizationBillingCustomer({
      db,
      organizationId: organization.id,
      providerCustomerId:
        typeof input.stripeObject.customer === "string"
          ? input.stripeObject.customer
          : String(input.stripeObject.customer.id),
      email,
      billingOwnerUserId: user.id
    });
  }

  return {
    organization,
    user,
    email,
    planMapping
  };
}

export function readRoutingSnapshotHints(snapshot: Pick<RoutingSnapshot, "normalizedHintsJson">) {
  const value = snapshot.normalizedHintsJson;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

export function getCommercialRoutingSetupGuide() {
  const mappings = buildCommercialPlanMappings().map((mapping) => ({
    planCode: normalizePlanCode(mapping.commercialPlanCode),
    revenuePlanCode: mapping.revenuePlanCode,
    canonicalPlanKey: mapping.canonicalPlanKey,
    stripePriceIdConfigured: Boolean(mapping.stripePriceId),
    stripeProductIdConfigured: Boolean(mapping.stripeProductId)
  }));

  return {
    supportedCommercialPlans: ["starter", "scale", "enterprise"],
    growthRoutingCompatibility: "growth_internal_plan_maps_to_scale_commercial_route",
    mappings
  };
}

export function buildRoutingRequestContextFromRequest(request: Request) {
  return buildAuditRequestContextFromRequest(request);
}

export function mapCanonicalPlanKeyToCommercialPlanCode(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
) {
  return normalizeCommercialPlanFromCanonicalKey(canonicalPlanKey);
}

export function normalizeCommercialWorkflowCode(
  workflowCode: CanonicalWorkflowCode
) {
  return normalizeWorkflowCode(workflowCode);
}

export function normalizeCommercialPlanCode(
  planCode: CommercialPlanCode
) {
  return normalizePlanCode(planCode);
}
