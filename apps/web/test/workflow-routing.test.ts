import assert from "node:assert/strict";
import { CanonicalPlanKey } from "@evolve-edge/db";
import { buildN8nEnvelope } from "../lib/n8n";
import type { WorkflowCommercialState } from "../lib/workflow-routing-decision";
import { computeWorkflowRoutingDecision } from "../lib/workflow-routing-decision";
import { extractNormalizedWorkflowHints } from "../lib/workflow-routing-hints";

function buildCommercialState(
  overrides?: Partial<WorkflowCommercialState>
): WorkflowCommercialState {
  return {
    organizationId: "org_test",
    canonicalPlanKey: CanonicalPlanKey.GROWTH,
    planCode: "growth-annual",
    workspaceMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    billingAccessState: "ACTIVE",
    featureAccess: {
      "workspace.access": true,
      "assessments.create": true,
      "reports.view": true,
      "reports.generate": true,
      "roadmap.view": true,
      "members.manage": true,
      "billing.portal": true,
      "evidence.view": true,
      "evidence.manage": true,
      "uploads.manage": true,
      "monitoring.view": true,
      "monitoring.manage": true,
      "executive.reviews": false,
      "executive.delivery": true,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": false,
      "api.access": false,
      "priority.support": false
    },
    limits: {
      users: 8,
      audits: 5,
      uploads: 250,
      monitoring_assets: 25,
      frameworks: 6,
      reports_generated: 36,
      storage_bytes: 2_500_000_000,
      ai_processing_runs: 60
    },
    appliedOverrides: [],
    usageMetering: {
      organizationId: "org_test",
      planCode: "growth-annual",
      metrics: [
        {
          key: "reportsGenerated",
          label: "Reports",
          description: "Reports",
          unit: "count",
          used: 12,
          limit: 36,
          remaining: 24,
          percentUsed: 33,
          enforcement: "soft",
          warningThresholdPercent: 80,
          status: "ok",
          isConfigured: true,
          shortLabel: "Reports",
          usageLabel: "12 of 36",
          helperText: "ok",
          upgradeTitle: "Reports",
          upgradeBody: "Reports",
          actionHref: "/pricing",
          actionLabel: "Compare plans"
        },
        {
          key: "monitoredAssets",
          label: "Assets",
          description: "Assets",
          unit: "count",
          used: 5,
          limit: 25,
          remaining: 20,
          percentUsed: 20,
          enforcement: "soft",
          warningThresholdPercent: 80,
          status: "ok",
          isConfigured: true,
          shortLabel: "Assets",
          usageLabel: "5 of 25",
          helperText: "ok",
          upgradeTitle: "Assets",
          upgradeBody: "Assets",
          actionHref: "/pricing",
          actionLabel: "Compare plans"
        },
        {
          key: "aiProcessingRuns",
          label: "AI runs",
          description: "AI runs",
          unit: "count",
          used: 10,
          limit: 60,
          remaining: 50,
          percentUsed: 17,
          enforcement: "soft",
          warningThresholdPercent: 80,
          status: "ok",
          isConfigured: true,
          shortLabel: "AI",
          usageLabel: "10 of 60",
          helperText: "ok",
          upgradeTitle: "AI",
          upgradeBody: "AI",
          actionHref: "/pricing",
          actionLabel: "Compare plans"
        }
      ],
      topWarning: null
    },
    environment: "production",
    addOnKeys: [],
    ...overrides
  };
}

function runWorkflowRoutingTests() {
  {
    const decision = computeWorkflowRoutingDecision({
      workflowFamily: "assessment_analysis",
      commercialState: buildCommercialState({
        canonicalPlanKey: CanonicalPlanKey.STARTER,
        planCode: "starter-annual",
        featureAccess: {
          ...buildCommercialState().featureAccess,
          "monitoring.manage": false
        }
      })
    });

    assert.equal(decision.routeKey, "analysis.starter_concise");
    assert.equal(decision.workflowHints.reportDepth, "concise");
    assert.equal(decision.workflowHints.featureFlags.controlScoringEnabled, false);
  }

  {
    const decision = computeWorkflowRoutingDecision({
      workflowFamily: "report_pipeline",
      commercialState: buildCommercialState({
        canonicalPlanKey: CanonicalPlanKey.SCALE,
        planCode: "scale-annual",
        featureAccess: {
          ...buildCommercialState().featureAccess,
          "executive.reviews": true,
          "custom.frameworks": true,
          "priority.support": true
        }
      })
    });

    assert.equal(decision.routeKey, "report.scale_enhanced");
    assert.equal(decision.workflowHints.controlScoringMode, "enhanced");
    assert.equal(decision.workflowHints.monitoringMode, "enhanced");
  }

  {
    const decision = computeWorkflowRoutingDecision({
      workflowFamily: "assessment_analysis",
      commercialState: buildCommercialState({
        usageMetering: {
          ...buildCommercialState().usageMetering,
          metrics: buildCommercialState().usageMetering.metrics.map((metric) =>
            metric.key === "aiProcessingRuns"
              ? {
                  ...metric,
                  used: 60,
                  remaining: 0,
                  percentUsed: 100,
                  status: "exceeded"
                }
              : metric
          )
        }
      })
    });

    assert.equal(decision.disposition, "THROTTLED");
    assert.equal(
      decision.reasonCodes.includes("quota.ai_processing_runs.soft_limit_reached"),
      true
    );
  }

  {
    const decision = computeWorkflowRoutingDecision({
      workflowFamily: "report_pipeline",
      commercialState: buildCommercialState({
        canonicalPlanKey: CanonicalPlanKey.ENTERPRISE,
        planCode: "enterprise-annual",
        appliedOverrides: [
          {
            key: "priority.support",
            source: "ENTERPRISE",
            reason: "Contracted custom workflow",
            expiresAt: null
          }
        ]
      })
    });
    const payload = {
      workflowRoutingDecisionId: "route_123",
      workflowRouting: decision.workflowHints,
      workflowRoutingReasonCodes: decision.reasonCodes
    };
    const extracted = extractNormalizedWorkflowHints(payload);
    const envelope = buildN8nEnvelope({
      delivery: {
        id: "del_123",
        attemptCount: 1
      },
      event: {
        id: "evt_123",
        idempotencyKey: "evt_123",
        type: "report.generated",
        aggregateType: "report",
        aggregateId: "rpt_123",
        orgId: "org_test",
        userId: "usr_123",
        occurredAt: new Date("2026-04-10T18:00:00.000Z"),
        payload
      },
      workflow: "reportReady",
      correlationId: "corr_123"
    });

    assert.equal(extracted.decisionId, "route_123");
    assert.equal(envelope.routing?.decisionId, "route_123");
    assert.equal(envelope.routing?.routeKey, "report.enterprise_custom");
    assert.equal(envelope.routing?.processingTier, "custom");
  }

  console.log("workflow-routing tests passed");
}

runWorkflowRoutingTests();
