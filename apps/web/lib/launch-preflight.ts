import {
  CANONICAL_PLAN_CODES,
  CANONICAL_ENV_GROUPS,
  CANONICAL_ENV_KEYS,
  getCanonicalStripePriceEnvVar,
  getCanonicalStripeProductEnvVar,
  type CanonicalPlanCode
} from "./canonical-domain";
import {
  getAuthMode,
  getOptionalEnv,
  getRuntimeEnvironment,
  isSignedReportAuthEnforced
} from "./runtime-config";
import {
  getN8nWorkflowDestinationByName,
  isLegacyN8nWebhookFallbackActive
} from "./n8n";
import { getStripeModeLaunchExpectation } from "./stripe-runtime";

export type LaunchPreflightSeverity = "error" | "warning";

export type LaunchPreflightFinding = {
  code: string;
  severity: LaunchPreflightSeverity;
  message: string;
};

export type LaunchPreflightResult = {
  status: "pass" | "fail";
  environment: string;
  findings: LaunchPreflightFinding[];
};

export type LaunchEnvironmentChecklist = {
  environment: string;
  groups: Array<{
    name: string;
    entries: Array<{
      key: string;
      required: boolean;
      configured: boolean;
      notes?: string;
    }>;
  }>;
};

type LaunchEnvironmentEntrySeed = {
  key: string;
  required: boolean;
  notes?: string;
};

function hasEnv(name: string) {
  return Boolean(getOptionalEnv(name));
}

function hasWorkflowCallbackSecretConfigured() {
  return hasEnv("N8N_CALLBACK_SHARED_SECRET") || hasEnv(CANONICAL_ENV_KEYS.n8nCallbackSecret);
}

function addMissingEnvFinding(
  findings: LaunchPreflightFinding[],
  input: {
    name: string;
    code: string;
    message: string;
  }
) {
  if (!hasEnv(input.name)) {
    findings.push({
      code: input.code,
      severity: "error",
      message: input.message
    });
  }
}

function requireCanonicalPlanBillingConfig(
  findings: LaunchPreflightFinding[],
  planCode: CanonicalPlanCode
) {
  addMissingEnvFinding(findings, {
    name: getCanonicalStripePriceEnvVar(planCode),
    code: `billing.${planCode}.stripe_price_missing`,
    message: `Missing Stripe price env for ${planCode}.`
  });

  addMissingEnvFinding(findings, {
    name: getCanonicalStripeProductEnvVar(planCode),
    code: `billing.${planCode}.stripe_product_missing`,
    message: `Missing Stripe product env for ${planCode}.`
  });
}

