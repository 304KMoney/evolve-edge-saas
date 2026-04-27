import assert from "node:assert/strict";
import {
  CanonicalPlanKey,
  CanonicalWorkflowCode,
  CommercialPlanCode
} from "@evolve-edge/db";
import type { EntitlementSnapshot } from "../lib/entitlements";
import {
  deriveCommercialWorkflowDecision,
  mapCanonicalPlanKeyToCommercialPlanCode,
  normalizeCommercialPlanCode,
  normalizeCommercialWorkflowCode,
  resolveCommercialPlanFromStripeContext
} from "../lib/commercial-routing";

function createEntitlements(
  overrides?: Partial<EntitlementSnapshot>
): EntitlementSnapshot {
  return {
    planName: "Scale Annual",
    planCode: "scale-annual",
    canonicalPlanKey: CanonicalPlanKey.SCALE,
    workspaceMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    billingAccessState: "ACTIVE",
    hasLiveSubscription: true,
    isTrialing: false,
    isReadOnly: false,
    seatsUsed: 1,
    seatsLimit: 15,
    seatsUsagePercent: 7,
    isSeatLimitReached: false,
    hasSeatCapacity: true,
    activeAssessments: 1,
    activeAssessmentsLimit: 12,
    activeAssessmentsUsagePercent: 8,
    isAssessmentLimitReached: false,
    hasAssessmentCapacity: true,
    reportsGenerated: 1,
    uploadsLimit: 1000,
    monitoringAssetsLimit: 75,
    aiProcessingRunsLimit: 180,
    storageBytesLimit: 10_000_000_000,
    lastActivityAt: null,
    frameworksSelected: 1,
    frameworksLimit: 12,
    features: {
      assessments: true,
      reportCenter: true,
      roadmap: true,
      teamManagement: true,
      billingPortal: true,
      executiveReviews: true,
      customFrameworks: true,
      prioritySupport: true,
      apiAccess: false
    },
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
      "executive.reviews": true,
      "executive.delivery": true,
      "frameworks.view": true,
      "frameworks.manage": true,
      "custom.frameworks": true,
      "api.access": false,
      "priority.support": true
    },
    limits: {
      users: 15,
      audits: 12,
      uploads: 1000,
      monitoring_assets: 75,
      frameworks: 12,
      reports_generated: 120,
      storage_bytes: 10_000_000_000,
      ai_processing_runs: 180
    },
    appliedOverrides: [],
    canAccessWorkspace: true,
    canCreateAssessment: true,
    canAccessReports: true,
    canGenerateReports: true,
    canAccessRoadmap: true,
    canManageMembers: true,
    canManageBilling: true,
    canUseFeature: () => true,
    hasFeature: () => true,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    availablePlanMappings: [],
    ...overrides
  };
}

function runCommercialRoutingTests() {
  assert.equal(
    mapCanonicalPlanKeyToCommercialPlanCode(CanonicalPlanKey.STARTER),
    CommercialPlanCode.STARTER
  );
  assert.equal(
    mapCanonicalPlanKeyToCommercialPlanCode(CanonicalPlanKey.GROWTH),
    CommercialPlanCode.SCALE
  );
  assert.equal(normalizeCommercialPlanCode(CommercialPlanCode.ENTERPRISE), "enterprise");
  assert.equal(
    normalizeCommercialWorkflowCode(CanonicalWorkflowCode.AUDIT_SCALE),
    "audit_scale"
  );

  const metadataMapped = resolveCommercialPlanFromStripeContext({
    metadata: {
      plan_key: "enterprise"
    }
  });
  assert.equal(metadataMapped?.planCode, CommercialPlanCode.ENTERPRISE);

  process.env.STRIPE_PRICE_SCALE_ANNUAL = "price_scale_123";
  const priceMapped = resolveCommercialPlanFromStripeContext({
    stripePriceId: "price_scale_123"
  });
  assert.equal(priceMapped?.planCode, CommercialPlanCode.SCALE);

  process.env.STRIPE_PRODUCT_STARTER = "prod_starter_123";
  const productMapped = resolveCommercialPlanFromStripeContext({
    stripeProductId: "prod_starter_123"
  });
  assert.equal(productMapped?.planCode, CommercialPlanCode.STARTER);

  const scaleDecision = deriveCommercialWorkflowDecision({
    planCode: CommercialPlanCode.SCALE,
    entitlements: createEntitlements()
  });
  assert.equal(scaleDecision.workflowCode, CanonicalWorkflowCode.AUDIT_SCALE);
  assert.equal(scaleDecision.hints.processing_tier, "scale");
  assert.equal(scaleDecision.hints.capability_profile.report_depth, "enhanced");
  assert.equal(scaleDecision.hints.capability_profile.max_findings, 10);
  assert.equal(scaleDecision.hints.capability_profile.executive_briefing_eligible, true);

  const starterDecision = deriveCommercialWorkflowDecision({
    planCode: CommercialPlanCode.STARTER,
    entitlements: createEntitlements({
      canonicalPlanKey: CanonicalPlanKey.STARTER,
      planCode: "starter-annual",
      featureAccess: {
        ...createEntitlements().featureAccess,
        "monitoring.manage": false,
        "priority.support": false,
        "custom.frameworks": false
      }
    })
  });
  assert.equal(starterDecision.workflowCode, CanonicalWorkflowCode.AUDIT_STARTER);
  assert.equal(starterDecision.hints.capability_profile.report_depth, "concise");
  assert.equal(starterDecision.hints.capability_profile.max_findings, 5);
  assert.equal(starterDecision.hints.capability_profile.executive_briefing_eligible, false);

  const enterpriseDecision = deriveCommercialWorkflowDecision({
    planCode: CommercialPlanCode.ENTERPRISE,
    entitlements: createEntitlements({
      canonicalPlanKey: CanonicalPlanKey.ENTERPRISE,
      planCode: "enterprise-annual"
    })
  });
  assert.equal(enterpriseDecision.workflowCode, CanonicalWorkflowCode.AUDIT_ENTERPRISE);
  assert.equal(enterpriseDecision.hints.capability_profile.report_depth, "custom");
  assert.equal(enterpriseDecision.hints.capability_profile.max_findings, 15);
  assert.equal(enterpriseDecision.hints.capability_profile.roadmap_detail, "full");

  const quotaDecision = deriveCommercialWorkflowDecision({
    planCode: CommercialPlanCode.STARTER,
    entitlements: createEntitlements({
      activeAssessments: 2,
      limits: {
        users: 3,
        audits: 2,
        uploads: 50,
        monitoring_assets: 10,
        frameworks: 3,
        reports_generated: 12,
        storage_bytes: 500_000_000,
        ai_processing_runs: 12
      }
    })
  });
  assert.equal(quotaDecision.workflowCode, CanonicalWorkflowCode.INTAKE_REVIEW);
  assert.equal(quotaDecision.reason.codes.includes("quota.audits.exceeded"), true);

  const blockedDecision = deriveCommercialWorkflowDecision({
    planCode: CommercialPlanCode.STARTER,
    entitlements: createEntitlements({
      canAccessWorkspace: false,
      featureAccess: {
        ...createEntitlements().featureAccess,
        "workspace.access": false,
        "assessments.create": false
      }
    })
  });
  assert.equal(blockedDecision.status, "FAILED");
  assert.equal(blockedDecision.reason.codes.includes("workspace.access.missing"), true);

  console.log("commercial-routing tests passed");
}

runCommercialRoutingTests();
