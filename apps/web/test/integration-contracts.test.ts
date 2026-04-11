import assert from "node:assert/strict";
import {
  buildStripeContextMetadata,
  normalizeDifyContractShape,
  readStripeContextMetadata,
  stripEmptyStringProperties
} from "../lib/integration-contracts";

function runIntegrationContractTests() {
  {
    const metadata = buildStripeContextMetadata({
      organizationId: "org_123",
      customerEmail: "owner@example.com",
      planKey: "scale",
      planCode: "scale",
      revenuePlanCode: "scale-annual",
      source: "app.checkout",
      workflowType: "subscription_checkout"
    });

    assert.equal(metadata.org_id, "org_123");
    assert.equal(metadata.customer_email, "owner@example.com");
    assert.equal(metadata.plan_key, "scale");
    assert.equal(metadata.plan_code, "scale");
    assert.equal(metadata.revenue_plan_code, "scale-annual");
    assert.equal(metadata.source, "app.checkout");
    assert.equal(metadata.workflow_type, "subscription_checkout");
  }

  {
    const parsed = readStripeContextMetadata({
      org_id: "org_123",
      customer_email: "owner@example.com",
      plan_key: "scale",
      plan_code: "scale",
      revenue_plan_code: "scale-annual",
      environment: "production",
      source: "stripe.webhook",
      workflow_type: "subscription_sync"
    });

    assert.equal(parsed.organizationId, "org_123");
    assert.equal(parsed.customerEmail, "owner@example.com");
    assert.equal(parsed.planKey, "scale");
    assert.equal(parsed.planCode, "scale");
    assert.equal(parsed.revenuePlanCode, "scale-annual");
    assert.equal(parsed.environment, "production");
    assert.equal(parsed.workflowType, "subscription_sync");
  }

  {
    const properties = stripEmptyStringProperties({
      email: "owner@example.com",
      firstname: "",
      lastname: "Founder",
      company: "  ",
      evolve_edge_risk_level: "High"
    });

    assert.deepEqual(properties, {
      email: "owner@example.com",
      lastname: "Founder",
      evolve_edge_risk_level: "High"
    });
  }

  {
    const normalized = normalizeDifyContractShape({
      finalReport: "Board-ready summary",
      executiveSummary: "Executive summary",
      postureScore: 72,
      riskLevel: "Moderate",
      findings: [
        {
          title: "Access review gaps",
          summary: "Joiner-mover-leaver process is inconsistent.",
          severity: "HIGH",
          riskDomain: "access-control",
          impactedFrameworks: ["SOC 2"],
          score: 64
        }
      ],
      recommendations: [
        {
          title: "Formalize access reviews",
          description: "Run quarterly access reviews and retain evidence.",
          priority: "HIGH",
          ownerRole: "IT",
          effort: "Medium",
          targetTimeline: "30 days"
        }
      ]
    });

    assert.equal(normalized.finalReport, "Board-ready summary");
    assert.equal(normalized.topConcerns.length, 1);
    assert.equal(normalized.roadmap.length, 1);
    assert.equal(normalized.recommendations.length, 1);
  }

  console.log("integration-contracts tests passed");
}

runIntegrationContractTests();
