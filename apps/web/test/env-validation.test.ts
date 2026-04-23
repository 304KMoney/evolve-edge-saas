import assert from "node:assert/strict";
import {
  assertCriticalEnvironmentParity,
  getEnvironmentParityStatus,
  shouldEnforceCriticalEnvironmentParity
} from "../lib/env-validation";

function runEnvValidationTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalVercelEnv = env.VERCEL_ENV;

  env.NODE_ENV = "development";
  delete env.VERCEL_ENV;

  delete process.env.DATABASE_URL;
  assert.throws(() => assertCriticalEnvironmentParity(), /DATABASE_URL/);

  process.env.DATABASE_URL = "postgres://example";
  process.env.AUTH_MODE = "demo";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.EMAIL_PROVIDER = "resend";
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_CALLBACK_SECRET;
  delete process.env.N8N_CALLBACK_SHARED_SECRET;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  process.env.N8N_DISPATCH_ENABLED = "false";
  delete process.env.HUBSPOT_SYNC_ENABLED;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_BASE_URL;
  delete process.env.DIFY_WORKFLOW_ID;
  process.env.DIFY_EXECUTION_ENABLED = "false";

  assert.doesNotThrow(() => assertCriticalEnvironmentParity());

  process.env.DIFY_EXECUTION_ENABLED = "true";
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  assert.throws(() => assertCriticalEnvironmentParity(), /DIFY_API_BASE_URL/);

  process.env.DIFY_API_BASE_URL = "https://dify.example";
  process.env.DIFY_API_KEY = "dify";
  process.env.DIFY_WORKFLOW_ID = "wf_123";

  const status = getEnvironmentParityStatus();
  const difyKey = status.find((entry) => entry.key === "DIFY_API_KEY");
  assert.equal(difyKey?.required, true);
  assert.equal(difyKey?.configured, true);

  process.env.HUBSPOT_ACCESS_TOKEN = "hubspot_token";
  process.env.HUBSPOT_SYNC_ENABLED = "false";
  const disabledHubSpotStatus = getEnvironmentParityStatus();
  const disabledHubSpotKey = disabledHubSpotStatus.find(
    (entry) => entry.key === "HUBSPOT_ACCESS_TOKEN"
  );
  assert.equal(disabledHubSpotKey?.required, false);
  assert.equal(disabledHubSpotKey?.configured, true);

  process.env.HUBSPOT_SYNC_ENABLED = "true";
  const enabledHubSpotStatus = getEnvironmentParityStatus();
  const enabledHubSpotKey = enabledHubSpotStatus.find(
    (entry) => entry.key === "HUBSPOT_ACCESS_TOKEN"
  );
  assert.equal(enabledHubSpotKey?.required, true);
  assert.equal(enabledHubSpotKey?.configured, true);

  delete process.env.NEXT_PHASE;
  assert.equal(shouldEnforceCriticalEnvironmentParity(), false);

  env.VERCEL_ENV = "production";
  assert.equal(shouldEnforceCriticalEnvironmentParity(), true);

  process.env.NEXT_PHASE = "phase-production-build";
  assert.equal(shouldEnforceCriticalEnvironmentParity(), false);

  delete process.env.DATABASE_URL;
  delete process.env.AUTH_MODE;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.HUBSPOT_SYNC_ENABLED;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.DIFY_EXECUTION_ENABLED;
  delete process.env.N8N_DISPATCH_ENABLED;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_WORKFLOW_ID;
  delete process.env.NEXT_PHASE;
  delete env.VERCEL_ENV;

  if (originalNodeEnv) {
    env.NODE_ENV = originalNodeEnv;
  } else {
    delete env.NODE_ENV;
  }

  if (originalVercelEnv) {
    env.VERCEL_ENV = originalVercelEnv;
  }

  console.log("env-validation tests passed");
}

runEnvValidationTests();
