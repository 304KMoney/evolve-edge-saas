import assert from "node:assert/strict";
import {
  assertRequiredRuntimeConfig,
  getApiRateLimitMaxRequests,
  getApiRateLimitWindowMs,
  getAuthMode,
  getDifyBaseUrl,
  getFoundingRiskAuditCallUrl,
  getFoundingRiskAuditOfferUrl,
  getLogLevel,
  getOptionalJsonEnv,
  getReportDownloadSigningSecret,
  getRuntimeConfigStatus,
  getSalesContactEmail,
  getRuntimeEnvironment,
  getWebhookRateLimitMaxRequests,
  getWebhookRateLimitWindowMs,
  isSignedReportAuthEnforced
} from "../lib/runtime-config";

function runRuntimeConfigTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalVercelEnv = env.VERCEL_ENV;

  delete process.env.TEST_JSON_ENV;

  assert.equal(getOptionalJsonEnv("TEST_JSON_ENV"), null);

  process.env.TEST_JSON_ENV = '{"enabled":true}';
  assert.deepEqual(getOptionalJsonEnv<{ enabled: boolean }>("TEST_JSON_ENV"), {
    enabled: true
  });

  process.env.TEST_JSON_ENV = "{bad json";

  assert.throws(
    () => getOptionalJsonEnv("TEST_JSON_ENV"),
    /Environment variable TEST_JSON_ENV contains invalid JSON/
  );

  delete process.env.TEST_JSON_ENV;

  delete process.env.API_RATE_LIMIT_WINDOW_MS;
  delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
  delete process.env.WEBHOOK_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.LOG_LEVEL;
  delete process.env.REPORT_DOWNLOAD_SIGNING_SECRET;
  delete process.env.REPORT_DOWNLOAD_REQUIRE_AUTH;
  delete process.env.AUTH_MODE;
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_BASE_URL;
  delete process.env.DIFY_WORKFLOW_ID;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.N8N_CALLBACK_SECRET;
  delete process.env.N8N_SECRET;
  delete env.NODE_ENV;
  delete env.VERCEL_ENV;

  assert.equal(getApiRateLimitWindowMs(), 60_000);
  assert.equal(getApiRateLimitMaxRequests(), 60);
  assert.equal(getWebhookRateLimitWindowMs(), 60_000);
  assert.equal(getWebhookRateLimitMaxRequests(), 30);
  assert.equal(getLogLevel(), "info");
  assert.equal(getAuthMode(), "password");
  assert.equal(getRuntimeEnvironment(), "development");
  assert.equal(isSignedReportAuthEnforced(), false);
  assert.equal(getSalesContactEmail(), "info@evolveedgeai.com");
  assert.equal(
    getFoundingRiskAuditOfferUrl(),
    "/contact?intent=founding-risk-audit&source=marketing-site"
  );
  assert.equal(
    getFoundingRiskAuditCallUrl(),
    "https://meetings-na2.hubspot.com/kiel-green"
  );

  process.env.API_RATE_LIMIT_WINDOW_MS = "120000";
  process.env.API_RATE_LIMIT_MAX_REQUESTS = "12";
  process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = "30000";
  process.env.WEBHOOK_RATE_LIMIT_MAX_REQUESTS = "5";
  process.env.LOG_LEVEL = "debug";
  process.env.REPORT_DOWNLOAD_SIGNING_SECRET = "report-secret";
  process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "true";
  process.env.AUTH_MODE = "demo";
  env.VERCEL_ENV = "preview";

  assert.equal(getApiRateLimitWindowMs(), 120_000);
  assert.equal(getApiRateLimitMaxRequests(), 12);
  assert.equal(getWebhookRateLimitWindowMs(), 30_000);
  assert.equal(getWebhookRateLimitMaxRequests(), 5);
  assert.equal(getLogLevel(), "debug");
  assert.equal(getReportDownloadSigningSecret(), "report-secret");
  assert.equal(getAuthMode(), "demo");
  assert.equal(isSignedReportAuthEnforced(), true);

  process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "";
  assert.equal(getRuntimeEnvironment(), "preview");
  assert.equal(isSignedReportAuthEnforced(), true);


  delete process.env.DIFY_API_BASE_URL;
  process.env.DIFY_BASE_URL = "https://dify.alias.example";
  assert.equal(getDifyBaseUrl(), "https://dify.alias.example");

  process.env.NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL = "https://meetings.example.com/founding-risk-audit";
  assert.equal(
    getFoundingRiskAuditCallUrl(),
    "https://meetings.example.com/founding-risk-audit"
  );

  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_BASE_URL;
  delete process.env.DIFY_WORKFLOW_ID;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.N8N_CALLBACK_SECRET;
  delete process.env.N8N_SECRET;

  assert.throws(() => assertRequiredRuntimeConfig(), /Missing required runtime environment variables/);

  process.env.AUTH_MODE = "demo";
  process.env.AUTH_SECRET = "auth-secret";
  process.env.DATABASE_URL = "postgres://example";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.HUBSPOT_ACCESS_TOKEN = "hubspot_token";
  process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook";
  process.env.N8N_WORKFLOW_DESTINATIONS = "[]";
  process.env.OUTBOUND_DISPATCH_SECRET = "dispatch-secret";
  process.env.DIFY_API_KEY = "dify_key";
  process.env.DIFY_BASE_URL = "https://dify.example";
  process.env.DIFY_WORKFLOW_ID = "wf_123";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.APP_BASE_URL = "https://app.example";
  process.env.N8N_SECRET = "n8n-secret";

  assert.doesNotThrow(() => assertRequiredRuntimeConfig());

  const configStatus = getRuntimeConfigStatus();
  const n8nCallbackEntry = configStatus.find((entry) => entry.key === "N8N_CALLBACK_SECRET");
  assert.equal(n8nCallbackEntry?.configured, true);

  delete process.env.API_RATE_LIMIT_WINDOW_MS;
  delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
  delete process.env.WEBHOOK_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.LOG_LEVEL;
  delete process.env.REPORT_DOWNLOAD_SIGNING_SECRET;
  delete process.env.REPORT_DOWNLOAD_REQUIRE_AUTH;
  delete process.env.AUTH_MODE;
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_BASE_URL;
  delete process.env.DIFY_WORKFLOW_ID;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.N8N_CALLBACK_SECRET;
  delete process.env.N8N_SECRET;
  delete env.NODE_ENV;
  delete env.VERCEL_ENV;

  if (originalNodeEnv) {
    env.NODE_ENV = originalNodeEnv;
  }
  if (originalVercelEnv) {
    env.VERCEL_ENV = originalVercelEnv;
  }

  console.log("runtime-config tests passed");
}

runRuntimeConfigTests();
