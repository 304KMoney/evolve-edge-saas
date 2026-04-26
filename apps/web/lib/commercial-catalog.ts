import { CanonicalPlanKey } from "@evolve-edge/db";
import type { RevenuePlanCode } from "./revenue-catalog";
import {
  CANONICAL_DIFY_FIELD_KEYS,
  CANONICAL_INTEGRATION_EVENT_TYPES,
  CANONICAL_PLAN_CODES,
  CANONICAL_REPORT_TEMPLATES,
  CANONICAL_STRIPE_PRICE_ENV_MAP,
  CANONICAL_STRIPE_PRODUCT_ENV_MAP,
  CANONICAL_WORKFLOW_CODES,
  getCanonicalHostingerRule,
  getCanonicalPlanDisplayName,
  getCanonicalPublicPriceLabel,
  getCanonicalPublicPriceUsd,
  type CanonicalBillingMotion,
  type CanonicalHostingerCtaTarget,
  type CanonicalPlanCode,
  type CanonicalPlanDisplayName,
  type CanonicalProcessingDepth,
  type CanonicalReportTemplate,
  type CanonicalWorkflowCode
} from "./canonical-domain";
export {
  CANONICAL_DIFY_FIELD_KEYS,
  CANONICAL_INTEGRATION_EVENT_TYPES,
  CANONICAL_PLAN_CODES,
  CANONICAL_REPORT_TEMPLATES,
  CANONICAL_WORKFLOW_CODES,
  type CanonicalBillingMotion,
  type CanonicalHostingerCtaTarget,
  type CanonicalPlanCode,
  type CanonicalPlanDisplayName,
  type CanonicalProcessingDepth,
  type CanonicalReportTemplate,
  type CanonicalWorkflowCode
} from "./canonical-domain";

export type CanonicalWorkflowCodeValue = CanonicalWorkflowCode;
export type CanonicalIntegrationEventType =
  (typeof CANONICAL_INTEGRATION_EVENT_TYPES)[number];

export const HUBSPOT_COMPANY_PROPERTY_MAP = {
  orgId: "evolve_edge_org_id",
  orgSlug: "evolve_edge_org_slug",
  planCode: "evolve_edge_plan_code",
  subscriptionStatus: "evolve_edge_subscription_status",
  onboardingStatus: "evolve_edge_onboarding_status",
  postureScore: "evolve_edge_current_posture_score",
  lifecycleStage: "evolve_edge_lifecycle_stage",
  lastEventType: "evolve_edge_last_event_type",
  lastEventAt: "evolve_edge_last_event_at",
  lastMilestone: "evolve_edge_last_product_milestone",
  onboardingStartedAt: "evolve_edge_onboarding_started_at",
  onboardingCompletedAt: "evolve_edge_onboarding_completed_at",
  firstAssessmentCreatedAt: "evolve_edge_first_assessment_created_at",
  reportDeliveredAt: "evolve_edge_report_delivered_at",
  reportGenerated: "evolve_edge_report_generated",
  riskLevel: "evolve_edge_risk_level",
  topConcerns: "evolve_edge_top_concerns"
} as const;

export const HUBSPOT_CONTACT_PROPERTY_MAP = {
  email: "email",
  firstName: "firstname",
  lastName: "lastname",
  jobTitle: "jobtitle",
  phone: "phone",
  company: "company",
  leadStatus: "hs_lead_status",
  userId: "evolve_edge_user_id",
  lastEventType: "evolve_edge_last_event_type",
  lastEventAt: "evolve_edge_last_event_at",
  lifecycleStage: "evolve_edge_lifecycle_stage",
  leadSource: "evolve_edge_lead_source",
  leadIntent: "evolve_edge_lead_intent",
  requestedPlanCode: "evolve_edge_requested_plan_code",
  sourcePath: "evolve_edge_source_path",
  companyName: "evolve_edge_company_name",
  teamSize: "evolve_edge_team_size",
  utmSource: "evolve_edge_utm_source",
  utmMedium: "evolve_edge_utm_medium",
  utmCampaign: "evolve_edge_utm_campaign"
} as const;

