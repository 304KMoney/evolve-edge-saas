import assert from "node:assert/strict";
import { GET } from "../app/api/internal/workflows/[workflowDispatchId]/trace/route";
import {
  clearWorkflowTrace,
  recordNodeCompleted,
  recordNodeStarted,
  startWorkflowTrace,
} from "../src/server/ai/observability/workflow-tracker";

async function runWorkflowTraceRouteTests() {
  process.env.AI_EXECUTION_DISPATCH_SECRET = "trace-secret";
  process.env.AI_DEBUG_MODE = "true";

  clearWorkflowTrace("wd_trace");
  startWorkflowTrace({
    workflowDispatchId: "wd_trace",
    dispatchId: "disp_trace",
    assessmentId: "asm_trace",
    orgId: "org_trace",
  });
  recordNodeStarted({
    workflowDispatchId: "wd_trace",
    nodeName: "business_context",
  });
  recordNodeCompleted({
    workflowDispatchId: "wd_trace",
    nodeName: "business_context",
    durationMs: 120,
    includeDebug: true,
    output: {
      customerEmail: "buyer@example.com",
      summary: "Use buyer@example.com for follow-up.",
    },
  });

  const unauthorized = await GET(
    new Request("https://example.com/api/internal/workflows/wd_trace/trace"),
    {
      params: Promise.resolve({ workflowDispatchId: "wd_trace" }),
    }
  );
  assert.equal(unauthorized.status, 401);

  const missingOrgScope = await GET(
    new Request("https://example.com/api/internal/workflows/wd_trace/trace", {
      headers: {
        authorization: "Bearer trace-secret",
      },
    }),
    {
      params: Promise.resolve({ workflowDispatchId: "wd_trace" }),
    }
  );
  assert.equal(missingOrgScope.status, 400);

  const authorized = await GET(
    new Request("https://example.com/api/internal/workflows/wd_trace/trace?orgId=org_trace", {
      headers: {
        authorization: "Bearer trace-secret",
      },
    }),
    {
      params: Promise.resolve({ workflowDispatchId: "wd_trace" }),
    }
  );
  assert.equal(authorized.status, 200);
  const body = (await authorized.json()) as Record<string, unknown>;
  assert.equal(body.workflowDispatchId, "wd_trace");
  assert.equal(body.status, "running");
  assert.doesNotMatch(JSON.stringify(body), /buyer@example\.com/);

  const crossOrg = await GET(
    new Request("https://example.com/api/internal/workflows/wd_trace/trace?orgId=org_other", {
      headers: {
        authorization: "Bearer trace-secret",
      },
    }),
    {
      params: Promise.resolve({ workflowDispatchId: "wd_trace" }),
    }
  );
  assert.equal(crossOrg.status, 404);

  delete process.env.AI_EXECUTION_DISPATCH_SECRET;
  delete process.env.AI_DEBUG_MODE;
  console.log("workflow-trace-route tests passed");
}

void runWorkflowTraceRouteTests();
