import assert from "node:assert/strict";
import {
  getFirstCustomerLaunchEnvironmentChecklist,
  runFirstCustomerLaunchPreflight
} from "../lib/launch-preflight";

function clearRelevantEnv() {
  const env = process.env as Record<string, string | undefined>;
  delete env.NODE_ENV;
  delete env.VERCEL_ENV;
  delete env.AUTH_MODE;
  delete env.AUTH_SECRET;
  delete env.AUTH_ACCESS_EMAIL;
  delete env.AUTH_ACCESS_PASSWORD;
  delete env.DATABASE_URL;
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_WEBHOOK_SECRET;
  delete env.OUTBOUND_DISPATCH_SECRET;
  delete env.AI_EXECUTION_PROVIDER;
  delete env.AI_EXECUTION_DISPATCH_SECRET;
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_MODEL;
  delete env.N8N_CALLBACK_SECRET;
  delete env.N8N_WORKFLOW_DESTINATIONS;
  delete env.REPORT_DOWNLOAD_SIGNING_SECRET;
  delete env.REPORT_DOWNLOAD_REQUIRE_AUTH;
  delete env.EMAIL_FROM_ADDRESS;
  delete env.RESEND_API_KEY;
  delete env.NOTIFICATION_DISPATCH_SECRET;
  delete env.CRON_SECRET;
  delete env.NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL;
  delete env.STRIPE_PRICE_STARTER_ANNUAL;
  delete env.STRIPE_PRICE_SCALE_ANNUAL;
  delete env.STRIPE_PRICE_ENTERPRISE_ANNUAL;
  delete env.STRIPE_PRODUCT_STARTER;
  delete env.STRIPE_PRODUCT_SCALE;
  delete env.STRIPE_PRODUCT_ENTERPRISE;
  delete env.HUBSPOT_ACCESS_TOKEN;
  delete env.HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID;
  delete env.PUBLIC_INTAKE_SHARED_SECRET;
}

function runLaunchPreflightTests() {
  clearRelevantEnv();

  const failed = runFirstCustomerLaunchPreflight();
  assert.equal(failed.status, "fail");
  assert.match(
    failed.findings.map((finding) => finding.code).join(","),
    /database\.url_missing/
  );

  process.env.VERCEL_ENV = "production";
  process.env.AUTH_MODE = "password";
  process.env.AUTH_SECRET = "secret";
  process.env.AUTH_ACCESS_EMAIL = "ops@example.com";
  process.env.AUTH_ACCESS_PASSWORD = "password";
  process.env.DATABASE_URL = "postgres://example";
  process.env.STRIPE_SECRET_KEY = "sk_live_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.OUTBOUND_DISPATCH_SECRET = "dispatch_secret";
  process.env.AI_EXECUTION_PROVIDER = "openai_langgraph";
  process.env.AI_EXECUTION_DISPATCH_SECRET = "ai_dispatch_secret";
  process.env.OPENAI_API_KEY = "openai_key";
  process.env.OPENAI_MODEL = "gpt-4o-2024-08-06";
  process.env.N8N_CALLBACK_SECRET = "callback_secret";
  process.env.N8N_WORKFLOW_DESTINATIONS = '[{"name":"leadPipeline","url":"https://example.com"}]';
  process.env.REPORT_DOWNLOAD_SIGNING_SECRET = "report_secret";
  process.env.REPORT_DOWNLOAD_REQUIRE_AUTH = "true";
  process.env.EMAIL_FROM_ADDRESS = "Evolve Edge <ops@example.com>";
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.NOTIFICATION_DISPATCH_SECRET = "notification_secret";
  process.env.CRON_SECRET = "cron_secret";
  process.env.STRIPE_PRICE_STARTER_ANNUAL = "price_starter";
  process.env.STRIPE_PRICE_SCALE_ANNUAL = "price_scale";
  process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL = "price_enterprise";
  process.env.STRIPE_PRODUCT_STARTER = "prod_starter";
  process.env.STRIPE_PRODUCT_SCALE = "prod_scale";
  process.env.STRIPE_PRODUCT_ENTERPRISE = "prod_enterprise";
  process.env.PUBLIC_INTAKE_SHARED_SECRET = "public_intake_secret";

  const missingAuditRequestedDestination = runFirstCustomerLaunchPreflight();
  assert.equal(missingAuditRequestedDestination.status, "fail");
  assert.equal(
    missingAuditRequestedDestination.findings.some(
      (finding) => finding.code === "n8n.audit_requested_destination_missing"
    ),
    true
  );

  process.env.N8N_WORKFLOW_DESTINATIONS =
    '[{"name":"auditRequested","url":"https://example.com"},{"name":"leadPipeline","url":"https://example.com/lead"}]';

  const passed = runFirstCustomerLaunchPreflight();
  assert.equal(passed.status, "pass");
  assert.equal(
    passed.findings.some((finding) => finding.severity === "warning"),
    true
  );
  assert.equal(
    passed.findings.some((finding) => finding.code === "hubspot.access_token_missing"),
    true
  );
  assert.equal(
    passed.findings.some((finding) => finding.code === "delivery.booking_link_fallback_in_use"),
    true
  );

  const checklist = getFirstCustomerLaunchEnvironmentChecklist();
  assert.equal(checklist.groups.some((group) => group.name === "billing"), true);
  assert.equal(
    checklist.groups
      .flatMap((group) => group.entries)
      .some((entry) => entry.key === "STRIPE_PRICE_SCALE_ANNUAL" && entry.configured),
    true
  );
  assert.equal(
    checklist.groups
      .flatMap((group) => group.entries)
      .some((entry) => entry.key === "CRON_SECRET" && entry.configured),
    true
  );

  clearRelevantEnv();
  console.log("launch-preflight tests passed");
}

runLaunchPreflightTests();
