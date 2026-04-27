import assert from "node:assert/strict";
import { AssessmentStatus, JobStatus, ReportStatus } from "@evolve-edge/db";
import {
  cleanupExpiredComplianceData,
  getComplianceRetentionCutoffs,
} from "../lib/data-retention";
import {
  clearWorkflowTrace,
  failWorkflowTrace,
  startWorkflowTrace,
} from "../src/server/ai/observability/workflow-tracker";

async function runDataRetentionTests() {
  const now = new Date("2026-06-24T12:00:00.000Z");
  const cutoffs = getComplianceRetentionCutoffs(
    {
      reportsDays: 365,
      assessmentsDays: 365,
      auditLogsDays: 90,
      workflowTracesDays: 30,
    },
    now
  );

  assert.equal(cutoffs.reportsBefore.toISOString(), "2025-06-24T12:00:00.000Z");
  assert.equal(cutoffs.auditLogsBefore.toISOString(), "2026-03-26T12:00:00.000Z");

  clearWorkflowTrace("wd_old");
  clearWorkflowTrace("wd_new");
  startWorkflowTrace({
    workflowDispatchId: "wd_old",
    dispatchId: "disp_old",
    assessmentId: "asm_old",
    orgId: "org_old",
  });
  failWorkflowTrace({
    workflowDispatchId: "wd_old",
    error: "old trace",
  });
  startWorkflowTrace({
    workflowDispatchId: "wd_new",
    dispatchId: "disp_new",
    assessmentId: "asm_new",
    orgId: "org_new",
  });

  const deletedWhere: Record<string, unknown>[] = [];
  const db = {
    report: {
      async deleteMany(input: Record<string, unknown>) {
        deletedWhere.push({ report: input.where });
        assert.deepEqual((input.where as any).status.in, [
          ReportStatus.DELIVERED,
          ReportStatus.SUPERSEDED,
          ReportStatus.FAILED,
        ]);
        return { count: 2 };
      },
    },
    assessment: {
      async deleteMany(input: Record<string, unknown>) {
        deletedWhere.push({ assessment: input.where });
        assert.deepEqual((input.where as any).status.in, [AssessmentStatus.ARCHIVED]);
        return { count: 1 };
      },
    },
    auditLog: {
      async deleteMany(input: Record<string, unknown>) {
        deletedWhere.push({ auditLog: input.where });
        return { count: 3 };
      },
    },
    auditWorkflowCheckpoint: {
      async deleteMany(input: Record<string, unknown>) {
        deletedWhere.push({ checkpoint: input.where });
        return { count: 4 };
      },
    },
    analysisJob: {
      async deleteMany(input: Record<string, unknown>) {
        deletedWhere.push({ analysisJob: input.where });
        assert.deepEqual((input.where as any).status.in, [
          JobStatus.SUCCEEDED,
          JobStatus.FAILED,
          JobStatus.CANCELED,
        ]);
        return { count: 5 };
      },
    },
  };

  const result = await cleanupExpiredComplianceData({
    db: db as never,
    now,
    policy: {
      reportsDays: 365,
      assessmentsDays: 365,
      auditLogsDays: 90,
      workflowTracesDays: 30,
    },
  });

  assert.equal(result.deleted.reports, 2);
  assert.equal(result.deleted.assessments, 1);
  assert.equal(result.deleted.auditLogs, 3);
  assert.equal(result.deleted.workflowCheckpoints, 4);
  assert.equal(result.deleted.analysisJobs, 5);
  assert.equal(result.deleted.inMemoryWorkflowTraces, 2);
  assert.equal(deletedWhere.length, 5);

  clearWorkflowTrace("wd_old");
  clearWorkflowTrace("wd_new");
  console.log("data-retention tests passed");
}

void runDataRetentionTests();
