export const CANONICAL_PLAN_CODES = ["starter", "scale", "enterprise"] as const;

export type CanonicalPlanCode = (typeof CANONICAL_PLAN_CODES)[number];

export const CANONICAL_PLAN_DISPLAY_NAMES = {
  starter: "Starter",
  scale: "Scale",
  enterprise: "Enterprise"
} as const satisfies Record<CanonicalPlanCode, string>;

export type CanonicalPlanDisplayName =
  (typeof CANONICAL_PLAN_DISPLAY_NAMES)[CanonicalPlanCode];

export const CANONICAL_WORKFLOW_CODES = [
  "audit_starter",
  "audit_scale",
  "audit_enterprise",
  "briefing_only",
  "intake_review"
] as const;

export type CanonicalWorkflowCode = (typeof CANONICAL_WORKFLOW_CODES)[number];

export const CANONICAL_REPORT_TEMPLATES = [
  "starter_snapshot",
  "scale_operating_report",
  "enterprise_operating_report",
  "briefing_pack",
  "intake_review_summary"
] as const;

export type CanonicalReportTemplate = (typeof CANONICAL_REPORT_TEMPLATES)[number];

export const CANONICAL_INTEGRATION_EVENT_TYPES = [
  "audit.requested",
  "workflow.status.updated",
  "workflow.report.ready"
] as const;

export type CanonicalIntegrationEventType =
  (typeof CANONICAL_INTEGRATION_EVENT_TYPES)[number];

export const CANONICAL_AI_EXECUTION_FIELD_KEYS = [
  "company_name",
  "contact_name",
  "contact_email",
  "industry",
  "top_concerns",
  "frameworks",
  "plan_code",
  "workflow_code",
  "report_template",
  "processing_depth"
] as const;

export const CANONICAL_DIFY_FIELD_KEYS = CANONICAL_AI_EXECUTION_FIELD_KEYS;

export type CanonicalAiExecutionFieldKey =
  (typeof CANONICAL_AI_EXECUTION_FIELD_KEYS)[number];
export type CanonicalDifyFieldKey = CanonicalAiExecutionFieldKey;

export const CANONICAL_BILLING_MOTIONS = [
  "stripe_checkout",
  "contact_sales"
] as const;

export type CanonicalBillingMotion = (typeof CANONICAL_BILLING_MOTIONS)[number];

export const CANONICAL_BILLING_CADENCES = ["monthly", "annual"] as const;

export type CanonicalBillingCadence = (typeof CANONICAL_BILLING_CADENCES)[number];

export const CANONICAL_HOSTINGER_CTA_TARGETS = [
  "stripe_checkout",
  "contact_sales"
] as const;

export type CanonicalHostingerCtaTarget =
  (typeof CANONICAL_HOSTINGER_CTA_TARGETS)[number];

export const CANONICAL_PROCESSING_DEPTHS = [
  "starter",
  "scale",
  "enterprise",
  "manual_review"
] as const;

export type CanonicalProcessingDepth =
  (typeof CANONICAL_PROCESSING_DEPTHS)[number];

export const CANONICAL_PUBLIC_PRICING = {
  starter: {
    usd: 5000,
    label: "Starting at $5,000 / month",
    cadence: {
      monthly: {
        usd: 5000,
        label: "$5,000 / month"
      },
      annual: {
        usd: 48000,
        label: "$48,000 / year"
      }
    }
  },
  scale: {
    usd: 18500,
    label: "Starting at $18,500 / month",
    cadence: {
      monthly: {
        usd: 18500,
        label: "$18,500 / month"
      },
      annual: {
        usd: 180000,
        label: "$180,000 / year"
      }
    }
  },
  enterprise: {
    usd: null,
    label: "Custom",
    cadence: {
      monthly: {
        usd: null,
        label: "Custom"
      },
      annual: {
        usd: null,
        label: "Custom"
      }
    }
  }
} as const satisfies Record<
  CanonicalPlanCode,
  {
    usd: number | null;
    label: string;
    cadence: Record<
      CanonicalBillingCadence,
      {
        usd: number | null;
        label: string;
      }
    >;
  }
>;

export const CANONICAL_STRIPE_PRICE_ENV_MAP = {
  starter: "STRIPE_PRICE_STARTER_ANNUAL",
  scale: "STRIPE_PRICE_SCALE_ANNUAL",
  enterprise: "STRIPE_PRICE_ENTERPRISE_ANNUAL"
} as const satisfies Record<CanonicalPlanCode, string>;

export const CANONICAL_STRIPE_PRODUCT_ENV_MAP = {
  starter: "STRIPE_PRODUCT_STARTER",
  scale: "STRIPE_PRODUCT_SCALE",
  enterprise: "STRIPE_PRODUCT_ENTERPRISE"
} as const satisfies Record<CanonicalPlanCode, string>;

