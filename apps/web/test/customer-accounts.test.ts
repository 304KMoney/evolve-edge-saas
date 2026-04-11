import assert from "node:assert/strict";
import {
  buildCustomerAccountDedupeKey,
  formatCustomerAccountQueueLabel,
  getLaterCustomerLifecycleStage,
  resolveSuggestedCustomerLifecycleStage
} from "../lib/customer-accounts";
import {
  CustomerLifecycleStage,
  LeadSubmissionStatus,
  ProvisioningStatus
} from "@evolve-edge/db";

function runCustomerAccountTests() {
  {
    const dedupeKey = buildCustomerAccountDedupeKey({
      email: "Founder@Example.com ",
      companyName: " Acme Risk Partners "
    });

    assert.equal(dedupeKey, "founder@example.com:acme-risk-partners");
  }

  {
    const nextStage = resolveSuggestedCustomerLifecycleStage({
      leadStage: LeadSubmissionStatus.CAPTURED
    });

    assert.equal(nextStage, CustomerLifecycleStage.LEAD);
  }

  {
    const nextStage = resolveSuggestedCustomerLifecycleStage({
      leadStage: LeadSubmissionStatus.CONVERTED,
      provisioningStatus: ProvisioningStatus.PROVISIONED
    });

    assert.equal(nextStage, CustomerLifecycleStage.WON);
  }

  {
    const nextStage = resolveSuggestedCustomerLifecycleStage({
      currentStage: CustomerLifecycleStage.WON,
      organizationExists: true,
      hasAssessment: true,
      intakeComplete: true,
      auditProcessing: true
    });

    assert.equal(nextStage, CustomerLifecycleStage.AUDIT_PROCESSING);
  }

  {
    const nextStage = resolveSuggestedCustomerLifecycleStage({
      currentStage: CustomerLifecycleStage.BRIEFING_SCHEDULED,
      organizationExists: true,
      reportReady: true
    });

    assert.equal(nextStage, CustomerLifecycleStage.BRIEFING_SCHEDULED);
  }

  {
    const laterStage = getLaterCustomerLifecycleStage(
      CustomerLifecycleStage.PROPOSAL_SENT,
      CustomerLifecycleStage.INTAKE_PENDING
    );

    assert.equal(laterStage, CustomerLifecycleStage.INTAKE_PENDING);
  }

  {
    assert.equal(formatCustomerAccountQueueLabel("founder_review"), "Founder review");
    assert.equal(formatCustomerAccountQueueLabel("action_required"), "Action required");
  }

  console.log("customer-accounts tests passed");
}

runCustomerAccountTests();
