import assert from "node:assert/strict";
import { POST } from "../app/api/internal/workflows/audit/execute/route";

async function runAiExecuteRouteAuthTests() {
  process.env.AI_EXECUTION_DISPATCH_SECRET = "test-secret";

  const missingAuthResponse = await POST(
    new Request("https://example.com/api/internal/workflows/audit/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_123",
        dispatchId: "disp_123",
        customerEmail: "buyer@example.com",
        companyName: "Acme",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy artifacts were provided.",
        planTier: "scale"
      })
    })
  );

  assert.equal(missingAuthResponse.status, 401);
  const missingBody = (await missingAuthResponse.json()) as Record<string, unknown>;
  assert.equal(missingBody.accepted, false);

  const invalidAuthResponse = await POST(
    new Request("https://example.com/api/internal/workflows/audit/execute", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_123",
        dispatchId: "disp_123",
        customerEmail: "buyer@example.com",
        companyName: "Acme",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy artifacts were provided.",
        planTier: "scale"
      })
    })
  );

  assert.equal(invalidAuthResponse.status, 401);

  const serviceTokenResponse = await POST(
    new Request("https://example.com/api/internal/workflows/audit/execute", {
      method: "POST",
      headers: {
        "x-evolve-edge-service-token": "test-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_123",
        dispatchId: "disp_123",
        customerEmail: "buyer@example.com",
        companyName: "Acme",
        industry: "Healthcare",
        companySize: "51-200",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: [
          {
            question: "Do you have formal policies?",
            answer: "No"
          }
        ],
        evidenceSummary: "No policy artifacts were provided.",
        planTier: "scale"
      })
    })
  );

  assert.notEqual(serviceTokenResponse.status, 401);

  delete process.env.AI_EXECUTION_DISPATCH_SECRET;

  console.log("ai-execute-route-auth tests passed");
}

void runAiExecuteRouteAuthTests();
