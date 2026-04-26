import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getIntegrationStatusSnapshot } from "../lib/integration-status";

function runIntegrationStatusTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalCwd = process.cwd();
  const originalEnv = { ...env };
  const tempRoot = mkdtempSync(
    path.join(os.tmpdir(), "evolve-edge-integration-status-")
  );

  try {
    for (const key of Object.keys(env)) {
      delete env[key];
    }

    env.NODE_ENV = "development";
    env.DATABASE_URL = "postgres://example";
    env.STRIPE_SECRET_KEY = "sk_test_123";
    env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    env.STRIPE_PRICE_STARTER_ANNUAL = "price_starter";
    env.STRIPE_PRICE_SCALE_ANNUAL = "price_scale";
    env.STRIPE_PRICE_ENTERPRISE_ANNUAL = "price_enterprise";
    env.STRIPE_PRODUCT_STARTER = "prod_starter";
    env.STRIPE_PRODUCT_SCALE = "prod_scale";
    env.STRIPE_PRODUCT_ENTERPRISE = "prod_enterprise";
    env.N8N_WORKFLOW_DESTINATIONS = '[{"name":"auditRequested","url":"https://n8n.example.com/webhook"}]';
    env.N8N_CALLBACK_SECRET = "callback_secret";
    env.AI_EXECUTION_PROVIDER = "openai_langgraph";
    env.AI_EXECUTION_DISPATCH_SECRET = "dispatch_secret";
    env.OPENAI_API_KEY = "openai_key";
    env.OPENAI_MODEL = "gpt-4o-2024-08-06";
    env.EMAIL_PROVIDER = "resend";
    env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    const vercelDir = path.join(tempRoot, ".vercel");
    mkdirSync(vercelDir, { recursive: true });
    writeFileSync(
      path.join(vercelDir, "project.json"),
      JSON.stringify({
        projectId: "prj_123",
        orgId: "team_123",
        projectName: "evolve-edge-saas",
        settings: {
          rootDirectory: "apps/web"
        }
      })
    );

    process.chdir(tempRoot);

    const snapshot = getIntegrationStatusSnapshot();
    assert.equal(snapshot.environment, "development");
    assert.equal(snapshot.integrations.find((entry) => entry.key === "neon")?.configured, true);
    assert.equal(snapshot.integrations.find((entry) => entry.key === "vercel")?.configured, true);
    assert.equal(snapshot.integrations.find((entry) => entry.key === "stripe")?.configured, true);
    delete env.STRIPE_PRODUCT_ENTERPRISE;

    const missingStripeProductSnapshot = getIntegrationStatusSnapshot();
    assert.equal(
      missingStripeProductSnapshot.integrations.find((entry) => entry.key === "stripe")
        ?.configured,
      false
    );

    env.STRIPE_PRODUCT_ENTERPRISE = "prod_enterprise";

    assert.equal(snapshot.integrations.find((entry) => entry.key === "n8n")?.configured, true);
    assert.equal(
      snapshot.integrations.find((entry) => entry.key === "openai_langgraph")?.configured,
      true
    );
    assert.equal(snapshot.integrations.find((entry) => entry.key === "apollo")?.configured, false);

    env.N8N_WORKFLOW_DESTINATIONS = '[{"name":"reportReady","url":"https://n8n.example.com/webhook/report-ready"}]';

    const missingAuditRequestedSnapshot = getIntegrationStatusSnapshot();
    assert.equal(
      missingAuditRequestedSnapshot.integrations.find((entry) => entry.key === "n8n")?.configured,
      false
    );
    assert.equal(
      missingAuditRequestedSnapshot.integrations
        .find((entry) => entry.key === "n8n")
        ?.notes.some((note) => note.includes("auditRequested is missing or invalid")),
      true
    );

    env.N8N_WORKFLOW_DESTINATIONS = '[{"name":"auditRequested","url":"https://n8n.example.com/webhook"}]';

    delete env.AI_EXECUTION_DISPATCH_SECRET;

    const missingDispatchSecretSnapshot = getIntegrationStatusSnapshot();
    assert.equal(
      missingDispatchSecretSnapshot.integrations.find(
        (entry) => entry.key === "openai_langgraph"
      )?.configured,
      false
    );
    assert.equal(
      missingDispatchSecretSnapshot.integrations
        .find((entry) => entry.key === "openai_langgraph")
        ?.notes.some((note) => note.includes("auth secret is missing")),
      true
    );

    env.APOLLO_API_KEY = "apollo_key";
    env.APOLLO_API_BASE_URL = "https://api.apollo.io/api/v1";
    env.AI_EXECUTION_DISPATCH_SECRET = "dispatch_secret";
    env.OPENAI_REASONING_MODEL = "o4-mini";

    const enrichedSnapshot = getIntegrationStatusSnapshot();
    assert.equal(
      enrichedSnapshot.integrations.find((entry) => entry.key === "apollo")?.configured,
      true
    );
    assert.equal(
      enrichedSnapshot.integrations
        .find((entry) => entry.key === "openai_langgraph")
        ?.notes.some((note) => note.includes("OPENAI_REASONING_MODEL is configured.")),
      true
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });

    for (const key of Object.keys(env)) {
      delete env[key];
    }

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }

  console.log("integration-status tests passed");
}

runIntegrationStatusTests();
