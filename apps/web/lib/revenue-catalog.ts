import {
  BillingInterval,
  BillingProvider,
  CanonicalPlanKey
} from "@evolve-edge/db";
import { getOptionalEnv } from "./runtime-config";

export const FEATURE_KEYS = [
  "assessments",
  "reportCenter",
  "roadmap",
  "teamManagement",
  "billingPortal",
  "executiveReviews",
  "customFrameworks",
  "prioritySupport",
  "apiAccess"
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type RevenuePlanCode =
  | "starter-monthly"
  | "starter-annual"
  | "growth-monthly"
  | "growth-annual"
  | "scale-monthly"
  | "scale-annual"
  | "enterprise-monthly"
  | "enterprise-annual";

export const CANONICAL_PLAN_KEYS = [
  CanonicalPlanKey.STARTER,
  CanonicalPlanKey.GROWTH,
  CanonicalPlanKey.SCALE,
  CanonicalPlanKey.ENTERPRISE
] as const;

export type CanonicalPlanDefinition = {
  key: CanonicalPlanKey;
  label: string;
  description: string;
  isPublic: boolean;
  defaultBillingProvider: BillingProvider;
  targetBuyer: string;
  defaultRevenuePlanCode: RevenuePlanCode | null;
  availableRevenuePlanCodes: RevenuePlanCode[];
};

export type RevenuePlanDefinition = {
  code: RevenuePlanCode;
  canonicalKey: CanonicalPlanKey;
  family: "starter" | "growth" | "scale" | "enterprise";
  version: number;
  name: string;
  description: string;
  publicDescription: string;
  currency: "USD";
  billingInterval: "monthly" | "annual";
  billingIntervalMode: BillingInterval;
  billingProvider: BillingProvider;
  priceCents: number;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  stripeEnvVar: string;
  billingLookupKey: string;
  usageLimits: {
    activeAssessments: number | null;
    seats: number | null;
    frameworks: number | null;
    reportsGenerated: number | null;
    monitoredAssets: number | null;
    apiCalls: number | null;
    storageBytes: number | null;
    aiProcessingRuns: number | null;
  };
  features: Record<FeatureKey, boolean>;
  adminMetadata: {
    supportTier: "standard" | "priority";
    targetBuyer: string;
    investorNarrative: string;
    recommendedFor: string[];
    upgradeTo: RevenuePlanCode[];
    downgradeTo: RevenuePlanCode[];
  };
};

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  assessments: true,
  reportCenter: true,
  roadmap: true,
  teamManagement: false,
  billingPortal: true,
  executiveReviews: false,
  customFrameworks: false,
  prioritySupport: false,
  apiAccess: false
};

export const CANONICAL_PLAN_CATALOG: readonly CanonicalPlanDefinition[] = [
  {
    key: CanonicalPlanKey.STARTER,
    label: "Starter",
    description:
      "Foundational entry plan reserved for lighter-weight future packaging and founder-led early customer motions.",
    isPublic: true,
    defaultBillingProvider: BillingProvider.STRIPE,
    targetBuyer: "Early-stage teams needing a lower-complexity starting point",
    defaultRevenuePlanCode: "starter-annual",
    availableRevenuePlanCodes: ["starter-monthly", "starter-annual"]
  },
  {
    key: CanonicalPlanKey.GROWTH,
    label: "Growth",
    description:
      "Core recurring SaaS plan for regulated teams adopting Evolve Edge as their operational compliance system.",
    isPublic: true,
    defaultBillingProvider: BillingProvider.STRIPE,
    targetBuyer: "SMB and mid-market compliance and risk teams",
    defaultRevenuePlanCode: "growth-annual",
    availableRevenuePlanCodes: ["growth-monthly", "growth-annual"]
  },
  {
    key: CanonicalPlanKey.SCALE,
    label: "Scale",
    description:
      "Higher-capacity operational tier reserved for future packaging between growth and bespoke enterprise.",
    isPublic: true,
    defaultBillingProvider: BillingProvider.STRIPE,
    targetBuyer: "Growing regulated programs that outgrow self-serve capacity",
    defaultRevenuePlanCode: "scale-annual",
    availableRevenuePlanCodes: ["scale-monthly", "scale-annual"]
  },
  {
    key: CanonicalPlanKey.ENTERPRISE,
    label: "Enterprise",
    description:
      "Higher-capacity plan for multi-team governance programs with executive workflow and expansion potential.",
    isPublic: true,
    defaultBillingProvider: BillingProvider.STRIPE,
    targetBuyer: "Enterprise and multi-stakeholder governance programs",
    defaultRevenuePlanCode: "enterprise-annual",
    availableRevenuePlanCodes: ["enterprise-monthly", "enterprise-annual"]
  }
] as const;

