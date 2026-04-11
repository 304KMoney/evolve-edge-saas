import assert from "node:assert/strict";
import {
  applyAnalysisFailureToSteps,
  applyCrmSyncResultToSteps,
  applyDeliveryCompletedToSteps,
  applyQueuedForAnalysisToSteps,
  applyReportGeneratedToSteps,
  createInitialCustomerRunSteps,
  summarizeCustomerRun
} from "../lib/customer-runs";

function runCustomerRunTests() {
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

  console.log("customer-runs tests passed");
}

runCustomerRunTests();
