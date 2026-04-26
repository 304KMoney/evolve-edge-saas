import assert from "node:assert/strict";
import { POST } from "../app/api/automation/intake-to-n8n/route";

async function runIntakeToN8nRouteTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalWorkflowDestinations = env.N8N_WORKFLOW_DESTINATIONS;
  const originalWebhookUrl = env.N8N_WEBHOOK_URL;
  const originalCallbackSecret = env.N8N_CALLBACK_SECRET;
  const originalCallbackSharedSecret = env.N8N_CALLBACK_SHARED_SECRET;
  const originalPublicIntakeSecret = env.PUBLIC_INTAKE_SHARED_SECRET;
  const originalNodeEnv = env.NODE_ENV;
  const originalFetch = globalThis.fetch;

  env.NODE_ENV = "test";
  env.PUBLIC_INTAKE_SHARED_SECRET = "public-intake-secret";
  env.N8N_CALLBACK_SECRET = "callback-secret";
  delete env.N8N_CALLBACK_SHARED_SECRET;
  delete env.N8N_WEBHOOK_URL;
  env.N8N_WORKFLOW_DESTINATIONS = JSON.stringify([
    {
      name: "auditRequested",
      url: "https://n8n.example.com/webhook/audit-requested"
    }
  ]);

  const fetchCalls: Array<{
    url: string;
    init: RequestInit | undefined;
  }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      init
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("https://example.com/api/automation/intake-to-n8n", {
        method: "POST",
        headers: {
          authorization: "Bearer public-intake-secret",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          request_id: "req_123",
          customer_email: "buyer@example.com",
          purchased_tier: "starter"
        })
      })
    );

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, "https://n8n.example.com/webhook/audit-requested");
    assert.equal(
      (fetchCalls[0]?.init?.headers as Record<string, string>).Authorization,
      "Bearer callback-secret"
    );

    const forwardedPayload = JSON.parse(String(fetchCalls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(forwardedPayload.request_id, "req_123");
    assert.equal(forwardedPayload.customer_email, "buyer@example.com");
    assert.equal(forwardedPayload.purchased_tier, "starter");
    assert.equal(typeof forwardedPayload.callback_urls, "object");
  } finally {
    globalThis.fetch = originalFetch;

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

    if (originalCallbackSecret === undefined) {
      delete env.N8N_CALLBACK_SECRET;
    } else {
      env.N8N_CALLBACK_SECRET = originalCallbackSecret;
    }

    if (originalCallbackSharedSecret === undefined) {
      delete env.N8N_CALLBACK_SHARED_SECRET;
    } else {
      env.N8N_CALLBACK_SHARED_SECRET = originalCallbackSharedSecret;
    }

    if (originalPublicIntakeSecret === undefined) {
      delete env.PUBLIC_INTAKE_SHARED_SECRET;
    } else {
      env.PUBLIC_INTAKE_SHARED_SECRET = originalPublicIntakeSecret;
    }

    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
  }

  console.log("intake-to-n8n route tests passed");
}

void runIntakeToN8nRouteTests();
