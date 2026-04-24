import {
  CANONICAL_ENV_KEYS,
  CANONICAL_PLAN_CODES,
  getCanonicalStripePriceEnvVar,
  getCanonicalStripeProductEnvVar,
  type CanonicalPlanCode
} from "./canonical-domain";
import { getEnvironmentParityStatus } from "./env-validation";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readEnvWithAliases(name: string, aliases: string[] = []) {
  const keys = [name, ...aliases];
  for (const key of keys) {
    const value = readEnv(key);
    if (value) {
      return value;
    }
  }

  return "";
}

export type AppRuntimeEnvironment = "development" | "preview" | "production";
export type AppLogLevel = "debug" | "info" | "warn" | "error";

export function getAppUrl() {
  return (
    readEnvWithAliases(CANONICAL_ENV_KEYS.appUrl, ["APP_BASE_URL"]) ||
    "http://localhost:3000"
  );
}

export function getDifyBaseUrl() {
  return readEnvWithAliases(CANONICAL_ENV_KEYS.difyApiBaseUrl, ["DIFY_BASE_URL"]);
}

export function getAiExecutionProvider() {
  const configured = readEnv("AI_EXECUTION_PROVIDER").toLowerCase();
  return configured === "dify" ? "dify" : "openai_langgraph";
}

export function getOpenAIApiKey() {
  return requireEnv("OPENAI_API_KEY");
}

export function getOpenAIModel() {
  return readEnv("OPENAI_MODEL") || "gpt-4o-2024-08-06";
}

export function getOpenAICheapModel() {
  return readEnv("OPENAI_CHEAP_MODEL") || getOpenAIModel();
}

export function getOpenAIReasoningModel() {
  return readEnv("OPENAI_REASONING_MODEL") || null;
}

export function getOpenAIStrongModel() {
  return readEnv("OPENAI_STRONG_MODEL") || getOpenAIReasoningModel() || getOpenAIModel();
}

