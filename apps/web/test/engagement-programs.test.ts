import assert from "node:assert/strict";
import {
  EngagementCommercialModel,
  EngagementOpportunityCategory,
  EngagementProgramType
} from "@evolve-edge/db";
import {
  buildEngagementOpportunityCandidates,
  formatEngagementCommercialModel,
  formatEngagementOpportunityCategory,
  formatEngagementProgramType
} from "../lib/engagement-programs";

function runEngagementProgramTests() {
  assert.equal(
    formatEngagementProgramType(EngagementProgramType.ONE_TIME_AUDIT),
    "One-Time Audit"
  );
  assert.equal(
    formatEngagementCommercialModel(EngagementCommercialModel.SUBSCRIPTION),
    "Subscription"
  );
  assert.equal(
    formatEngagementOpportunityCategory(
      EngagementOpportunityCategory.FRAMEWORK_FOLLOW_ON
    ),
    "Framework Follow-On"
  );

  {
    const candidates = buildEngagementOpportunityCandidates({
      hasMonitoringProgram: false,
      openMonitoringFindingsCount: 4,
      inRemediationCount: 1,
      criticalFindingsCount: 2,
      selectedFrameworks: ["SOC 2", "HIPAA"],
      completedAuditCount: 1
    });

    assert.deepEqual(
      candidates.map((candidate) => candidate.category),
      [
        EngagementOpportunityCategory.ONGOING_MONITORING,
        EngagementOpportunityCategory.REMEDIATION_SUPPORT,
        EngagementOpportunityCategory.ADVISORY_ADD_ON,
        EngagementOpportunityCategory.FRAMEWORK_FOLLOW_ON,
        EngagementOpportunityCategory.PERIODIC_REASSESSMENT
      ]
    );
  }

  {
    const candidates = buildEngagementOpportunityCandidates({
      hasMonitoringProgram: true,
      openMonitoringFindingsCount: 0,
      inRemediationCount: 0,
      criticalFindingsCount: 0,
      selectedFrameworks: ["SOC 2"],
      completedAuditCount: 0
    });

    assert.equal(candidates.length, 0);
  }

  console.log("engagement-programs tests passed");
}

runEngagementProgramTests();
