import {
  BillingAccessState,
  CanonicalPlanKey,
  EntitlementOverride,
  Prisma,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { isDemoModeEnabled } from "./demo-mode";
import {
  FEATURE_KEYS,
  FeatureKey,
  getAdminSafePlanMappings,
  getCanonicalPlanDefinition,
  getRevenuePlanDefinition
} from "./revenue-catalog";
import {
  getCanonicalCommercialPlanDisplayName,
  mapCanonicalPlanKeyToCanonicalPlanCode
} from "./commercial-catalog";
import { getOrganizationSubscriptionSnapshot } from "./subscription-domain";
import { getOrganizationUsageSnapshot } from "./usage";

type EntitlementDbClient = Prisma.TransactionClient | typeof prisma;

export const ENTITLEMENT_FEATURE_KEYS = [
  "workspace.access",
  "assessments.create",
  "reports.view",
  "reports.generate",
  "roadmap.view",
  "members.manage",
  "billing.portal",
  "evidence.view",
  "evidence.manage",
  "uploads.manage",
  "monitoring.view",
  "monitoring.manage",
  "executive.reviews",
  "executive.delivery",
  "frameworks.view",
  "frameworks.manage",
  "custom.frameworks",
  "api.access",
  "priority.support"
] as const;

export const ENTITLEMENT_LIMIT_KEYS = [
  "users",
  "audits",
  "uploads",
  "monitoring_assets",
  "frameworks",
  "reports_generated",
  "storage_bytes",
  "ai_processing_runs"
] as const;

export type EntitlementFeatureKey = (typeof ENTITLEMENT_FEATURE_KEYS)[number];
export type EntitlementLimitKey = (typeof ENTITLEMENT_LIMIT_KEYS)[number];

export type WorkspaceMode =
  | "DEMO"
  | "TRIAL"
  | "SUBSCRIPTION"
  | "READ_ONLY"
  | "INACTIVE";

export type ResolvedEntitlementOverride = {
  key: string;
  source: string;
  reason: string | null;
  expiresAt: Date | null;
};

export type EntitlementOverrideLike = Pick<
  EntitlementOverride,
  "entitlementKey" | "enabled" | "limitOverride" | "reason" | "expiresAt" | "source"
>;

export type EntitlementSnapshot = {
  planName: string;
  planCode: string;
  canonicalPlanKey: CanonicalPlanKey | null;
  workspaceMode: WorkspaceMode;
  subscriptionStatus: SubscriptionStatus | "NONE";
  billingAccessState: BillingAccessState | "NONE";
  hasLiveSubscription: boolean;
  isTrialing: boolean;
  isReadOnly: boolean;
  seatsUsed: number;
  seatsLimit: number | null;
  seatsUsagePercent: number | null;
  isSeatLimitReached: boolean;
  hasSeatCapacity: boolean;
  activeAssessments: number;
  activeAssessmentsLimit: number | null;
  activeAssessmentsUsagePercent: number | null;
  isAssessmentLimitReached: boolean;
  hasAssessmentCapacity: boolean;
  reportsGenerated: number;
  uploadsLimit: number | null;
  monitoringAssetsLimit: number | null;
  aiProcessingRunsLimit: number | null;
  storageBytesLimit: number | null;
  lastActivityAt: Date | null;
  frameworksSelected: number;
  frameworksLimit: number | null;
  features: Record<FeatureKey, boolean>;
  featureAccess: Record<EntitlementFeatureKey, boolean>;
  limits: Record<EntitlementLimitKey, number | null>;
  appliedOverrides: ResolvedEntitlementOverride[];
  canAccessWorkspace: boolean;
  canCreateAssessment: boolean;
  canAccessReports: boolean;
  canGenerateReports: boolean;
  canAccessRoadmap: boolean;
  canManageMembers: boolean;
  canManageBilling: boolean;
  canUseFeature: (feature: FeatureKey) => boolean;
  hasFeature: (feature: EntitlementFeatureKey) => boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  availablePlanMappings: ReturnType<typeof getAdminSafePlanMappings>;
};

export class EntitlementAccessError extends Error {
  constructor(
    message: string,
    public readonly entitlementKey: EntitlementFeatureKey | null = null,
    public readonly organizationId: string | null = null
  ) {
    super(message);
    this.name = "EntitlementAccessError";
  }
}

type CanonicalEntitlementTemplate = {
  features: Record<EntitlementFeatureKey, boolean>;
  limits: Record<EntitlementLimitKey, number | null>;
};

const PLAN_ORDER: CanonicalPlanKey[] = [
  CanonicalPlanKey.STARTER,
  CanonicalPlanKey.GROWTH,
  CanonicalPlanKey.SCALE,
  CanonicalPlanKey.ENTERPRISE
];

const CANONICAL_ENTITLEMENT_TEMPLATES: Record<
  CanonicalPlanKey,
  CanonicalEntitlementTemplate
> = {
  [CanonicalPlanKey.STARTER]: {
    features: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": false,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": false,
      "executive.reviews": false,
      "executive.delivery": false,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": false,
      "api.access": false,
      "priority.support": false
    },
    limits: {
      users: 3,
      audits: 1,
      uploads: 50,
      monitoring_assets: 10,
      frameworks: 3,
      reports_generated: 1,
      storage_bytes: 500_000_000,
      ai_processing_runs: 1
    }
  },
  [CanonicalPlanKey.GROWTH]: {
    features: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": true,
      "executive.reviews": false,
      "executive.delivery": false,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": false,
      "api.access": false,
      "priority.support": false
    },
    limits: {
      users: 8,
      audits: 5,
      uploads: 250,
      monitoring_assets: 25,
      frameworks: 6,
      reports_generated: 36,
      storage_bytes: 2_500_000_000,
      ai_processing_runs: 60
    }
  },
  [CanonicalPlanKey.SCALE]: {
    features: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": true,
      "executive.reviews": false,
      "executive.delivery": false,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": true,
      "api.access": false,
      "priority.support": false
    },
    limits: {
      users: 15,
      audits: 12,
      uploads: 1_000,
      monitoring_assets: 75,
      frameworks: 12,
      reports_generated: 96,
      storage_bytes: 10_000_000_000,
      ai_processing_runs: 180
    }
  },
  [CanonicalPlanKey.ENTERPRISE]: {
    features: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": true,
      "executive.reviews": true,
      "executive.delivery": true,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": true,
      "api.access": true,
      "priority.support": true
    },
    limits: {
      users: 25,
      audits: 20,
      uploads: 5_000,
      monitoring_assets: 150,
      frameworks: 20,
      reports_generated: 180,
      storage_bytes: 25_000_000_000,
      ai_processing_runs: 480
    }
  }
};

