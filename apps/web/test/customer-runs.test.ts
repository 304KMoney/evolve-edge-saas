import assert from "node:assert/strict";
import { prisma } from "@evolve-edge/db";
import {
  applyAnalysisFailureToSteps,
  applyCrmSyncResultToSteps,
  applyDeliveryCompletedToSteps,
  applyQueuedForAnalysisToSteps,
  applyReportGeneratedToSteps,
  buildAuditWorkflowProgress,
  createInitialCustomerRunSteps,
  getAuditWorkflowProgressPresentation,
  parseAuditWorkflowProgress,
  retryCustomerRun,
  summarizeCustomerRun
} from "../lib/customer-runs";

async function runCustomerRunTests() {
  {
    const steps = applyQueuedForAnalysisToSteps(createInitialCustomerRunSteps());
    const summary = summarizeCustomerRun(steps);

    assert.equal(steps.intake.status, "completed");
    assert.equal(steps.analysis.status, "running");
    assert.equal(summary.status, "RUNNING");
    assert.equal(summary.currentStep, "ANALYSIS");
  }

  {
    const steps = applyAnalysisFailureToSteps(
      applyQueuedForAnalysisToSteps(createInitialCustomerRunSteps()),
      "Dify timed out"
    );
    const summary = summarizeCustomerRun(steps);

    assert.equal(steps.analysis.status, "failed");
    assert.equal(summary.status, "ACTION_REQUIRED");
    assert.equal(summary.currentStep, "ANALYSIS");
    assert.match(summary.recoveryHint ?? "", /Requeue the analysis job/i);
    assert.equal(summary.lastError, "Dify timed out");
  }

  {
    const steps = applyReportGeneratedToSteps(
      applyQueuedForAnalysisToSteps(createInitialCustomerRunSteps())
    );
    const summary = summarizeCustomerRun(steps);

    assert.equal(steps.reportGeneration.status, "completed");
    assert.equal(steps.crmSync.status, "running");
    assert.equal(summary.currentStep, "CRM_SYNC");
  }

  {
    const steps = applyCrmSyncResultToSteps(
      applyReportGeneratedToSteps(
        applyQueuedForAnalysisToSteps(createInitialCustomerRunSteps())
      ),
      true
    );
    const summary = summarizeCustomerRun(steps);

    assert.equal(steps.crmSync.status, "completed");
    assert.equal(steps.delivery.status, "running");
    assert.equal(summary.status, "RUNNING");
    assert.equal(summary.currentStep, "DELIVERY");
  }

  {
    const steps = applyDeliveryCompletedToSteps(
      applyCrmSyncResultToSteps(
        applyReportGeneratedToSteps(
          applyQueuedForAnalysisToSteps(createInitialCustomerRunSteps())
        ),
        true
      )
    );
    const summary = summarizeCustomerRun(steps);

    assert.equal(steps.delivery.status, "completed");
    assert.equal(summary.status, "COMPLETED");
    assert.equal(summary.currentStep, "DELIVERY");
    assert.ok(summary.completedAt instanceof Date);
  }

  {
    const progress = buildAuditWorkflowProgress({
      status: "mapping_frameworks",
      workflowDispatchId: "wd_123",
      dispatchId: "disp_123"
    });
    const parsed = parseAuditWorkflowProgress(progress);

    assert.equal(parsed?.status, "mapping_frameworks");
    assert.equal(parsed?.workflowDispatchId, "wd_123");
    assert.equal(parsed?.dispatchId, "disp_123");
    assert.equal(parsed?.progressPercent, 34);
  }

  {
    const presentation = getAuditWorkflowProgressPresentation("pending_review");
    assert.match(presentation.label, /Pending Review/i);
    assert.equal(presentation.progressPercent, 97);
  }

  {
    const originalFindFirst = (prisma.customerRun as any).findFirst;
    let findFirstCalls = 0;

    (prisma.customerRun as any).findFirst = async () => {
      findFirstCalls += 1;
      return null;
    };

    try {
      await assert.rejects(
        () =>
          retryCustomerRun("run_cross_tenant", {
            organizationId: "org_expected",
            actorEmail: "admin@evolveedge.ai"
          }),
        /Customer run not found/
      );
    } finally {
      (prisma.customerRun as any).findFirst = originalFindFirst;
    }

    assert.equal(findFirstCalls, 1);
  }

  console.log("customer-runs tests passed");
}

void runCustomerRunTests();
