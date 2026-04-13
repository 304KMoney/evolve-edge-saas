import "server-only";

import {
  CANONICAL_ENV_KEYS,
  CANONICAL_PLAN_CODES,
  getCanonicalStripePriceEnvVar,
  getCanonicalStripeProductEnvVar,
  type CanonicalPlanCode
} from "./canonical-domain";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export type AppRuntimeEnvironment = "development" | "preview" | "production";
export type AppLogLevel = "debug" | "info" | "warn" | "error";

export function getAppUrl() {
  return readEnv(CANONICAL_ENV_KEYS.appUrl) || "http://localhost:3000";
}

export function getSalesContactEmail() {
  return readEnv(CANONICAL_ENV_KEYS.salesContactEmail) || "sales@evolveedge.ai";
}

export function getContactSalesUrl() {
  return (
    readEnv(CANONICAL_ENV_KEYS.contactSalesUrl) ||
    `${getAppUrl()}/contact-sales`
  );
}

export function getFoundingRiskAuditUrl() {
  const configured = readEnv(CANONICAL_ENV_KEYS.foundingRiskAuditUrl);
  if (configured && configured !== "PASTE_YOUR_REAL_STRIPE_LINK_HERE") {
    return configured;
  }

  return "/contact?intent=founding-risk-audit&source=marketing-site";
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
    foundingRiskAuditUrl: getFoundingRiskAuditUrl(),
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
