import assert from "node:assert/strict";
import {
  AssessmentStatus,
  JobStatus,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  ReportStatus
} from "@evolve-edge/db";
import { queueReportRegeneration } from "../lib/report-review";
import { AI_WORKFLOW_FEEDBACK_TYPES } from "../src/server/ai/feedback";
import {
  approveReportPackageQa,
  requestReportPackageChanges,
  saveReportPackageReviewNotes
} from "../lib/executive-delivery";

async function runReportReviewTests() {
  {
    const db = {
      reportPackage: {
        findFirst: async () => ({
          id: "pkg_123",
          organizationId: "org_123",
          assessmentId: "asm_123",
          latestReportId: "rpt_123",
          latestReport: {
            id: "rpt_123",
            reportJson: {
              workflowMetadata: {
                workflowDispatchId: "wd_123"
              }
            }
          },
          deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
          qaStatus: ReportPackageQaStatus.PENDING,
          requiresFounderReview: false,
          founderReviewedAt: null
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "pkg_123",
          organizationId: "org_123",
          assessmentId: "asm_123",
          ...data
        })
      },
      report: {
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "rpt_123",
          ...data
        })
      },
      domainEvent: {
        create: async () => ({ id: "evt_123" })
      },
      aiWorkflowFeedback: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "fb_123",
          ...data
        }),
        count: async () => 1
      },
      customerRun: {
        findFirst: async () => ({
          id: "run_123",
          contextJson: null,
          stepsJson: {},
          reportId: "rpt_123"
        }),
        findUnique: async () => ({
          id: "run_123",
          contextJson: null,
          stepsJson: {},
          reportId: "rpt_123"
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "run_123",
          ...data
        })
      },
      notification: {
        create: async () => ({ id: "ntf_123" })
      }
    } as any;

    const approved = await approveReportPackageQa({
      packageId: "pkg_123",
      organizationId: "org_123",
      actorUserId: "usr_123",
      notes: "Looks client-ready.",
      db
    });

    assert.equal(approved.qaStatus, ReportPackageQaStatus.APPROVED);
    assert.equal(approved.deliveryStatus, ReportPackageDeliveryStatus.REVIEWED);
  }

  {
    const db = {
      reportPackage: {
        findFirst: async () => ({
          id: "pkg_123",
          organizationId: "org_123",
          assessmentId: "asm_123",
          latestReportId: "rpt_123",
          latestReport: {
            id: "rpt_123",
            reportJson: {
              workflowMetadata: {
                workflowDispatchId: "wd_123"
              }
            }
          },
          deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
          qaStatus: ReportPackageQaStatus.PENDING,
          requiresFounderReview: false,
          founderReviewedAt: null
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "pkg_123",
          organizationId: "org_123",
          assessmentId: "asm_123",
          ...data
        })
      },
      report: {
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "rpt_123",
          ...data
        })
      },
      domainEvent: {
        create: async () => ({ id: "evt_123" })
      },
      aiWorkflowFeedback: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "fb_123",
          feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.REJECTED,
          ...data
        }),
        count: async () => 1
      },
      customerRun: {
        findFirst: async () => ({
          id: "run_123",
          contextJson: null,
          stepsJson: {},
          reportId: "rpt_123"
        }),
        findUnique: async () => ({
          id: "run_123",
          contextJson: null,
          stepsJson: {},
          reportId: "rpt_123"
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "run_123",
          ...data
        })
      },
      notification: {
        create: async () => ({ id: "ntf_123" })
      }
    } as any;

    const rejected = await requestReportPackageChanges({
      packageId: "pkg_123",
      organizationId: "org_123",
      actorUserId: "usr_123",
      notes: "Needs tighter remediation detail.",
      db
    });

    assert.equal(rejected.qaStatus, ReportPackageQaStatus.CHANGES_REQUESTED);
    assert.equal(rejected.deliveryStatus, ReportPackageDeliveryStatus.GENERATED);
  }

  {
    const saved = await saveReportPackageReviewNotes({
      packageId: "pkg_123",
      organizationId: "org_123",
      actorUserId: "usr_123",
      notes: "Keep this internal note only.",
      db: {
        reportPackage: {
          findFirst: async () => ({
            id: "pkg_123",
            organizationId: "org_123",
            assessmentId: "asm_123",
            latestReportId: "rpt_123",
            latestReport: {
              id: "rpt_123",
              reportJson: {
                workflowMetadata: {
                  workflowDispatchId: "wd_123"
                }
              }
            }
          }),
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "pkg_123",
            organizationId: "org_123",
            assessmentId: "asm_123",
            ...data
          })
        },
        domainEvent: {
          create: async () => ({ id: "evt_123" })
        },
        aiWorkflowFeedback: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "fb_123",
            feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.EDITED,
            ...data
          }),
          count: async () => 1
        },
        notification: {
          create: async () => ({ id: "ntf_123" })
        }
      } as any
    });

    assert.equal(saved.qaNotes, "Keep this internal note only.");
  }

  {
    let queuedForAnalysisAssessmentId: string | null = null;
    const queuedJob = await queueReportRegeneration({
      reportId: "rpt_123",
      organizationId: "org_123",
      actorUserId: "usr_123",
      notes: "Please regenerate after reviewer comments.",
      db: {
        report: {
          findFirst: async () => ({
            id: "rpt_123",
            organizationId: "org_123",
            assessmentId: "asm_123",
            status: ReportStatus.PENDING_REVIEW,
            latestInReportPackages: [
              {
                id: "pkg_123",
                qaNotes: null
              }
            ],
            assessment: {
              id: "asm_123",
              status: AssessmentStatus.REPORT_DRAFT_READY
            },
            reportJson: {
              workflowMetadata: {
                workflowDispatchId: "wd_older"
              }
            }
          }),
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "rpt_123",
            ...data
          })
        },
        analysisJob: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "job_123",
            ...data
          })
        },
        assessment: {
          update: async ({ where }: { where: { id: string } }) => {
            queuedForAnalysisAssessmentId = where.id;
            return {
              id: where.id,
              status: AssessmentStatus.ANALYSIS_QUEUED
            };
          }
        },
        reportPackage: {
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "pkg_123",
            ...data
          })
        },
        customerRun: {
          findFirst: async () => ({
            id: "run_123",
            stepsJson: {
              intake: { status: "completed", startedAt: null, completedAt: null, error: null },
              analysis: { status: "completed", startedAt: null, completedAt: null, error: null },
              reportGeneration: { status: "failed", startedAt: null, completedAt: null, error: "Rejected" },
              crmSync: { status: "pending", startedAt: null, completedAt: null, error: null },
              delivery: { status: "pending", startedAt: null, completedAt: null, error: null }
            },
            reportId: "rpt_123",
            contextJson: null,
            status: "ACTION_REQUIRED",
            currentStep: "REPORT_GENERATION"
          }),
          findUnique: async () => ({
            id: "run_123",
            stepsJson: {
              intake: { status: "completed", startedAt: null, completedAt: null, error: null },
              analysis: { status: "completed", startedAt: null, completedAt: null, error: null },
              reportGeneration: { status: "failed", startedAt: null, completedAt: null, error: "Rejected" },
              crmSync: { status: "pending", startedAt: null, completedAt: null, error: null },
              delivery: { status: "pending", startedAt: null, completedAt: null, error: null }
            },
            reportId: "rpt_123",
            contextJson: null
          }),
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "run_123",
            ...data
          })
        },
        aiWorkflowFeedback: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "fb_123",
            feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.REGENERATED,
            ...data
          }),
          count: async () => 1
        },
        notification: {
          create: async () => ({ id: "ntf_123" })
        }
      } as any
    });

    assert.equal(queuedJob.status, JobStatus.QUEUED);
    assert.equal(queuedForAnalysisAssessmentId, "asm_123");
    assert.match(String((queuedJob.inputPayload as Record<string, unknown>).workflowDispatchId), /regen/);
  }

  console.log("report-review tests passed");
}

void runReportReviewTests();