export const REVENUE_PLAN_CATALOG: readonly RevenuePlanDefinition[] = [
  {
    code: "starter-monthly",
    canonicalKey: CanonicalPlanKey.STARTER,
    family: "starter",
    version: 1,
    name: "Starter Monthly",
    description:
      "Lower-friction monthly entry tier for lighter compliance operating motions and founder-led onboarding.",
    publicDescription:
      "For smaller teams that need a credible entry point into AI governance workflows with a lighter report path.",
    currency: "USD",
    billingInterval: "monthly",
    billingIntervalMode: BillingInterval.MONTHLY,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 5_000,
    trialDays: 14,
    sortOrder: 1,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_STARTER_MONTHLY",
    billingLookupKey: "starter-monthly",
    usageLimits: {
      activeAssessments: 2,
      seats: 3,
      frameworks: 3,
      reportsGenerated: 12,
      monitoredAssets: 10,
      apiCalls: 250,
      storageBytes: 500_000_000,
      aiProcessingRuns: 12
    },
    features: {
      ...DEFAULT_FEATURES
    },
    adminMetadata: {
      supportTier: "standard",
      targetBuyer: "Founder-led and lower-friction early customer motion",
      investorNarrative:
        "Entry recurring tier that lowers conversion friction without exposing premium enterprise workflow depth.",
      recommendedFor: [
        "Smaller governance pilots",
        "Lower-complexity first-time buyers",
        "Founder-assisted onboarding"
      ],
      upgradeTo: [
        "starter-annual",
        "growth-monthly",
        "growth-annual",
        "scale-monthly",
        "scale-annual",
        "enterprise-monthly",
        "enterprise-annual"
      ],
      downgradeTo: []
    }
  },
  {
    code: "starter-annual",
    canonicalKey: CanonicalPlanKey.STARTER,
    family: "starter",
    version: 1,
    name: "Starter Annual",
    description:
      "Annual entry tier for lighter regulated programs that need a plan-aware but lower-depth workflow.",
    publicDescription:
      "For lean teams that want a lower-cost recurring compliance operating baseline with annual commitment.",
    currency: "USD",
    billingInterval: "annual",
    billingIntervalMode: BillingInterval.ANNUAL,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 48_000,
    trialDays: 14,
    sortOrder: 3,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_STARTER_ANNUAL",
    billingLookupKey: "starter-annual",
    usageLimits: {
      activeAssessments: 3,
      seats: 3,
      frameworks: 3,
      reportsGenerated: 18,
      monitoredAssets: 12,
      apiCalls: 500,
      storageBytes: 750_000_000,
      aiProcessingRuns: 18
    },
    features: {
      ...DEFAULT_FEATURES
    },
    adminMetadata: {
      supportTier: "standard",
      targetBuyer: "Entry annual buyer with limited workflow complexity",
      investorNarrative:
        "Lower-priced annual tier that expands addressable market while keeping premium workflow branches reserved for higher tiers.",
      recommendedFor: [
        "Lean compliance operating systems",
        "Entry annual procurement paths",
        "Lower-volume recurring assessments"
      ],
      upgradeTo: [
        "growth-monthly",
        "growth-annual",
        "scale-monthly",
        "scale-annual",
        "enterprise-monthly",
        "enterprise-annual"
      ],
      downgradeTo: ["starter-monthly"]
    }
  },
  {
    code: "growth-monthly",
    canonicalKey: CanonicalPlanKey.GROWTH,
    family: "growth",
    version: 1,
    name: "Growth Monthly",
    description:
      "Flexible monthly SaaS plan for regulated teams validating operational fit before annual commitment.",
    publicDescription:
      "For regulated teams that need a lower-commitment entry point into recurring AI governance workflows.",
    currency: "USD",
    billingInterval: "monthly",
    billingIntervalMode: BillingInterval.MONTHLY,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 12_500,
    trialDays: 14,
    sortOrder: 5,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_GROWTH_MONTHLY",
    billingLookupKey: "growth-monthly",
    usageLimits: {
      activeAssessments: 5,
      seats: 8,
      frameworks: 6,
      reportsGenerated: 24,
      monitoredAssets: 20,
      apiCalls: 1_000,
      storageBytes: 1_000_000_000,
      aiProcessingRuns: 30
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true
    },
    adminMetadata: {
      supportTier: "standard",
      targetBuyer: "Trial-to-paid and lower-friction buyer motion",
      investorNarrative:
        "Lower-commitment entry tier that improves top-of-funnel conversion while annual remains the preferred retention path.",
      recommendedFor: [
        "Teams piloting governance workflows",
        "Smaller compliance operating budgets",
        "Procurement-light entry motion"
      ],
      upgradeTo: ["growth-annual", "enterprise-monthly", "enterprise-annual"],
      downgradeTo: []
    }
  },
  {
    code: "growth-annual",
    canonicalKey: CanonicalPlanKey.GROWTH,
    family: "growth",
    version: 1,
    name: "Growth Annual",
    description:
      "Annual SaaS plan for regulated teams building repeatable AI governance workflows.",
    publicDescription:
      "For growing regulated teams that need recurring assessments, executive reporting, and workspace collaboration.",
    currency: "USD",
    billingInterval: "annual",
    billingIntervalMode: BillingInterval.ANNUAL,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 120_000,
    trialDays: 14,
    sortOrder: 10,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_GROWTH_ANNUAL",
    billingLookupKey: "growth-annual",
    usageLimits: {
      activeAssessments: 5,
      seats: 8,
      frameworks: 6,
      reportsGenerated: 36,
      monitoredAssets: 25,
      apiCalls: 2_500,
      storageBytes: 2_500_000_000,
      aiProcessingRuns: 60
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true
    },
    adminMetadata: {
      supportTier: "standard",
      targetBuyer: "SMB and mid-market compliance teams",
      investorNarrative:
        "Core self-serve ACV tier optimized for repeatability and land-and-expand retention.",
      recommendedFor: [
        "Legal ops teams",
        "Fintech risk programs",
        "Early compliance operating systems"
      ],
      upgradeTo: ["enterprise-monthly", "enterprise-annual"],
      downgradeTo: ["growth-monthly"]
    }
  },
  {
    code: "scale-monthly",
    canonicalKey: CanonicalPlanKey.SCALE,
    family: "scale",
    version: 1,
    name: "Scale Monthly",
    description:
      "Premium monthly SaaS tier for larger governance programs that need enhanced workflow depth and monitoring scope.",
    publicDescription:
      "For growing regulated teams that need more depth than Growth without jumping immediately to bespoke enterprise packaging.",
    currency: "USD",
    billingInterval: "monthly",
    billingIntervalMode: BillingInterval.MONTHLY,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 18_500,
    trialDays: 14,
    sortOrder: 12,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_SCALE_MONTHLY",
    billingLookupKey: "scale-monthly",
    usageLimits: {
      activeAssessments: 12,
      seats: 15,
      frameworks: 12,
      reportsGenerated: 96,
      monitoredAssets: 75,
      apiCalls: 10_000,
      storageBytes: 10_000_000_000,
      aiProcessingRuns: 180
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true,
      executiveReviews: true,
      customFrameworks: true,
      prioritySupport: true
    },
    adminMetadata: {
      supportTier: "priority",
      targetBuyer: "Premium SaaS buyer between growth and enterprise",
      investorNarrative:
        "Mid-premium tier that supports expansion before bespoke enterprise packaging is required.",
      recommendedFor: [
        "Higher-volume compliance operations",
        "Broader framework coverage",
        "Teams needing enhanced review depth"
      ],
      upgradeTo: ["scale-annual", "enterprise-monthly", "enterprise-annual"],
      downgradeTo: ["growth-monthly", "growth-annual", "starter-monthly", "starter-annual"]
    }
  },
  {
    code: "scale-annual",
    canonicalKey: CanonicalPlanKey.SCALE,
    family: "scale",
    version: 1,
    name: "Scale Annual",
    description:
      "Annual premium SaaS tier for growing governance programs that need deeper reporting and expanded monitoring capacity.",
    publicDescription:
      "For higher-growth regulated teams that need enhanced monitoring and control depth without bespoke enterprise contracting.",
    currency: "USD",
    billingInterval: "annual",
    billingIntervalMode: BillingInterval.ANNUAL,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 180_000,
    trialDays: 14,
    sortOrder: 14,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_SCALE_ANNUAL",
    billingLookupKey: "scale-annual",
    usageLimits: {
      activeAssessments: 12,
      seats: 15,
      frameworks: 12,
      reportsGenerated: 120,
      monitoredAssets: 90,
      apiCalls: 15_000,
      storageBytes: 12_500_000_000,
      aiProcessingRuns: 240
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true,
      executiveReviews: true,
      customFrameworks: true,
      prioritySupport: true
    },
    adminMetadata: {
      supportTier: "priority",
      targetBuyer: "Annual premium SaaS buyer with advanced governance workflow needs",
      investorNarrative:
        "Premium annual tier positioned between core self-serve and enterprise, improving expansion and retention options.",
      recommendedFor: [
        "Advanced monitoring programs",
        "Larger governance teams",
        "Scored control-review workflows"
      ],
      upgradeTo: ["enterprise-monthly", "enterprise-annual"],
      downgradeTo: [
        "scale-monthly",
        "growth-monthly",
        "growth-annual",
        "starter-monthly",
        "starter-annual"
      ]
    }
  },
  {
    code: "enterprise-monthly",
    canonicalKey: CanonicalPlanKey.ENTERPRISE,
    family: "enterprise",
    version: 1,
    name: "Enterprise Monthly",
    description:
      "Monthly enterprise plan for larger compliance programs that need expanded capacity and executive workflow coverage.",
    publicDescription:
      "For larger regulated organizations that need higher usage capacity without waiting for annual procurement.",
    currency: "USD",
    billingInterval: "monthly",
    billingIntervalMode: BillingInterval.MONTHLY,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 25_000,
    trialDays: 14,
    sortOrder: 15,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    billingLookupKey: "enterprise-monthly",
    usageLimits: {
      activeAssessments: 20,
      seats: 25,
      frameworks: 20,
      reportsGenerated: 120,
      monitoredAssets: 100,
      apiCalls: 25_000,
      storageBytes: 10_000_000_000,
      aiProcessingRuns: 240
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true,
      executiveReviews: true,
      customFrameworks: true,
      prioritySupport: true,
      apiAccess: true
    },
    adminMetadata: {
      supportTier: "priority",
      targetBuyer: "Enterprise teams with shorter budget cycles",
      investorNarrative:
        "Friction-reducing enterprise entry path for prospects that need premium capacity before annual paper is complete.",
      recommendedFor: [
        "Enterprise pilots",
        "Time-sensitive procurement cycles",
        "Cross-functional governance teams"
      ],
      upgradeTo: ["enterprise-annual"],
      downgradeTo: ["growth-monthly", "growth-annual"]
    }
  },
  {
    code: "enterprise-annual",
    canonicalKey: CanonicalPlanKey.ENTERPRISE,
    family: "enterprise",
    version: 1,
    name: "Enterprise Annual",
    description:
      "Higher-capacity annual SaaS plan for multi-stakeholder governance programs and broader framework coverage.",
    publicDescription:
      "For larger regulated organizations that need expanded capacity, custom frameworks, and executive workflow support.",
    currency: "USD",
    billingInterval: "annual",
    billingIntervalMode: BillingInterval.ANNUAL,
    billingProvider: BillingProvider.STRIPE,
    priceCents: 240_000,
    trialDays: 14,
    sortOrder: 20,
    isActive: true,
    isPublic: true,
    stripeEnvVar: "STRIPE_PRICE_ENTERPRISE_ANNUAL",
    billingLookupKey: "enterprise-annual",
    usageLimits: {
      activeAssessments: 20,
      seats: 25,
      frameworks: 20,
      reportsGenerated: 180,
      monitoredAssets: 150,
      apiCalls: 50_000,
      storageBytes: 25_000_000_000,
      aiProcessingRuns: 480
    },
    features: {
      ...DEFAULT_FEATURES,
      teamManagement: true,
      executiveReviews: true,
      customFrameworks: true,
      prioritySupport: true,
      apiAccess: true
    },
    adminMetadata: {
      supportTier: "priority",
      targetBuyer: "Multi-team and enterprise compliance programs",
      investorNarrative:
        "Expansion tier with larger deployment scope, stronger net revenue retention potential, and lower churn sensitivity.",
      recommendedFor: [
        "Portfolio-wide governance teams",
        "Multi-entity regulated organizations",
        "Security and compliance leadership programs"
      ],
      upgradeTo: [],
      downgradeTo: ["enterprise-monthly", "growth-monthly", "growth-annual"]
    }
  }
] as const;

