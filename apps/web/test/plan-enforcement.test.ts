import assert from "node:assert/strict";
import {
  BillingAccessState,
  CanonicalPlanKey,
  SubscriptionStatus
} from "@evolve-edge/db";
import type { EntitlementSnapshot } from "../lib/entitlements";
import {
  PlanAccessError,
  assertPlanCapability,
  resolveStrictPlanAccess
} from "../lib/plan-enforcement";

function createEntitlements(
  overrides: Partial<EntitlementSnapshot> = {}
): EntitlementSnapshot {
  const featureAccess = {
    "workspace.access": true,
    "assessments.create": true,
    "reports.view": true,
    "reports.generate": true,
    "roadmap.view": true,
    "members.manage": false,
    "billing.portal": true,
    "evidence.view": true,
    "evidence.manage": true,
    "uploads.manage": true,
    "monitoring.view": true,
    "monitoring.manage": false,
    "executive.reviews": false,
    "executive.delivery": false,
    "frameworks.view": true,
    "frameworks.manage": true,
    "custom.frameworks": false,
    "api.access": false,
    "priority.support": false
  } satisfies EntitlementSnapshot["featureAccess"];

  return {
    planName: "Starter",
    planCode: "starter-annual",
    canonicalPlanKey: CanonicalPlanKey.STARTER,
    workspaceMode: "SUBSCRIPTION",
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    billingAccessState: BillingAccessState.ACTIVE,
    hasLiveSubscription: true,
    isTrialing: false,
    isReadOnly: false,
    seatsUsed: 1,
    seatsLimit: 3,
    seatsUsagePercent: 33,
    isSeatLimitReached: false,
    hasSeatCapacity: true,
    activeAssessments: 0,
    activeAssessmentsLimit: 1,
    activeAssessmentsUsagePercent: 0,
    isAssessmentLimitReached: false,
    hasAssessmentCapacity: true,
    reportsGenerated: 0,
    uploadsLimit: 50,
    monitoringAssetsLimit: 10,
    aiProcessingRunsLimit: 1,
    storageBytesLimit: 500_000_000,
    lastActivityAt: null,
    frameworksSelected: 1,
    frameworksLimit: 3,
    features: {
      assessments: true,
      reportCenter: true,
      roadmap: true,
      teamManagement: false,
      billingPortal: true,
      executiveReviews: false,
      customFrameworks: false,
      prioritySupport: false,
      apiAccess: false
    },
    featureAccess,
    limits: {
      users: 3,
      audits: 1,
      uploads: 50,
      monitoring_assets: 10,
      frameworks: 3,
      reports_generated: 1,
      storage_bytes: 500_000_000,
      ai_processing_runs: 1
    },
    appliedOverrides: [],
    canAccessWorkspace: true,
    canCreateAssessment: true,
    canAccessReports: true,
    canGenerateReports: true,
    canAccessRoadmap: true,
    canManageMembers: false,
    canManageBilling: true,
    canUseFeature: () => true,
    hasFeature: (feature) => featureAccess[feature],
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    availablePlanMappings: [],
    ...overrides
  };
}

function runPlanEnforcementTests() {
  const starter = createEntitlements();
  assert.equal(resolveStrictPlanAccess(starter)?.plan, "starter");
  assert.equal(resolveStrictPlanAccess(starter)?.maxAudits, 1);

  assert.doesNotThrow(() =>
    assertPlanCapability({
      organizationId: "org_123",
      entitlements: starter,
      capability: "routing",
      workflowCode: "audit_starter"
    })
  );

  assert.throws(
    () =>
      assertPlanCapability({
        organizationId: "org_123",
        entitlements: starter,
        capability: "ai_execution",
        workflowCode: "audit_scale"
      }),
    (error) =>
      error instanceof PlanAccessError && error.code === "WORKFLOW_PLAN_MISMATCH"
  );

  assert.throws(
    () =>
      assertPlanCapability({
        organizationId: "org_123",
        entitlements: createEntitlements({ canonicalPlanKey: null }),
        capability: "routing",
        workflowCode: "audit_starter"
      }),
    (error) => error instanceof PlanAccessError && error.code === "PLAN_MISSING"
  );

  assert.throws(
    () =>
      assertPlanCapability({
        organizationId: "org_123",
        entitlements: createEntitlements({
          billingAccessState: BillingAccessState.CANCELED,
          workspaceMode: "READ_ONLY"
        }),
        capability: "report_generation",
        workflowCode: "audit_starter"
      }),
    (error) => error instanceof PlanAccessError && error.code === "ACCESS_EXPIRED"
  );

  assert.doesNotThrow(() =>
    assertPlanCapability({
      organizationId: "org_123",
      entitlements: createEntitlements({
        activeAssessments: 1
      }),
      capability: "routing",
      workflowCode: "audit_starter"
    })
  );

  assert.throws(
    () =>
      assertPlanCapability({
        organizationId: "org_123",
        entitlements: createEntitlements({
          activeAssessments: 2
        }),
        capability: "routing",
        workflowCode: "audit_starter"
      }),
    (error) => error instanceof PlanAccessError && error.code === "QUOTA_EXCEEDED"
  );

  const enterprise = createEntitlements({
    canonicalPlanKey: CanonicalPlanKey.ENTERPRISE,
    planCode: "enterprise-annual",
    featureAccess: {
      ...starter.featureAccess,
      "executive.delivery": true,
      "priority.support": true,
      "custom.frameworks": true,
      "api.access": true
    }
  });

  assert.doesNotThrow(() =>
    assertPlanCapability({
      organizationId: "org_123",
      entitlements: enterprise,
      capability: "executive_briefing",
      workflowCode: "audit_enterprise"
    })
  );

  console.log("plan enforcement tests passed");
}

runPlanEnforcementTests();
