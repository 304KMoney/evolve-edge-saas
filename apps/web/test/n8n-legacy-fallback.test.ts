import assert from "node:assert/strict";
import {
  N8N_WORKFLOW_NAMES,
  getN8nWorkflowDestinations,
  isLegacyN8nWebhookFallbackActive
} from "../lib/n8n";

function runN8nLegacyFallbackTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalWorkflowDestinations = env.N8N_WORKFLOW_DESTINATIONS;
  const originalWebhookUrl = env.N8N_WEBHOOK_URL;
  const originalWebhookSecret = env.N8N_WEBHOOK_SECRET;
  const originalWebhookTimeoutMs = env.N8N_WEBHOOK_TIMEOUT_MS;

  delete env.N8N_WORKFLOW_DESTINATIONS;
  env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/shared";
  env.N8N_WEBHOOK_SECRET = "shared-secret";
  env.N8N_WEBHOOK_TIMEOUT_MS = "15000";

  try {
    assert.equal(isLegacyN8nWebhookFallbackActive(), true);

    const destinations = getN8nWorkflowDestinations();
    assert.equal(destinations.length, N8N_WORKFLOW_NAMES.length);
    assert.deepEqual(
      destinations.map((destination) => destination.name),
      [...N8N_WORKFLOW_NAMES]
    );

    for (const destination of destinations) {
      assert.equal(destination.url, "https://n8n.example.com/webhook/shared");
      assert.equal(destination.secret, "shared-secret");
      assert.equal(destination.provider, "n8n");
      assert.equal(destination.timeoutMs, 15_000);
    }
  } finally {
    if (originalWorkflowDestinations === undefined) {
      delete env.N8N_WORKFLOW_DESTINATIONS;
    } else {
      env.N8N_WORKFLOW_DESTINATIONS = originalWorkflowDestinations;
    }

    if (originalWebhookUrl === undefined) {
      delete env.N8N_WEBHOOK_URL;
    } else {
      env.N8N_WEBHOOK_URL = originalWebhookUrl;
    }

    if (originalWebhookSecret === undefined) {
      delete env.N8N_WEBHOOK_SECRET;
    } else {
      env.N8N_WEBHOOK_SECRET = originalWebhookSecret;
    }

    if (originalWebhookTimeoutMs === undefined) {
      delete env.N8N_WEBHOOK_TIMEOUT_MS;
    } else {
      env.N8N_WEBHOOK_TIMEOUT_MS = originalWebhookTimeoutMs;
    }
  }

  console.log("n8n legacy fallback tests passed");
}

runN8nLegacyFallbackTests();