function getRequiredEnvironmentEntries() {
  const requiredKeys = new Set<string>([
    CANONICAL_ENV_KEYS.databaseUrl,
    CANONICAL_ENV_KEYS.authSecret,
    CANONICAL_ENV_KEYS.authAccessEmail,
    CANONICAL_ENV_KEYS.authAccessPassword,
    CANONICAL_ENV_KEYS.stripeSecretKey,
    CANONICAL_ENV_KEYS.stripeWebhookSecret,
    CANONICAL_ENV_KEYS.outboundDispatchSecret,
    CANONICAL_ENV_KEYS.n8nCallbackSecret,
    CANONICAL_ENV_KEYS.aiExecutionProvider,
    "AI_EXECUTION_DISPATCH_SECRET",
    CANONICAL_ENV_KEYS.openAiApiKey,
    CANONICAL_ENV_KEYS.openAiModel,
    "N8N_WORKFLOW_DESTINATIONS",
    "REPORT_DOWNLOAD_SIGNING_SECRET",
    "EMAIL_FROM_ADDRESS",
    "RESEND_API_KEY",
    "NOTIFICATION_DISPATCH_SECRET",
    "CRON_SECRET",
    ...CANONICAL_PLAN_CODES.flatMap((planCode) => [
      getCanonicalStripePriceEnvVar(planCode),
      getCanonicalStripeProductEnvVar(planCode)
    ])
  ]);

  return {
    requiredKeys,
    groupEntries: [
      {
        name: "app",
        entries: [
          ...CANONICAL_ENV_GROUPS.app.map((key) => ({
            key,
            required: false,
            notes:
              key === CANONICAL_ENV_KEYS.hostingerReferenceUrl
                ? "Presentation-only reference."
                : undefined
          }))
        ] satisfies LaunchEnvironmentEntrySeed[]
      },
      {
        name: "auth",
        entries: CANONICAL_ENV_GROUPS.auth.map((key) => ({
          key,
          required: requiredKeys.has(key),
          notes:
            key === CANONICAL_ENV_KEYS.authMode
              ? "Must be explicit; preview and production should use password."
              : undefined
        })) satisfies LaunchEnvironmentEntrySeed[]
      },
      {
        name: "billing",
        entries: [
          ...CANONICAL_ENV_GROUPS.billing.map((key) => ({
            key,
            required: requiredKeys.has(key),
            notes: undefined
          })),
          ...CANONICAL_PLAN_CODES.flatMap((planCode) => [
            {
              key: getCanonicalStripePriceEnvVar(planCode),
              required: true,
              notes: `Canonical Stripe price for ${planCode}.`
            },
            {
              key: getCanonicalStripeProductEnvVar(planCode),
              required: true,
              notes: `Canonical Stripe product for ${planCode}.`
            }
          ])
        ] satisfies LaunchEnvironmentEntrySeed[]
      },
      {
        name: "orchestration",
        entries: (() => {
          const baseEntries: LaunchEnvironmentEntrySeed[] = [
            {
              key: "N8N_WORKFLOW_DESTINATIONS",
              required: true,
              notes: "Preferred per-workflow n8n destination config."
            },
            {
              key: "REPORT_DOWNLOAD_SIGNING_SECRET",
              required: true,
              notes: "Required for signed report export links."
            },
            ...CANONICAL_ENV_GROUPS.orchestration.map((key) => ({
              key,
              required:
                key === CANONICAL_ENV_KEYS.outboundDispatchSecret ||
                key === CANONICAL_ENV_KEYS.n8nCallbackSecret,
              notes:
                key === CANONICAL_ENV_KEYS.hubspotAccessToken
                  ? "Optional if CRM projection is deferred for launch."
                  : key === CANONICAL_ENV_KEYS.n8nCallbackSecret
                    ? "Primary callback secret. N8N_CALLBACK_SHARED_SECRET is also accepted as a compatible alias."
                  : key === CANONICAL_ENV_KEYS.n8nWritebackSecret
                    ? "Optional dedicated secret for inbound n8n writeback routes; falls back to the shared callback secret."
                  : key === CANONICAL_ENV_KEYS.aiExecutionProvider
                    ? "Required for the production OpenAI/LangGraph execution path."
                  : key === CANONICAL_ENV_KEYS.openAiApiKey ||
                      key === CANONICAL_ENV_KEYS.openAiModel
                    ? "Required when AI execution is live."
                  : key === CANONICAL_ENV_KEYS.difyApiBaseUrl ||
                      key === CANONICAL_ENV_KEYS.difyApiKey ||
                      key === CANONICAL_ENV_KEYS.difyWorkflowId
                    ? "Deprecated rollback path only."
                    : undefined
            }))
          ];

          return baseEntries.concat([
            {
              key: "AI_EXECUTION_DISPATCH_SECRET",
              required: true,
              notes: "Required for internal AI execution route auth."
            },
            {
              key: "CRON_SECRET",
              required: true,
              notes: "Required for scheduled jobs, including queued email dispatch."
            },
            {
              key: "NOTIFICATION_DISPATCH_SECRET",
              required: true,
              notes: "Required for the internal notification dispatch route."
            },
            {
              key: "EMAIL_FROM_ADDRESS",
              required: true,
              notes: "Required for customer delivery and follow-up emails."
            },
            {
              key: "RESEND_API_KEY",
              required: true,
              notes: "Required when Resend is the email provider."
            }
          ]);
        })()
      }
    ]
  };
}