export type CanonicalCommercialPlan = {
  code: CanonicalPlanCode;
  displayName: CanonicalPlanDisplayName;
  publicPriceUsd: number | null;
  publicPriceLabel: string;
  billingMotion: CanonicalBillingMotion;
  ctaLabel: string;
  publicDescription: string;
  workflowCode: CanonicalWorkflowCodeValue;
  reportTemplate: CanonicalReportTemplate;
  processingDepth: CanonicalProcessingDepth;
  publicRevenuePlanCode: RevenuePlanCode | null;
  stripePriceEnvVar: string | null;
  stripeProductEnvVar: string | null;
  contactSalesOnly: boolean;
  hostingerCtaTarget: CanonicalHostingerCtaTarget;
};

export const CANONICAL_COMMERCIAL_PLAN_CATALOG: readonly CanonicalCommercialPlan[] = [
  {
    code: "starter",
    displayName: getCanonicalPlanDisplayName("starter"),
    publicPriceUsd: getCanonicalPublicPriceUsd("starter"),
    publicPriceLabel: getCanonicalPublicPriceLabel("starter"),
    billingMotion: "stripe_checkout",
    ctaLabel: "Start with Starter",
    publicDescription:
      "A lighter-weight audit path for teams that need a credible starting point with clear delivery and backend-owned compliance routing.",
    workflowCode: "audit_starter",
    reportTemplate: "starter_snapshot",
    processingDepth: "starter",
    publicRevenuePlanCode: "starter-annual",
    stripePriceEnvVar: CANONICAL_STRIPE_PRICE_ENV_MAP.starter,
    stripeProductEnvVar: CANONICAL_STRIPE_PRODUCT_ENV_MAP.starter,
    contactSalesOnly: getCanonicalHostingerRule("starter").salesLedOnly,
    hostingerCtaTarget: getCanonicalHostingerRule("starter").ctaTarget
  },
  {
    code: "scale",
    displayName: getCanonicalPlanDisplayName("scale"),
    publicPriceUsd: getCanonicalPublicPriceUsd("scale"),
    publicPriceLabel: getCanonicalPublicPriceLabel("scale"),
    billingMotion: "stripe_checkout",
    ctaLabel: "Start with Scale",
    publicDescription:
      "The primary operating tier for deeper audit delivery, stronger monitoring posture, and premium internal workflow coverage.",
    workflowCode: "audit_scale",
    reportTemplate: "scale_operating_report",
    processingDepth: "scale",
    publicRevenuePlanCode: "scale-annual",
    stripePriceEnvVar: CANONICAL_STRIPE_PRICE_ENV_MAP.scale,
    stripeProductEnvVar: CANONICAL_STRIPE_PRODUCT_ENV_MAP.scale,
    contactSalesOnly: getCanonicalHostingerRule("scale").salesLedOnly,
    hostingerCtaTarget: getCanonicalHostingerRule("scale").ctaTarget
  },
  {
    code: "enterprise",
    displayName: getCanonicalPlanDisplayName("enterprise"),
    publicPriceUsd: getCanonicalPublicPriceUsd("enterprise"),
    publicPriceLabel: getCanonicalPublicPriceLabel("enterprise"),
    billingMotion: "contact_sales",
    ctaLabel: "Contact sales",
    publicDescription:
      "Sales-led packaging for larger regulated programs that need custom rollout, advanced governance coverage, and enterprise coordination.",
    workflowCode: "audit_enterprise",
    reportTemplate: "enterprise_operating_report",
    processingDepth: "enterprise",
    publicRevenuePlanCode: "enterprise-annual",
    stripePriceEnvVar: CANONICAL_STRIPE_PRICE_ENV_MAP.enterprise,
    stripeProductEnvVar: CANONICAL_STRIPE_PRODUCT_ENV_MAP.enterprise,
    contactSalesOnly: getCanonicalHostingerRule("enterprise").salesLedOnly,
    hostingerCtaTarget: getCanonicalHostingerRule("enterprise").ctaTarget
  }
] as const;

