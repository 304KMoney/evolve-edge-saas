import assert from "node:assert/strict";
import {
  assertRequiredRuntimeConfig,
  getApiRateLimitMaxRequests,
  getApiRateLimitWindowMs,
  getAiExecutionProvider,
  getAiExecutionEnterpriseMaxInputChars,
  getAiExecutionMaxConcurrency,
  getAiExecutionMaxInputChars,
  getAiExecutionMaxConcurrentPerOrg,
  getAiExecutionOrgRateLimitMaxRequests,
  getAiExecutionOrgRateLimitWindowMs,
  getAiExecutionScaleMaxInputChars,
  getAiExecutionStarterMaxInputChars,
  getAiExecutionWorkflowRateLimitMaxRequests,
  getAiExecutionWorkflowRateLimitWindowMs,
  getAssessmentRetentionDays,
  getAuditLogRetentionDays,
  getOpenAICheapModel,
  getOpenAIStrongModel,
  isAiDebugModeEnabled,
  getAuthMode,
  getDifyBaseUrl,
  getFoundingRiskAuditCallUrl,
  getFoundingRiskAuditOfferUrl,
  getLogLevel,
  getOpenAIModel,
  getOptionalJsonEnv,
  isPreviewGuestAccessEnabled,
  getReportDownloadSigningSecret,
  getRuntimeConfigStatus,
  getSalesContactEmail,
  getRuntimeEnvironment,
  getReportRetentionDays,
  getWebhookRateLimitMaxRequests,
  getWebhookRateLimitWindowMs,
  getWorkflowTraceRetentionDays,
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
  delete process.env.PREVIEW_GUEST_ACCESS_ENABLED;
  delete process.env.AUTH_MODE;
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.AI_EXECUTION_DISPATCH_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_CHEAP_MODEL;
  delete process.env.OPENAI_STRONG_MODEL;
  delete process.env.AI_EXECUTION_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_STARTER_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_SCALE_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_MAX_CONCURRENCY;
  delete process.env.AI_EXECUTION_MAX_CONCURRENT_PER_ORG;
  delete process.env.AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS;
  delete process.env.AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS;
  delete process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.REPORT_RETENTION_DAYS;
  delete process.env.ASSESSMENT_RETENTION_DAYS;
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  delete process.env.WORKFLOW_TRACE_RETENTION_DAYS;
  delete process.env.AI_DEBUG_MODE;
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
  assert.equal(getAiExecutionProvider(), "openai_langgraph");
  assert.equal(isAiDebugModeEnabled(), false);
  assert.equal(getOpenAICheapModel(), "gpt-4o-2024-08-06");
  assert.equal(getOpenAIModel(), "gpt-4o-2024-08-06");
  assert.equal(getOpenAIStrongModel(), "gpt-4o-2024-08-06");
  assert.equal(getAiExecutionMaxInputChars(), 24_000);
  assert.equal(getAiExecutionStarterMaxInputChars(), 12_000);
  assert.equal(getAiExecutionScaleMaxInputChars(), 24_000);
  assert.equal(getAiExecutionEnterpriseMaxInputChars(), 40_000);
  assert.equal(getAiExecutionMaxConcurrency(), 4);
  assert.equal(getAiExecutionMaxConcurrentPerOrg(), 2);
  assert.equal(getAiExecutionOrgRateLimitWindowMs(), 60_000);
  assert.equal(getAiExecutionOrgRateLimitMaxRequests(), 10);
  assert.equal(getAiExecutionWorkflowRateLimitWindowMs(), 60_000);
  assert.equal(getAiExecutionWorkflowRateLimitMaxRequests(), 3);
  assert.equal(getReportRetentionDays(), 365);
  assert.equal(getAssessmentRetentionDays(), 365);
  assert.equal(getAuditLogRetentionDays(), 90);
  assert.equal(getWorkflowTraceRetentionDays(), 30);
  assert.equal(getRuntimeEnvironment(), "development");
  assert.equal(isPreviewGuestAccessEnabled(), false);
  assert.equal(isSignedReportAuthEnforced(), false);
  assert.equal(getSalesContactEmail(), "sales@evolveedgeai.com");
  assert.equal(
    getFoundingRiskAuditOfferUrl(),
    "/pricing?plan=starter&billingCadence=monthly"
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
  process.env.AI_EXECUTION_PROVIDER = "dify";
  process.env.OPENAI_CHEAP_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.OPENAI_STRONG_MODEL = "o4-mini";
  process.env.AI_EXECUTION_MAX_INPUT_CHARS = "30000";
  process.env.AI_EXECUTION_STARTER_MAX_INPUT_CHARS = "10000";
  process.env.AI_EXECUTION_SCALE_MAX_INPUT_CHARS = "25000";
  process.env.AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS = "50000";
  process.env.AI_EXECUTION_MAX_CONCURRENCY = "8";
  process.env.AI_EXECUTION_MAX_CONCURRENT_PER_ORG = "3";
  process.env.AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS = "90000";
  process.env.AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS = "12";
  process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS = "45000";
  process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS = "4";
  process.env.REPORT_RETENTION_DAYS = "400";
  process.env.ASSESSMENT_RETENTION_DAYS = "500";
  process.env.AUDIT_LOG_RETENTION_DAYS = "120";
  process.env.WORKFLOW_TRACE_RETENTION_DAYS = "45";
  process.env.AI_DEBUG_MODE = "true";
  env.VERCEL_ENV = "preview";

  assert.equal(getApiRateLimitWindowMs(), 120_000);
  assert.equal(getApiRateLimitMaxRequests(), 12);
  assert.equal(getWebhookRateLimitWindowMs(), 30_000);
  assert.equal(getWebhookRateLimitMaxRequests(), 5);
  assert.equal(getLogLevel(), "debug");
  assert.equal(getReportDownloadSigningSecret(), "report-secret");
  assert.equal(getAuthMode(), "demo");
  assert.equal(getAiExecutionProvider(), "dify");
  assert.equal(getOpenAICheapModel(), "gpt-4.1-mini");
  assert.equal(getOpenAIModel(), "gpt-4.1-mini");
  assert.equal(getOpenAIStrongModel(), "o4-mini");
  assert.equal(getAiExecutionMaxInputChars(), 30_000);
  assert.equal(getAiExecutionStarterMaxInputChars(), 10_000);
  assert.equal(getAiExecutionScaleMaxInputChars(), 25_000);
  assert.equal(getAiExecutionEnterpriseMaxInputChars(), 50_000);
  assert.equal(getAiExecutionMaxConcurrency(), 8);
  assert.equal(getAiExecutionMaxConcurrentPerOrg(), 3);
  assert.equal(getAiExecutionOrgRateLimitWindowMs(), 90_000);
  assert.equal(getAiExecutionOrgRateLimitMaxRequests(), 12);
  assert.equal(getAiExecutionWorkflowRateLimitWindowMs(), 45_000);
  assert.equal(getAiExecutionWorkflowRateLimitMaxRequests(), 4);
  assert.equal(getReportRetentionDays(), 400);
  assert.equal(getAssessmentRetentionDays(), 500);
  assert.equal(getAuditLogRetentionDays(), 120);
  assert.equal(getWorkflowTraceRetentionDays(), 45);
  assert.equal(isAiDebugModeEnabled(), true);
  assert.equal(isSignedReportAuthEnforced(), true);
  assert.equal(isPreviewGuestAccessEnabled(), true);

  process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "";
  assert.equal(getRuntimeEnvironment(), "preview");
  assert.equal(isSignedReportAuthEnforced(), true);
  process.env.PREVIEW_GUEST_ACCESS_ENABLED = "false";
  assert.equal(isPreviewGuestAccessEnabled(), false);
  process.env.PREVIEW_GUEST_ACCESS_ENABLED = "true";
  assert.equal(isPreviewGuestAccessEnabled(), true);


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
  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.AI_EXECUTION_DISPATCH_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_CHEAP_MODEL;
  delete process.env.OPENAI_STRONG_MODEL;
  delete process.env.AI_EXECUTION_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_STARTER_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_SCALE_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS;
  delete process.env.AI_EXECUTION_MAX_CONCURRENCY;
  delete process.env.AI_EXECUTION_MAX_CONCURRENT_PER_ORG;
  delete process.env.AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS;
  delete process.env.AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS;
  delete process.env.AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.REPORT_RETENTION_DAYS;
  delete process.env.ASSESSMENT_RETENTION_DAYS;
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  delete process.env.WORKFLOW_TRACE_RETENTION_DAYS;
  delete process.env.AI_DEBUG_MODE;
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
  process.env.STRIPE_PRICE_STARTER_ANNUAL = "price_starter";
  process.env.STRIPE_PRICE_SCALE_ANNUAL = "price_scale";
  process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = "price_enterprise";
  process.env.STRIPE_PRODUCT_STARTER = "prod_starter";
  process.env.STRIPE_PRODUCT_SCALE = "prod_scale";
  process.env.STRIPE_PRODUCT_ENTERPRISE = "prod_enterprise";
  process.env.HUBSPOT_ACCESS_TOKEN = "hubspot_token";
  process.env.N8N_WORKFLOW_DESTINATIONS =
    '[{"name":"auditRequested","url":"https://n8n.example/webhook"}]';
  process.env.OUTBOUND_DISPATCH_SECRET = "dispatch-secret";
  process.env.AI_EXECUTION_PROVIDER = "openai_langgraph";
  process.env.AI_EXECUTION_DISPATCH_SECRET = "ai-dispatch-secret";
  process.env.OPENAI_API_KEY = "openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-2024-08-06";
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
  delete process.env.PREVIEW_GUEST_ACCESS_ENABLED;
  delete process.env.AUTH_MODE;
  delete process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_STARTER_ANNUAL;
  delete process.env.STRIPE_PRICE_SCALE_ANNUAL;
  delete process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
  delete process.env.STRIPE_PRODUCT_STARTER;
  delete process.env.STRIPE_PRODUCT_SCALE;
  delete process.env.STRIPE_PRODUCT_ENTERPRISE;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.AI_EXECUTION_DISPATCH_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
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
