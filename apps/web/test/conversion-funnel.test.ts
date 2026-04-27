import assert from "node:assert/strict";
import {
  calculateWeightedProgress,
  getAssessmentIntakeProgress,
  getPostBillingNextAction,
  getWorkspaceLaunchProgress
} from "../lib/conversion-funnel";

function runConversionFunnelTests() {
  {
    assert.equal(
      calculateWeightedProgress(["not_started", "in_progress", "completed"]),
      63
    );
  }

  {
    const summary = getAssessmentIntakeProgress([
      { title: "Company Profile", status: "completed" },
      { title: "AI Usage Inventory", status: "in_progress" },
      { title: "Data Handling", status: "not_started" }
    ]);

    assert.equal(summary.completedSections, 1);
    assert.equal(summary.totalSections, 3);
    assert.equal(summary.nextSectionTitle, "AI Usage Inventory");
    assert.equal(summary.isReadyForSubmission, true);
    assert.match(summary.helperText, /AI Usage Inventory/i);
  }

  {
    const summary = getAssessmentIntakeProgress([
      { title: "Company Profile", status: "in_progress" },
      { title: "AI Usage Inventory", status: "not_started" }
    ]);

    assert.equal(summary.isReadyForSubmission, false);
  }

  {
    const summary = getAssessmentIntakeProgress([
      {
        title: "Company Profile",
        status: "in_progress",
        responses: { notes: "" }
      },
      { title: "AI Usage Inventory", status: "not_started" }
    ]);

    assert.equal(summary.isReadyForSubmission, true);
  }

  {
    const progress = getWorkspaceLaunchProgress({
      selectedPlanName: "Growth Annual",
      firstAssessmentName: "Initial AI Governance Assessment"
    });

    assert.equal(progress.steps[0]?.tone, "completed");
    assert.equal(progress.steps[2]?.tone, "upcoming");
    assert.ok(progress.progressPercent >= 50);
  }

  {
    const nextAction = getPostBillingNextAction({
      assessmentsCount: 0,
      reportsCount: 0,
      canGenerateReports: true
    });

    assert.equal(nextAction.href, "/dashboard/assessments");
    assert.match(nextAction.helperText, /paid customers/i);
  }

  {
    const nextAction = getPostBillingNextAction({
      assessmentsCount: 2,
      reportsCount: 0,
      canGenerateReports: false
    });

    assert.equal(nextAction.href, "/dashboard/assessments");
    assert.equal(nextAction.label, "Continue intake");
  }

  console.log("conversion-funnel tests passed");
}

runConversionFunnelTests();