export function getRevenuePlanCatalog() {
  return REVENUE_PLAN_CATALOG;
}

export function getCanonicalPlanCatalog() {
  return CANONICAL_PLAN_CATALOG;
}

export function getCanonicalPlanDefinition(
  canonicalKey: CanonicalPlanKey | null | undefined
) {
  if (!canonicalKey) {
    return null;
  }

  return CANONICAL_PLAN_CATALOG.find((plan) => plan.key === canonicalKey) ?? null;
}

export function getRevenuePlanDefinition(planCode: string | null | undefined) {
  if (!planCode) {
    return null;
  }

  return REVENUE_PLAN_CATALOG.find((plan) => plan.code === planCode) ?? null;
}

export function getCanonicalPlanKeyFromPlanCode(planCode: string | null | undefined) {
  return getRevenuePlanDefinition(planCode)?.canonicalKey ?? null;
}

export function getDefaultRevenuePlanCodeForCanonicalKey(
  canonicalKey: CanonicalPlanKey | null | undefined
) {
  return getCanonicalPlanDefinition(canonicalKey)?.defaultRevenuePlanCode ?? null;
}

export function getStripePriceIdForPlan(plan: RevenuePlanDefinition) {
  return getOptionalEnv(plan.stripeEnvVar) ?? null;
}