function calculatePercent(used: number, limit: number | null) {
  if (!limit || limit <= 0) {
    return null;
  }

  return Math.min(100, Math.round((used / limit) * 100));
}

function getWorkspaceMode(input: {
  isDemoWorkspace: boolean;
  accessState: BillingAccessState | "NONE";
}) {
  if (input.isDemoWorkspace) {
    return "DEMO" as const;
  }

  switch (input.accessState) {
    case BillingAccessState.TRIALING:
      return "TRIAL" as const;
    case BillingAccessState.ACTIVE:
    case BillingAccessState.GRACE_PERIOD:
      return "SUBSCRIPTION" as const;
    case BillingAccessState.PAST_DUE:
    case BillingAccessState.PAUSED:
    case BillingAccessState.CANCELED:
      return "READ_ONLY" as const;
    default:
      return "INACTIVE" as const;
  }
}

function getDefaultCanonicalEntitlements(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
) {
  return CANONICAL_ENTITLEMENT_TEMPLATES[
    canonicalPlanKey ?? CanonicalPlanKey.STARTER
  ];
}

function getStrictCommercialPlanControls(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
) {
  const canonicalPlanCode = mapCanonicalPlanKeyToCanonicalPlanCode(canonicalPlanKey);

  switch (canonicalPlanCode) {
    case "enterprise":
      return {
        features: {
          "executive.reviews": true,
          "executive.delivery": true,
          "priority.support": true,
          "custom.frameworks": true,
          "api.access": true
        },
        limits: {}
      } satisfies {
        features: Partial<Record<EntitlementFeatureKey, boolean>>;
        limits: Partial<Record<EntitlementLimitKey, number | null>>;
      };
    case "scale":
      return {
        features: {
          "executive.reviews": false,
          "executive.delivery": false,
          "priority.support": false,
          "custom.frameworks": true,
          "api.access": false
        },
        limits: {}
      } satisfies {
        features: Partial<Record<EntitlementFeatureKey, boolean>>;
        limits: Partial<Record<EntitlementLimitKey, number | null>>;
      };
    case "starter":
    default:
      return {
        features: {
          "executive.reviews": false,
          "executive.delivery": false,
          "priority.support": false,
          "custom.frameworks": false,
          "api.access": false
        },
        limits: {
          audits: 1,
          reports_generated: 1,
          ai_processing_runs: 1
        }
      } satisfies {
        features: Partial<Record<EntitlementFeatureKey, boolean>>;
        limits: Partial<Record<EntitlementLimitKey, number | null>>;
      };
  }
}

