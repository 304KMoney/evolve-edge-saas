import assert from "node:assert/strict";
import {
  getApiRateLimitMaxRequests,
  getApiRateLimitWindowMs,
  getAuthMode,
  getLogLevel,
  getOptionalJsonEnv,
  getReportDownloadSigningSecret,
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

  delete process.env.API_RATE_LIMIT_WINDOW_MS;
  delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
  delete process.env.WEBHOOK_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.LOG_LEVEL;
  delete process.env.REPORT_DOWNLOAD_SIGNING_SECRET;
  delete process.env.REPORT_DOWNLOAD_REQUIRE_AUTH;
  delete process.env.AUTH_MODE;
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