export function buildPlanEntitlementConfig(plan: RevenuePlanDefinition) {
  return {
    canonicalPlanKey: plan.canonicalKey,
    resolutionVersion: "phase-55-v1",
    limits: {
      activeAssessments: plan.usageLimits.activeAssessments,
      seats: plan.usageLimits.seats,
      frameworks: plan.usageLimits.frameworks,
      reportsGenerated: plan.usageLimits.reportsGenerated,
      monitoredAssets: plan.usageLimits.monitoredAssets,
      apiCalls: plan.usageLimits.apiCalls,
      storageBytes: plan.usageLimits.storageBytes,
      aiProcessingRuns: plan.usageLimits.aiProcessingRuns
    },
    features: plan.features
  };
}

export function getPlanTransitionDirection(
  currentPlanCode: string | null | undefined,
  targetPlanCode: string | null | undefined
) {
  const currentPlan = getRevenuePlanDefinition(currentPlanCode);
  const targetPlan = getRevenuePlanDefinition(targetPlanCode);

  if (!currentPlan || !targetPlan || currentPlan.code === targetPlan.code) {
    return "current" as const;
  }

  if (targetPlan.sortOrder > currentPlan.sortOrder) {
    return "upgrade" as const;
  }

  if (targetPlan.sortOrder < currentPlan.sortOrder) {
    return "downgrade" as const;
  }

  return "change" as const;
}

export function getAdminSafePlanMappings() {
  return REVENUE_PLAN_CATALOG.map((plan) => ({
    code: plan.code,
    canonicalKey: plan.canonicalKey,
    name: plan.name,
    family: plan.family,
    version: plan.version,
    billingLookupKey: plan.billingLookupKey,
    stripeEnvVar: plan.stripeEnvVar,
    billingInterval: plan.billingInterval,
    priceCents: plan.priceCents,
    trialDays: plan.trialDays,
    usageLimits: plan.usageLimits,
    features: plan.features,
    adminMetadata: plan.adminMetadata
  }));
}