function applyStrictCommercialPlanControls(input: {
  canonicalPlanKey: CanonicalPlanKey | null | undefined;
  featureAccess: Record<EntitlementFeatureKey, boolean>;
  limits: Record<EntitlementLimitKey, number | null>;
}) {
  const controls = getStrictCommercialPlanControls(input.canonicalPlanKey);

  for (const [key, value] of Object.entries(controls.features)) {
    input.featureAccess[key as EntitlementFeatureKey] = value;
  }

  for (const [key, value] of Object.entries(controls.limits)) {
    input.limits[key as EntitlementLimitKey] = value;
  }
}

function parseOverrideLimit(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function createFeatureRecord(defaultValue = false) {
  return ENTITLEMENT_FEATURE_KEYS.reduce(
    (result, key) => {
      result[key] = defaultValue;
      return result;
    },
    {} as Record<EntitlementFeatureKey, boolean>
  );
}

function createLimitRecord(defaultValue: number | null = null) {
  return ENTITLEMENT_LIMIT_KEYS.reduce(
    (result, key) => {
      result[key] = defaultValue;
      return result;
    },
    {} as Record<EntitlementLimitKey, number | null>
  );
}

function applyWorkspaceModeToFeatures(
  featureAccess: Record<EntitlementFeatureKey, boolean>,
  workspaceMode: WorkspaceMode
) {
  const canAccessWorkspace =
    workspaceMode === "DEMO" ||
    workspaceMode === "TRIAL" ||
    workspaceMode === "SUBSCRIPTION" ||
    workspaceMode === "READ_ONLY";
  const isReadOnly = workspaceMode === "READ_ONLY";
  const adjusted = { ...featureAccess };

  adjusted["workspace.access"] = canAccessWorkspace && adjusted["workspace.access"];

  if (!canAccessWorkspace) {
    for (const key of ENTITLEMENT_FEATURE_KEYS) {
      if (key !== "workspace.access") {
        adjusted[key] = false;
      }
    }

    return adjusted;
  }

  if (isReadOnly) {
    adjusted["assessments.create"] = false;
    adjusted["reports.generate"] = false;
    adjusted["members.manage"] = false;
    adjusted["evidence.manage"] = false;
    adjusted["uploads.manage"] = false;
    adjusted["monitoring.manage"] = false;
    adjusted["frameworks.manage"] = false;
  }

  return adjusted;
}

function mapFeatureAccessToLegacyFeatures(
  featureAccess: Record<EntitlementFeatureKey, boolean>
) {
  return FEATURE_KEYS.reduce(
    (result, key) => {
      switch (key) {
        case "assessments":
          result[key] = featureAccess["assessments.create"];
          break;
        case "reportCenter":
          result[key] = featureAccess["reports.view"];
          break;
        case "roadmap":
          result[key] = featureAccess["roadmap.view"];
          break;
        case "teamManagement":
          result[key] = featureAccess["members.manage"];
          break;
        case "billingPortal":
          result[key] = featureAccess["billing.portal"];
          break;
        case "executiveReviews":
          result[key] = featureAccess["executive.reviews"];
          break;
        case "customFrameworks":
          result[key] = featureAccess["custom.frameworks"];
          break;
        case "prioritySupport":
          result[key] = featureAccess["priority.support"];
          break;
        case "apiAccess":
          result[key] = featureAccess["api.access"];
          break;
      }

      return result;
    },
    {} as Record<FeatureKey, boolean>
  );
}

function applyEntitlementOverrides(input: {
  featureAccess: Record<EntitlementFeatureKey, boolean>;
  limits: Record<EntitlementLimitKey, number | null>;
  overrides: EntitlementOverride[];
}) {
  const featureAccess = { ...input.featureAccess };
  const limits = { ...input.limits };
  const appliedOverrides: ResolvedEntitlementOverride[] = [];

  for (const override of input.overrides) {
    if (
      ENTITLEMENT_FEATURE_KEYS.includes(
        override.entitlementKey as EntitlementFeatureKey
      )
    ) {
      if (typeof override.enabled === "boolean") {
        featureAccess[override.entitlementKey as EntitlementFeatureKey] =
          override.enabled;
        appliedOverrides.push({
          key: override.entitlementKey,
          source: override.source,
          reason: override.reason ?? null,
          expiresAt: override.expiresAt ?? null
        });
      }

      continue;
    }

    if (
      ENTITLEMENT_LIMIT_KEYS.includes(override.entitlementKey as EntitlementLimitKey)
    ) {
      const limit = parseOverrideLimit(override.limitOverride);
      if (limit !== null) {
        limits[override.entitlementKey as EntitlementLimitKey] = limit;
        appliedOverrides.push({
          key: override.entitlementKey,
          source: override.source,
          reason: override.reason ?? null,
          expiresAt: override.expiresAt ?? null
        });
      }
    }
  }

  return {
    featureAccess,
    limits,
    appliedOverrides
  };
}

export function hasFeature(
  entitlements: Pick<EntitlementSnapshot, "featureAccess">,
  feature: EntitlementFeatureKey
) {
  return entitlements.featureAccess[feature];
}

export function compareCanonicalPlans(
  currentPlanKey: CanonicalPlanKey | null | undefined,
  requiredPlanKey: CanonicalPlanKey
) {
  const currentRank = PLAN_ORDER.indexOf(currentPlanKey ?? CanonicalPlanKey.STARTER);
  const requiredRank = PLAN_ORDER.indexOf(requiredPlanKey);

  return currentRank - requiredRank;
}

export function resolveEntitlementConfig(input: {
  canonicalPlanKey: CanonicalPlanKey | null | undefined;
  revenuePlanCode?: string | null;
  workspaceMode: WorkspaceMode;
  overrides?: EntitlementOverrideLike[];
  now?: Date;
}) {
  const revenuePlan = getRevenuePlanDefinition(input.revenuePlanCode ?? null);
  const canonicalPlanKey = input.canonicalPlanKey ?? revenuePlan?.canonicalKey ?? null;
  const planDefaults = getDefaultCanonicalEntitlements(canonicalPlanKey);
  const featureAccess = createFeatureRecord(false);
  const limits = createLimitRecord(null);

  for (const key of ENTITLEMENT_FEATURE_KEYS) {
    featureAccess[key] = planDefaults.features[key];
  }

  for (const key of ENTITLEMENT_LIMIT_KEYS) {
    limits[key] = planDefaults.limits[key];
  }

  if (revenuePlan) {
    limits.users = revenuePlan.usageLimits.seats ?? limits.users;
    limits.audits = revenuePlan.usageLimits.activeAssessments ?? limits.audits;
    limits.monitoring_assets =
      revenuePlan.usageLimits.monitoredAssets ?? limits.monitoring_assets;
    limits.frameworks = revenuePlan.usageLimits.frameworks ?? limits.frameworks;
    limits.reports_generated =
      revenuePlan.usageLimits.reportsGenerated ?? limits.reports_generated;
    limits.storage_bytes =
      revenuePlan.usageLimits.storageBytes ?? limits.storage_bytes;
    limits.ai_processing_runs =
      revenuePlan.usageLimits.aiProcessingRuns ?? limits.ai_processing_runs;

    featureAccess["members.manage"] = revenuePlan.features.teamManagement;
    featureAccess["billing.portal"] = revenuePlan.features.billingPortal;
    featureAccess["executive.reviews"] = revenuePlan.features.executiveReviews;
    featureAccess["custom.frameworks"] = revenuePlan.features.customFrameworks;
    featureAccess["api.access"] = revenuePlan.features.apiAccess;
    featureAccess["priority.support"] = revenuePlan.features.prioritySupport;
  }

  applyStrictCommercialPlanControls({
    canonicalPlanKey,
    featureAccess,
    limits
  });

  const activeOverrides =
    input.overrides?.filter(
      (override) => !override.expiresAt || override.expiresAt > (input.now ?? new Date())
    ) ?? [];
  const overrideResult = applyEntitlementOverrides({
    featureAccess,
    limits,
    overrides: activeOverrides as EntitlementOverride[]
  });

  return {
    canonicalPlanKey,
    featureAccess: applyWorkspaceModeToFeatures(
      overrideResult.featureAccess,
      input.workspaceMode
    ),
    limits: overrideResult.limits,
    appliedOverrides: overrideResult.appliedOverrides
  };
}

export async function getOrganizationEntitlements(
  organizationId: string,
  db: EntitlementDbClient = prisma
): Promise<EntitlementSnapshot> {
  const [usage, frameworkCount, subscriptionSnapshot, rawOverrides] = await Promise.all([
    getOrganizationUsageSnapshot(organizationId),
    db.organizationFramework.count({
      where: { organizationId }
    }),
    getOrganizationSubscriptionSnapshot(organizationId, db),
    db.entitlementOverride.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const subscription = subscriptionSnapshot.subscription;
  const revenuePlan = subscriptionSnapshot.revenuePlan;
  const canonicalPlanKey =
    subscription?.canonicalPlanKeySnapshot ??
    revenuePlan?.canonicalKey ??
    null;
  const canonicalPlan = getCanonicalPlanDefinition(canonicalPlanKey);
  const isDemoWorkspace = isDemoModeEnabled();
  const accessState = subscription?.accessState ?? "NONE";
  const workspaceMode = getWorkspaceMode({
    isDemoWorkspace,
    accessState
  });
  const resolvedConfig = resolveEntitlementConfig({
    canonicalPlanKey,
    revenuePlanCode: subscription?.plan.code ?? subscription?.planCodeSnapshot ?? null,
    workspaceMode,
    overrides: rawOverrides,
    now: new Date()
  });
  const effectiveFeatures = resolvedConfig.featureAccess;
  const legacyFeatures = mapFeatureAccessToLegacyFeatures(effectiveFeatures);
  const seatsLimit = resolvedConfig.limits.users;
  const activeAssessmentsLimit = resolvedConfig.limits.audits;
  const frameworksLimit = resolvedConfig.limits.frameworks;
  const seatsUsagePercent = calculatePercent(usage.activeMembersCount, seatsLimit);
  const activeAssessmentsUsagePercent = calculatePercent(
    usage.activeAssessmentsCount,
    activeAssessmentsLimit
  );
  const canAccessWorkspace = effectiveFeatures["workspace.access"];
  const isReadOnly = workspaceMode === "READ_ONLY";
  const hasLiveSubscription = Boolean(
    subscription &&
      (() => {
        switch (subscription.accessState) {
          case BillingAccessState.TRIALING:
          case BillingAccessState.ACTIVE:
          case BillingAccessState.GRACE_PERIOD:
          case BillingAccessState.PAST_DUE:
          case BillingAccessState.PAUSED:
            return true;
          default:
            return false;
        }
      })()
  );
  const isTrialing = subscription?.status === SubscriptionStatus.TRIALING;
  const hasSeatCapacity = seatsLimit === null || usage.activeMembersCount < seatsLimit;
  const hasAssessmentCapacity =
    activeAssessmentsLimit === null ||
    usage.activeAssessmentsCount < activeAssessmentsLimit;

  return {
    planName:
      getCanonicalCommercialPlanDisplayName(
        revenuePlan?.canonicalKey
          ? mapCanonicalPlanKeyToCanonicalPlanCode(revenuePlan.canonicalKey)
          : null
      ) ??
      subscription?.plan.name ??
      revenuePlan?.name ??
      canonicalPlan?.label ??
      "No active plan",
    planCode: subscription?.plan.code ?? subscription?.planCodeSnapshot ?? "none",
    canonicalPlanKey,
    workspaceMode,
    subscriptionStatus: subscription?.status ?? "NONE",
    billingAccessState: accessState,
    hasLiveSubscription,
    isTrialing,
    isReadOnly,
    seatsUsed: usage.activeMembersCount,
    seatsLimit,
    seatsUsagePercent,
    isSeatLimitReached: seatsLimit !== null && usage.activeMembersCount >= seatsLimit,
    hasSeatCapacity,
    activeAssessments: usage.activeAssessmentsCount,
    activeAssessmentsLimit,
    activeAssessmentsUsagePercent,
    isAssessmentLimitReached:
      activeAssessmentsLimit !== null &&
      usage.activeAssessmentsCount >= activeAssessmentsLimit,
    hasAssessmentCapacity,
    reportsGenerated: usage.reportsCount,
    uploadsLimit: resolvedConfig.limits.uploads,
    monitoringAssetsLimit: resolvedConfig.limits.monitoring_assets,
    aiProcessingRunsLimit: resolvedConfig.limits.ai_processing_runs,
    storageBytesLimit: resolvedConfig.limits.storage_bytes,
    lastActivityAt: usage.lastActivityAt,
    frameworksSelected: frameworkCount,
    frameworksLimit,
    features: legacyFeatures,
    featureAccess: effectiveFeatures,
    limits: resolvedConfig.limits,
    appliedOverrides: resolvedConfig.appliedOverrides,
    canAccessWorkspace,
    canCreateAssessment:
      effectiveFeatures["assessments.create"] && hasAssessmentCapacity,
    canAccessReports: effectiveFeatures["reports.view"],
    canGenerateReports: effectiveFeatures["reports.generate"],
    canAccessRoadmap: effectiveFeatures["roadmap.view"],
    canManageMembers: effectiveFeatures["members.manage"] && hasSeatCapacity,
    canManageBilling: effectiveFeatures["billing.portal"],
    canUseFeature: (feature: FeatureKey) => legacyFeatures[feature],
    hasFeature: (feature: EntitlementFeatureKey) => effectiveFeatures[feature],
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    availablePlanMappings: getAdminSafePlanMappings()
  };
}

export async function requireEntitlement(
  organizationId: string,
  feature: EntitlementFeatureKey,
  options?: {
    db?: EntitlementDbClient;
    failureRedirect?: string | null;
    failureMessage?: string;
  }
) {
  const entitlements = await getOrganizationEntitlements(
    organizationId,
    options?.db ?? prisma
  );

  if (!hasFeature(entitlements, feature)) {
    if (options?.failureRedirect) {
      redirect(options.failureRedirect as never);
    }

    throw new EntitlementAccessError(
      options?.failureMessage ?? `Missing required entitlement: ${feature}.`,
      feature,
      organizationId
    );
  }

  return entitlements;
}

export async function requirePlanAtLeast(
  organizationId: string,
  requiredPlanKey: CanonicalPlanKey,
  options?: {
    db?: EntitlementDbClient;
    failureRedirect?: string | null;
    failureMessage?: string;
  }
) {
  const entitlements = await getOrganizationEntitlements(
    organizationId,
    options?.db ?? prisma
  );

  if (compareCanonicalPlans(entitlements.canonicalPlanKey, requiredPlanKey) < 0) {
    if (options?.failureRedirect) {
      redirect(options.failureRedirect as never);
    }

    throw new EntitlementAccessError(
      options?.failureMessage ??
        `This action requires plan ${requiredPlanKey.toLowerCase()} or above.`,
      null,
      organizationId
    );
  }

  return entitlements;
}