export const CANONICAL_ENV_KEYS = {
  appUrl: "NEXT_PUBLIC_APP_URL",
  contactSalesUrl: "NEXT_PUBLIC_CONTACT_SALES_URL",
  foundingRiskAuditUrl: "NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL",
  salesContactEmail: "NEXT_PUBLIC_SALES_CONTACT_EMAIL",
  hostingerReferenceUrl: "HOSTINGER_REFERENCE_URL",
  authMode: "AUTH_MODE",
  authSecret: "AUTH_SECRET",
  authAccessEmail: "AUTH_ACCESS_EMAIL",
  authAccessPassword: "AUTH_ACCESS_PASSWORD",
  databaseUrl: "DATABASE_URL",
  stripeSecretKey: "STRIPE_SECRET_KEY",
  stripeWebhookSecret: "STRIPE_WEBHOOK_SECRET",
  n8nWebhookUrl: "N8N_WEBHOOK_URL",
  n8nWebhookSecret: "N8N_WEBHOOK_SECRET",
  n8nCallbackSecret: "N8N_CALLBACK_SECRET",
  n8nWritebackSecret: "N8N_WRITEBACK_SECRET",
  aiExecutionProvider: "AI_EXECUTION_PROVIDER",
  openAiApiKey: "OPENAI_API_KEY",
  openAiModel: "OPENAI_MODEL",
  openAiReasoningModel: "OPENAI_REASONING_MODEL",
  aiExecutionTimeoutMs: "AI_EXECUTION_TIMEOUT_MS",
  difyApiBaseUrl: "DIFY_API_BASE_URL",
  difyApiKey: "DIFY_API_KEY",
  difyWorkflowId: "DIFY_WORKFLOW_ID",
  hubspotAccessToken: "HUBSPOT_ACCESS_TOKEN",
  outboundDispatchSecret: "OUTBOUND_DISPATCH_SECRET",
  hostingerSyncSecret: "COMMERCIAL_REFERENCE_SECRET"
} as const;

// Only these values are intentionally browser-safe. Any new NEXT_PUBLIC_ env
// should be added here deliberately rather than introduced ad hoc.
export const CANONICAL_PUBLIC_ENV_KEYS = [
  CANONICAL_ENV_KEYS.appUrl,
  CANONICAL_ENV_KEYS.contactSalesUrl,
  CANONICAL_ENV_KEYS.foundingRiskAuditUrl,
  CANONICAL_ENV_KEYS.salesContactEmail
] as const;

// Everything else remains server-owned, including operational reference values
// that may appear harmless but still participate in backend-only workflows.
export const CANONICAL_SERVER_ONLY_ENV_KEYS = [
  CANONICAL_ENV_KEYS.hostingerReferenceUrl,
  CANONICAL_ENV_KEYS.authMode,
  CANONICAL_ENV_KEYS.authSecret,
  CANONICAL_ENV_KEYS.authAccessEmail,
  CANONICAL_ENV_KEYS.authAccessPassword,
  CANONICAL_ENV_KEYS.databaseUrl,
  CANONICAL_ENV_KEYS.stripeSecretKey,
  CANONICAL_ENV_KEYS.stripeWebhookSecret,
  CANONICAL_ENV_KEYS.n8nWebhookUrl,
  CANONICAL_ENV_KEYS.n8nWebhookSecret,
  CANONICAL_ENV_KEYS.n8nCallbackSecret,
  CANONICAL_ENV_KEYS.n8nWritebackSecret,
  CANONICAL_ENV_KEYS.aiExecutionProvider,
  CANONICAL_ENV_KEYS.openAiApiKey,
  CANONICAL_ENV_KEYS.openAiModel,
  CANONICAL_ENV_KEYS.openAiReasoningModel,
  CANONICAL_ENV_KEYS.aiExecutionTimeoutMs,
  CANONICAL_ENV_KEYS.difyApiBaseUrl,
  CANONICAL_ENV_KEYS.difyApiKey,
  CANONICAL_ENV_KEYS.difyWorkflowId,
  CANONICAL_ENV_KEYS.hubspotAccessToken,
  CANONICAL_ENV_KEYS.outboundDispatchSecret,
  CANONICAL_ENV_KEYS.hostingerSyncSecret
] as const;

// Note: N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET remain compatibility-era env names.
// The preferred first-customer orchestration config path is N8N_WORKFLOW_DESTINATIONS
// plus N8N_CALLBACK_SECRET. N8N_WRITEBACK_SECRET is an optional hardening seam
// for inbound workflow status/report writeback routes and falls back to
// N8N_CALLBACK_SECRET when it is not configured.

export type CanonicalEnvKey =
  (typeof CANONICAL_ENV_KEYS)[keyof typeof CANONICAL_ENV_KEYS];