export function getAiExecutionTimeoutMs() {
  const parsed = Number(readEnv("AI_EXECUTION_TIMEOUT_MS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 20_000;
}

export function getAiExecutionMaxInputChars() {
  const parsed = Number(readEnv("AI_EXECUTION_MAX_INPUT_CHARS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 24_000;
}

export function getAiExecutionStarterMaxInputChars() {
  const parsed = Number(readEnv("AI_EXECUTION_STARTER_MAX_INPUT_CHARS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 12_000;
}

export function getAiExecutionScaleMaxInputChars() {
  const parsed = Number(readEnv("AI_EXECUTION_SCALE_MAX_INPUT_CHARS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 24_000;
}

export function getAiExecutionEnterpriseMaxInputChars() {
  const parsed = Number(readEnv("AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 40_000;
}

export function getAiExecutionMaxConcurrency() {
  return readPositiveIntegerEnv("AI_EXECUTION_MAX_CONCURRENCY", 4);
}

export function getAiExecutionMaxConcurrentPerOrg() {
  return readPositiveIntegerEnv("AI_EXECUTION_MAX_CONCURRENT_PER_ORG", 2);
}

export function getAiExecutionOrgRateLimitWindowMs() {
  return readPositiveIntegerEnv("AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS", 60_000);
}

export function getAiExecutionOrgRateLimitMaxRequests() {
  return readPositiveIntegerEnv("AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS", 10);
}

export function getAiExecutionWorkflowRateLimitWindowMs() {
  return readPositiveIntegerEnv("AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS", 60_000);
}

export function getAiExecutionWorkflowRateLimitMaxRequests() {
  return readPositiveIntegerEnv("AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS", 3);
}

export function getReportRetentionDays() {
  return readPositiveIntegerEnv("REPORT_RETENTION_DAYS", 365);
}

export function getAssessmentRetentionDays() {
  return readPositiveIntegerEnv("ASSESSMENT_RETENTION_DAYS", 365);
}

export function getAuditLogRetentionDays() {
  return readPositiveIntegerEnv("AUDIT_LOG_RETENTION_DAYS", 90);
}

export function getWorkflowTraceRetentionDays() {
  return readPositiveIntegerEnv("WORKFLOW_TRACE_RETENTION_DAYS", 30);
}

export function getOpenAICheapModelInputCostPer1M() {
  const parsed = Number(readEnv("OPENAI_CHEAP_MODEL_INPUT_COST_PER_1M_TOKENS"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getOpenAICheapModelOutputCostPer1M() {
  const parsed = Number(readEnv("OPENAI_CHEAP_MODEL_OUTPUT_COST_PER_1M_TOKENS"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getOpenAIStrongModelInputCostPer1M() {
  const parsed = Number(readEnv("OPENAI_STRONG_MODEL_INPUT_COST_PER_1M_TOKENS"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getOpenAIStrongModelOutputCostPer1M() {
  const parsed = Number(readEnv("OPENAI_STRONG_MODEL_OUTPUT_COST_PER_1M_TOKENS"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function isAiDebugModeEnabled() {
  return readEnv("AI_DEBUG_MODE").toLowerCase() === "true";
}

export function getSalesContactEmail() {
  return readEnv(CANONICAL_ENV_KEYS.salesContactEmail) || "info@evolveedgeai.com";
}

export function getContactSalesUrl() {
  return (
    readEnv(CANONICAL_ENV_KEYS.contactSalesUrl) ||
    `${getAppUrl()}/contact-sales`
  );
}

export function getFoundingRiskAuditOfferUrl() {
  return "/contact?intent=founding-risk-audit&source=marketing-site";
}

export function getFoundingRiskAuditCallUrl() {
  const configured = readEnv(CANONICAL_ENV_KEYS.foundingRiskAuditUrl);
  if (
    configured &&
    configured !== "PASTE_YOUR_REAL_STRIPE_LINK_HERE" &&
    configured !== "PASTE_YOUR_REAL_HUBSPOT_MEETINGS_LINK_HERE"
  ) {
    return configured;
  }

  return "https://meetings-na2.hubspot.com/kiel-green";
}

export function getHostingerReferenceUrl() {
  return (
    readEnv(CANONICAL_ENV_KEYS.hostingerReferenceUrl) ||
    "https://evolveedge.ai/pricing"
  );
}

export function getAuthMode() {
  const mode = readEnv(CANONICAL_ENV_KEYS.authMode);
  return mode === "demo" ? "demo" : "password";
}

export function isPasswordAuthMode() {
  return getAuthMode() === "password";
}

export function getOptionalEnv(name: string) {
  const value = readEnv(name);
  return value || null;
}

export function requireEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalJsonEnv<T>(name: string): T | null {
  const value = readEnv(name);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(
      `Environment variable ${name} contains invalid JSON: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`
    );
  }
}


let runtimeConfigLogged = false;

export function getRuntimeConfigStatus() {
  return getEnvironmentParityStatus().map((entry) => ({
    key: entry.key,
    required: entry.required,
    configured: entry.configured
  }));
}

export function assertRequiredRuntimeConfig() {
  const missing = getEnvironmentParityStatus()
    .filter((entry) => entry.required && !entry.configured)
    .map((entry) => entry.key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required runtime environment variables: ${missing.join(", ")}. ` +
        "Ensure production integrations are configured before booting the app."
    );
  }
}

export function logRuntimeConfigStatus() {
  if (runtimeConfigLogged) {
    return;
  }

  runtimeConfigLogged = true;
  const status = getRuntimeConfigStatus();
  const summary = {
    requiredConfigured: status.filter((entry) => entry.required && entry.configured).length,
    requiredTotal: status.filter((entry) => entry.required).length,
    configured: status.filter((entry) => entry.configured).map((entry) => entry.key),
    missing: status.filter((entry) => entry.required && !entry.configured).map((entry) => entry.key)
  };

  console.info("[runtime-config] startup status", summary);
}

export function getOptionalListEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getRuntimeEnvironment(): AppRuntimeEnvironment {
  const rawValue =
    readEnv("VERCEL_ENV") || readEnv("NODE_ENV") || "development";

  switch (rawValue) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    default:
      return "development";
  }
}

export function getLogLevel(): AppLogLevel {
  const rawValue = readEnv("LOG_LEVEL").toLowerCase();

  switch (rawValue) {
    case "debug":
      return "debug";
    case "warn":
      return "warn";
    case "error":
      return "error";
    case "info":
    default:
      return "info";
  }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = readEnv(name);
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function getApiRateLimitWindowMs() {
  return readPositiveIntegerEnv("API_RATE_LIMIT_WINDOW_MS", 60_000);
}

export function getApiRateLimitMaxRequests() {
  return readPositiveIntegerEnv("API_RATE_LIMIT_MAX_REQUESTS", 60);
}

export function getWebhookRateLimitWindowMs() {
  return readPositiveIntegerEnv("WEBHOOK_RATE_LIMIT_WINDOW_MS", 60_000);
}

export function getWebhookRateLimitMaxRequests() {
  return readPositiveIntegerEnv("WEBHOOK_RATE_LIMIT_MAX_REQUESTS", 30);
}

export function getReportDownloadSigningSecret() {
  return requireEnv("REPORT_DOWNLOAD_SIGNING_SECRET");
}

export function isSignedReportAuthEnforced() {
  const configured = readEnv("REPORT_DOWNLOAD_REQUIRE_AUTH").toLowerCase();
  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return getRuntimeEnvironment() !== "development";
}

export function getCanonicalStripePriceId(planCode: CanonicalPlanCode) {
  return getOptionalEnv(getCanonicalStripePriceEnvVar(planCode));
}

export function getCanonicalStripeProductId(planCode: CanonicalPlanCode) {
  return getOptionalEnv(getCanonicalStripeProductEnvVar(planCode));
}

export function getCanonicalCommercialRuntimeConfig() {
  return {
    environment: getRuntimeEnvironment(),
    appUrl: getAppUrl(),
    contactSalesUrl: getContactSalesUrl(),
    foundingRiskAuditUrl: getFoundingRiskAuditCallUrl(),
    salesContactEmail: getSalesContactEmail(),
    hostingerReferenceUrl: getHostingerReferenceUrl(),
    authMode: getAuthMode(),
    plans: Object.fromEntries(
      CANONICAL_PLAN_CODES.map((planCode) => [
        planCode,
        {
          stripePriceEnvVar: getCanonicalStripePriceEnvVar(planCode),
          stripePriceId: getCanonicalStripePriceId(planCode),
          stripeProductEnvVar: getCanonicalStripeProductEnvVar(planCode),
          stripeProductId: getCanonicalStripeProductId(planCode)
        }
      ])
    ) as Record<
      CanonicalPlanCode,
      {
        stripePriceEnvVar: string;
        stripePriceId: string | null;
        stripeProductEnvVar: string;
        stripeProductId: string | null;
      }
    >
  };
}