export function getCanonicalCommercialPlanCatalog() {
  return CANONICAL_COMMERCIAL_PLAN_CATALOG;
}

export function resolveCanonicalPlanCode(
  value: string | null | undefined
): CanonicalPlanCode | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "starter":
      return "starter";
    case "scale":
    case "growth":
      return "scale";
    case "enterprise":
      return "enterprise";
    default:
      return null;
  }
}

export function resolvePublicCanonicalPlanCode(
  value: string | null | undefined
): CanonicalPlanCode | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "starter":
      return "starter";
    case "scale":
      return "scale";
    case "enterprise":
      return "enterprise";
    default:
      return null;
  }
}

export function mapCanonicalPlanKeyToCanonicalPlanCode(
  canonicalPlanKey: CanonicalPlanKey | null | undefined
): CanonicalPlanCode {
  switch (canonicalPlanKey) {
    case CanonicalPlanKey.STARTER:
      return "starter";
    case CanonicalPlanKey.ENTERPRISE:
      return "enterprise";
    case CanonicalPlanKey.GROWTH:
    case CanonicalPlanKey.SCALE:
    default:
      return "scale";
  }
}

export function resolveCanonicalPlanCodeFromRevenuePlanCode(
  revenuePlanCode: string | null | undefined
): CanonicalPlanCode | null {
  const normalized = (revenuePlanCode ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("starter")) {
    return "starter";
  }

  if (normalized.startsWith("scale") || normalized.startsWith("growth")) {
    return "scale";
  }

  if (normalized.startsWith("enterprise")) {
    return "enterprise";
  }

  return null;
}

export function getCanonicalCommercialPlanDefinition(
  planCode: CanonicalPlanCode | null | undefined
) {
  if (!planCode) {
    return null;
  }

  return (
    CANONICAL_COMMERCIAL_PLAN_CATALOG.find((plan) => plan.code === planCode) ?? null
  );
}

export function getCanonicalCommercialPlanDisplayName(
  planCode: CanonicalPlanCode | null | undefined
) {
  return getCanonicalCommercialPlanDefinition(planCode)?.displayName ?? null;
}

export function getCanonicalWorkflowCodeForPlan(
  planCode: CanonicalPlanCode | null | undefined
) {
  return getCanonicalCommercialPlanDefinition(planCode)?.workflowCode ?? "intake_review";
}

export function getCanonicalReportTemplateForPlan(
  planCode: CanonicalPlanCode | null | undefined
) {
  return (
    getCanonicalCommercialPlanDefinition(planCode)?.reportTemplate ??
    "intake_review_summary"
  );
}

export function getCanonicalProcessingDepthForPlan(
  planCode: CanonicalPlanCode | null | undefined
) {
  return (
    getCanonicalCommercialPlanDefinition(planCode)?.processingDepth ?? "manual_review"
  );
}

export function resolveRevenuePlanCodeForCanonicalPlan(
  planCode: CanonicalPlanCode | null | undefined
) {
  return getCanonicalCommercialPlanDefinition(planCode)?.publicRevenuePlanCode ?? null;
}

export function resolveRevenuePlanCodeForCommercialSelection(
  value: string | null | undefined
) {
  const canonicalPlanCode =
    resolvePublicCanonicalPlanCode(value) ??
    resolveCanonicalPlanCode(value) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(value);

  return resolveRevenuePlanCodeForCanonicalPlan(canonicalPlanCode);
}

export function supportsStripeCheckoutForCanonicalPlan(
  planCode: CanonicalPlanCode | null | undefined
) {
  return getCanonicalCommercialPlanDefinition(planCode)?.billingMotion === "stripe_checkout";
}

export function getCanonicalPricingSummary() {
  return CANONICAL_COMMERCIAL_PLAN_CATALOG.map((plan) => ({
    code: plan.code,
    displayName: plan.displayName,
    publicPriceLabel: plan.publicPriceLabel,
    billingMotion: plan.billingMotion,
    workflowCode: plan.workflowCode,
    reportTemplate: plan.reportTemplate,
    publicRevenuePlanCode: plan.publicRevenuePlanCode
  }));
}
