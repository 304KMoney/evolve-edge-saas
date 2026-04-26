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
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.STRIPE_PRICE_STARTER_ANNUAL = "price_starter";
  process.env.STRIPE_PRICE_SCALE_ANNUAL = "price_scale";
  process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = "price_enterprise";
  process.env.STRIPE_PRODUCT_STARTER = "prod_starter";
  process.env.STRIPE_PRODUCT_SCALE = "prod_scale";
  process.env.STRIPE_PRODUCT_ENTERPRISE = "prod_enterprise";
  delete process.env.N8N_WORKFLOW_DESTINATIONS;
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_CALLBACK_SECRET;
  delete process.env.N8N_CALLBACK_SHARED_SECRET;
  delete process.env.OUTBOUND_DISPATCH_SECRET;
  process.env.N8N_DISPATCH_ENABLED = "false";
  delete process.env.HUBSPOT_SYNC_ENABLED;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.DIFY_API_KEY;
  delete process.env.DIFY_API_BASE_URL;
  delete process.env.DIFY_BASE_URL;
  delete process.env.DIFY_WORKFLOW_ID;
  process.env.DIFY_EXECUTION_ENABLED = "false";

  assert.doesNotThrow(() => assertCriticalEnvironmentParity());

  process.env.AI_EXECUTION_PROVIDER = "openai_langgraph";
  process.env.AI_EXECUTION_DISPATCH_SECRET = "ai_dispatch_secret";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  assert.throws(() => assertCriticalEnvironmentParity(), /OPENAI_API_KEY/);

  process.env.OPENAI_API_KEY = "openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-2024-08-06";
  process.env.N8N_DISPATCH_ENABLED = "true";
  process.env.N8N_WORKFLOW_DESTINATIONS =
    '[{"name":"reportReady","url":"https://n8n.example.com/report-ready"}]';
  process.env.N8N_CALLBACK_SECRET = "callback_secret";
  process.env.OUTBOUND_DISPATCH_SECRET = "dispatch_secret";
  assert.throws(() => assertCriticalEnvironmentParity(), /N8N_WORKFLOW_DESTINATIONS/);
  process.env.N8N_WORKFLOW_DESTINATIONS =
    '[{"name":"auditRequested","url":"https://n8n.example.com/audit-requested"}]';

  const status = getEnvironmentParityStatus();
  const openAiKey = status.find((entry) => entry.key === "OPENAI_API_KEY");
  assert.equal(openAiKey?.required, true);
  assert.equal(openAiKey?.configured, true);
  const n8nDestinations = status.find(
    (entry) => entry.key === "N8N_WORKFLOW_DESTINATIONS"
  );
  assert.equal(n8nDestinations?.required, true);
  assert.equal(n8nDestinations?.configured, true);

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
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_STARTER_ANNUAL;
  delete process.env.STRIPE_PRICE_SCALE_ANNUAL;
  delete process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
  delete process.env.STRIPE_PRODUCT_STARTER;
  delete process.env.STRIPE_PRODUCT_SCALE;
  delete process.env.STRIPE_PRODUCT_ENTERPRISE;
  delete process.env.HUBSPOT_SYNC_ENABLED;
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.AI_EXECUTION_DISPATCH_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
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