export const CANONICAL_ENV_GROUPS = {
  app: [
    CANONICAL_ENV_KEYS.appUrl,
    CANONICAL_ENV_KEYS.contactSalesUrl,
    CANONICAL_ENV_KEYS.foundingRiskAuditUrl,
    CANONICAL_ENV_KEYS.salesContactEmail,
    CANONICAL_ENV_KEYS.hostingerReferenceUrl
  ],
  auth: [
    CANONICAL_ENV_KEYS.authMode,
    CANONICAL_ENV_KEYS.authSecret,
    CANONICAL_ENV_KEYS.authAccessEmail,
    CANONICAL_ENV_KEYS.authAccessPassword
  ],
  billing: [
    CANONICAL_ENV_KEYS.databaseUrl,
    CANONICAL_ENV_KEYS.stripeSecretKey,
    CANONICAL_ENV_KEYS.stripeWebhookSecret
  ],
  orchestration: [
    CANONICAL_ENV_KEYS.n8nWebhookUrl,
    CANONICAL_ENV_KEYS.n8nWebhookSecret,
    CANONICAL_ENV_KEYS.n8nCallbackSecret,
    CANONICAL_ENV_KEYS.n8nWritebackSecret,
    CANONICAL_ENV_KEYS.aiExecutionProvider,
    CANONICAL_ENV_KEYS.openAiApiKey,
    CANONICAL_ENV_KEYS.openAiModel,
    CANONICAL_ENV_KEYS.openAiReasoningModel,
    CANONICAL_ENV_KEYS.aiExecutionTimeoutMs,
    CANONICAL_ENV_KEYS.difyApiBaseUrl,
    CANONICAL_ENV_KEYS.difyApiKey,
    CANONICAL_ENV_KEYS.difyWorkflowId,
    CANONICAL_ENV_KEYS.hubspotAccessToken,
    CANONICAL_ENV_KEYS.outboundDispatchSecret
  ],
  hostinger: [CANONICAL_ENV_KEYS.hostingerSyncSecret]
} as const;

export const CANONICAL_HOSTINGER_RULES = {
  starter: {
    ctaTarget: "stripe_checkout",
    checkoutAllowed: true,
    salesLedOnly: false
  },
  scale: {
    ctaTarget: "stripe_checkout",
    checkoutAllowed: true,
    salesLedOnly: false
  },
  enterprise: {
    ctaTarget: "contact_sales",
    checkoutAllowed: false,
    salesLedOnly: true
  }
} as const satisfies Record<
  CanonicalPlanCode,
  {
    ctaTarget: CanonicalHostingerCtaTarget;
    checkoutAllowed: boolean;
    salesLedOnly: boolean;
  }
>;

export function isCanonicalPlanCode(value: string | null | undefined): value is CanonicalPlanCode {
  return CANONICAL_PLAN_CODES.includes((value ?? "").trim().toLowerCase() as CanonicalPlanCode);
}

export function getCanonicalPlanDisplayName(planCode: CanonicalPlanCode) {
  return CANONICAL_PLAN_DISPLAY_NAMES[planCode];
}

export function getCanonicalPublicPriceUsd(planCode: CanonicalPlanCode) {
  return CANONICAL_PUBLIC_PRICING[planCode].usd;
}

export function getCanonicalPublicPriceLabel(
  planCode: CanonicalPlanCode,
  cadence?: CanonicalBillingCadence | null
) {
  if (!cadence) {
    return CANONICAL_PUBLIC_PRICING[planCode].label;
  }

  return CANONICAL_PUBLIC_PRICING[planCode].cadence[cadence].label;
}

export function getCanonicalPublicPriceUsdForCadence(
  planCode: CanonicalPlanCode,
  cadence: CanonicalBillingCadence
) {
  return CANONICAL_PUBLIC_PRICING[planCode].cadence[cadence].usd;
}

export function getCanonicalPublicPriceLabelForCadence(
  planCode: CanonicalPlanCode,
  cadence: CanonicalBillingCadence
) {
  return CANONICAL_PUBLIC_PRICING[planCode].cadence[cadence].label;
}

export function isCanonicalBillingCadence(
  value: string | null | undefined
): value is CanonicalBillingCadence {
  return CANONICAL_BILLING_CADENCES.includes(
    (value ?? "").trim().toLowerCase() as CanonicalBillingCadence
  );
}

export function resolveCanonicalBillingCadence(
  value: string | null | undefined,
  fallback: CanonicalBillingCadence = "annual"
) {
  return isCanonicalBillingCadence(value) ? value : fallback;
}

export function getCanonicalStripePriceEnvVar(planCode: CanonicalPlanCode) {
  return CANONICAL_STRIPE_PRICE_ENV_MAP[planCode];
}

export function getCanonicalStripeProductEnvVar(planCode: CanonicalPlanCode) {
  return CANONICAL_STRIPE_PRODUCT_ENV_MAP[planCode];
}

export function getCanonicalHostingerRule(planCode: CanonicalPlanCode) {
  return CANONICAL_HOSTINGER_RULES[planCode];
}

export function getCanonicalEnvKeysForGroup(
  group: keyof typeof CANONICAL_ENV_GROUPS
) {
  return [...CANONICAL_ENV_GROUPS[group]];
}
