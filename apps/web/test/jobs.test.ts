import assert from "node:assert/strict";
import { getScheduledJobNames } from "../lib/jobs";

function runJobsTests() {
  const jobNames = getScheduledJobNames();

  assert.ok(
    jobNames.includes("dispatch-workflow-dispatches"),
    "scheduled jobs must process app-owned workflow dispatches queued after paid checkout"
  );
  assert.ok(
    jobNames.indexOf("dispatch-workflow-dispatches") <
      jobNames.indexOf("dispatch-email-notifications"),
    "workflow dispatch should run before notification dispatch in all-jobs runs"
  );

  console.log("jobs tests passed");
}

runJobsTests();