export function runFirstCustomerLaunchPreflight(): LaunchPreflightResult {
  const findings: LaunchPreflightFinding[] = [];
  const environment = getRuntimeEnvironment();
  const authMode = getAuthMode();
  const stripeMode = getStripeModeLaunchExpectation();

  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.databaseUrl,
    code: "database.url_missing",
    message: "Missing DATABASE_URL for Neon-backed persistence."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.authSecret,
    code: "auth.secret_missing",
    message: "Missing AUTH_SECRET."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.authAccessEmail,
    code: "auth.access_email_missing",
    message: "Missing AUTH_ACCESS_EMAIL for password-auth environments."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.authAccessPassword,
    code: "auth.access_password_missing",
    message: "Missing AUTH_ACCESS_PASSWORD for password-auth environments."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.stripeSecretKey,
    code: "stripe.secret_missing",
    message: "Missing STRIPE_SECRET_KEY."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.stripeWebhookSecret,
    code: "stripe.webhook_secret_missing",
    message: "Missing STRIPE_WEBHOOK_SECRET."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.outboundDispatchSecret,
    code: "dispatch.secret_missing",
    message: "Missing OUTBOUND_DISPATCH_SECRET."
  });
  if (!hasWorkflowCallbackSecretConfigured()) {
    findings.push({
      code: "n8n.callback_secret_missing",
      severity: "error",
      message:
        "Missing N8N_CALLBACK_SECRET or N8N_CALLBACK_SHARED_SECRET."
    });
  }
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.aiExecutionProvider,
    code: "ai.provider_missing",
    message: "Missing AI_EXECUTION_PROVIDER for the OpenAI/LangGraph execution path."
  });
  addMissingEnvFinding(findings, {
    name: "AI_EXECUTION_DISPATCH_SECRET",
    code: "ai.dispatch_secret_missing",
    message: "Missing AI_EXECUTION_DISPATCH_SECRET."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.openAiApiKey,
    code: "ai.openai_api_key_missing",
    message: "Missing OPENAI_API_KEY."
  });
  addMissingEnvFinding(findings, {
    name: CANONICAL_ENV_KEYS.openAiModel,
    code: "ai.openai_model_missing",
    message: "Missing OPENAI_MODEL."
  });
  addMissingEnvFinding(findings, {
    name: "N8N_WORKFLOW_DESTINATIONS",
    code: "n8n.destinations_missing",
    message: "Missing N8N_WORKFLOW_DESTINATIONS."
  });
  if (!getN8nWorkflowDestinationByName("auditRequested")) {
    findings.push({
      code: "n8n.audit_requested_destination_missing",
      severity: "error",
      message:
        "N8N_WORKFLOW_DESTINATIONS must include a valid auditRequested destination for the paid customer flow."
    });
  }
  addMissingEnvFinding(findings, {
    name: "REPORT_DOWNLOAD_SIGNING_SECRET",
    code: "reports.signing_secret_missing",
    message: "Missing REPORT_DOWNLOAD_SIGNING_SECRET."
  });
  addMissingEnvFinding(findings, {
    name: "EMAIL_FROM_ADDRESS",
    code: "email.from_address_missing",
    message: "Missing EMAIL_FROM_ADDRESS for customer delivery emails."
  });
  addMissingEnvFinding(findings, {
    name: "RESEND_API_KEY",
    code: "email.resend_api_key_missing",
    message: "Missing RESEND_API_KEY for queued delivery emails."
  });
  addMissingEnvFinding(findings, {
    name: "NOTIFICATION_DISPATCH_SECRET",
    code: "email.notification_dispatch_secret_missing",
    message: "Missing NOTIFICATION_DISPATCH_SECRET for the internal notifications dispatch route."
  });
  addMissingEnvFinding(findings, {
    name: "CRON_SECRET",
    code: "jobs.cron_secret_missing",
    message: "Missing CRON_SECRET for scheduled jobs and queued email dispatch."
  });

  for (const planCode of CANONICAL_PLAN_CODES) {
    requireCanonicalPlanBillingConfig(findings, planCode);
  }

  if (environment !== "development" && authMode === "demo") {
    findings.push({
      code: "auth.demo_mode_for_customer_env",
      severity: "error",
      message:
        "AUTH_MODE=demo is not allowed for preview or production first-customer environments."
    });
  }

  if (environment !== "development" && !isSignedReportAuthEnforced()) {
    findings.push({
      code: "reports.auth_not_enforced",
      severity: "error",
      message:
        "Signed report downloads must require authenticated access outside local development."
    });
  }

  if (!hasEnv(CANONICAL_ENV_KEYS.hubspotAccessToken)) {
    findings.push({
      code: "hubspot.access_token_missing",
      severity: "warning",
      message:
        "HUBSPOT_ACCESS_TOKEN is missing. CRM projection will stay disabled."
    });
  }

  if (!hasEnv(CANONICAL_ENV_KEYS.foundingRiskAuditUrl)) {
    findings.push({
      code: "delivery.booking_link_fallback_in_use",
      severity: "warning",
      message:
        "NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL is missing. Delivery emails will fall back to the default booking link."
    });
  }

  if (
    hasEnv("HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID") &&
    !hasEnv(CANONICAL_ENV_KEYS.hubspotAccessToken)
  ) {
    findings.push({
      code: "hubspot.deal_stage_configured_without_sync",
      severity: "warning",
      message:
        "HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID is set but HUBSPOT_ACCESS_TOKEN is missing, so deal-stage projection cannot run."
    });
  }

  if (hasEnv(CANONICAL_ENV_KEYS.aiExecutionProvider) && getOptionalEnv(CANONICAL_ENV_KEYS.aiExecutionProvider) !== "openai_langgraph") {
    findings.push({
      code: "ai.non_langgraph_provider_configured",
      severity: "warning",
      message:
        "AI_EXECUTION_PROVIDER is not set to openai_langgraph. The production delivery path assumes the OpenAI/LangGraph backend is active."
    });
  }

  if (stripeMode.shouldUseLiveMode && stripeMode.configuredMode === "test") {
    findings.push({
      code: "stripe.test_mode_configured_for_production",
      severity: "error",
      message:
        "Production is configured with a Stripe test secret key. Cut over to live Stripe credentials before first-customer launch."
    });
  }

  if (!stripeMode.shouldUseLiveMode && stripeMode.configuredMode === "live") {
    findings.push({
      code: "stripe.live_mode_configured_outside_production",
      severity: "warning",
      message:
        "This environment is using a live Stripe secret key outside production. Confirm that live checkout and webhook behavior are intentional."
    });
  }

  if (environment !== "development" && isLegacyN8nWebhookFallbackActive()) {
    findings.push({
      code: "n8n.legacy_webhook_fallback_active",
      severity: environment === "production" ? "error" : "warning",
      message:
        "N8N_WORKFLOW_DESTINATIONS is not configured and the app is still relying on legacy N8N_WEBHOOK_URL fallback. Cut over to explicit production workflow destinations before launch."
    });
  }

  return {
    status: findings.some((finding) => finding.severity === "error")
      ? "fail"
      : "pass",
    environment,
    findings
  };
}

export function getFirstCustomerLaunchEnvironmentChecklist(): LaunchEnvironmentChecklist {
  const { groupEntries } = getRequiredEnvironmentEntries();

  return {
    environment: getRuntimeEnvironment(),
    groups: groupEntries.map((group) => ({
      name: group.name,
      entries: group.entries.map((entry) => ({
        key: entry.key,
        required: entry.required,
        configured:
          entry.key === CANONICAL_ENV_KEYS.n8nCallbackSecret
            ? hasWorkflowCallbackSecretConfigured()
            : hasEnv(entry.key),
        notes: entry.notes
      }))
    }))
  };
}
