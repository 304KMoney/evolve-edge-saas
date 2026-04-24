import assert from "node:assert/strict";
import {
  approveReportPackageQa,
  buildReportPackageSendBlockedFinding,
  buildBriefingPacketSnapshot,
  buildExecutiveSummarySnapshot,
  buildFrameworkSummarySnapshot,
  buildRoadmapSummarySnapshot,
  canTransitionReportPackage,
  evaluateFounderReviewRequirement,
  markReportPackageSent,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus
} from "../lib/executive-delivery";

async function runExecutiveDeliveryTests() {
  {
    const executiveSummary = buildExecutiveSummarySnapshot({
      reportTitle: "SOC 2 Readiness Report",
      assessmentName: "April 2026 Audit",
      reportJson: {
        executiveSummary: "Leadership can reduce exposure fastest by closing access control gaps.",
        postureScore: 54,
        riskLevel: "HIGH",
        findings: [
          {
            title: "Privileged access review is informal",
            severity: "CRITICAL",
            summary: "Admin permissions are not reviewed on a recurring schedule.",
            riskDomain: "Access Control"
          }
        ],
        roadmap: [
          {
            title: "Formalize privileged access review",
            priority: "P1",
            ownerRole: "Security Lead",
            timeline: "30 days"
          }
        ]
      }
    });

    assert.equal(executiveSummary.headline, "SOC 2 Readiness Report");
    assert.equal(executiveSummary.riskLevel, "HIGH");
    assert.equal(executiveSummary.postureScore, 54);
    assert.equal(
      Array.isArray(executiveSummary.topFindings) ? executiveSummary.topFindings.length : 0,
      1
    );
  }

  {
    const roadmapSummary = buildRoadmapSummarySnapshot({
      reportJson: {
        roadmap: [
          { title: "Close MFA gaps", priority: "P1", ownerRole: "IT", timeline: "14 days", effort: "Medium" },
          { title: "Document vendor reviews", priority: "P2", ownerRole: "Compliance", timeline: "30 days", effort: "Low" }
        ]
      }
    });
    const frameworkSummary = buildFrameworkSummarySnapshot({
      frameworks: [
        { code: "SOC2", name: "SOC 2", version: "2017", category: "Security" },
        { code: "HIPAA", name: "HIPAA", version: null, category: "Privacy" }
      ],
      reportJson: {
        findings: [{ impactedFrameworks: ["SOC 2", "HIPAA", "SOC 2"] }]
      }
    });
    const packet = buildBriefingPacketSnapshot({
      reportId: "rpt_123",
      reportTitle: "Executive Delivery Packet",
      versionLabel: "v1.0",
      executiveSummary: {
        headline: "Executive Delivery Packet"
      },
      roadmapSummary,
      frameworkSummary,
      reportJson: {
        postureScore: 77,
        riskLevel: "MEDIUM",
        sectionSummaries: [{ title: "Access Controls" }]
      }
    });

    assert.equal(roadmapSummary.totalActions, 2);
    assert.equal(
      Array.isArray(frameworkSummary.frameworksAssessed)
        ? frameworkSummary.frameworksAssessed.length
        : 0,
      2
    );
    assert.equal(packet.reportId, "rpt_123");
    assert.equal(packet.versionLabel, "v1.0");
  }

  {
    const founderReview = evaluateFounderReviewRequirement({
      reportJson: {
        postureScore: 52,
        riskLevel: "HIGH",
        findings: [{ severity: "HIGH" }, { severity: "HIGH" }, { severity: "HIGH" }]
      }
    });

    assert.equal(founderReview.requiresFounderReview, true);
    assert.match(founderReview.reason ?? "", /founder/i);
  }

  {
    const canSendWithoutFounderReview = canTransitionReportPackage({
      deliveryStatus: ReportPackageDeliveryStatus.REVIEWED,
      qaStatus: ReportPackageQaStatus.APPROVED,
      requiresFounderReview: false,
      founderReviewedAt: null,
      action: "send"
    });
    const cannotSendBeforeQa = canTransitionReportPackage({
      deliveryStatus: ReportPackageDeliveryStatus.GENERATED,
      qaStatus: ReportPackageQaStatus.PENDING,
      requiresFounderReview: false,
      founderReviewedAt: null,
      action: "send"
    });
    const cannotSendBeforeFounderReview = canTransitionReportPackage({
      deliveryStatus: ReportPackageDeliveryStatus.REVIEWED,
      qaStatus: ReportPackageQaStatus.APPROVED,
      requiresFounderReview: true,
      founderReviewedAt: null,
      action: "send"
    });
    const canCompleteBriefing = canTransitionReportPackage({
      deliveryStatus: ReportPackageDeliveryStatus.BRIEFING_BOOKED,
      qaStatus: ReportPackageQaStatus.APPROVED,
      requiresFounderReview: true,
      founderReviewedAt: new Date("2026-04-10T12:00:00.000Z"),
      action: "complete_briefing"
    });

    assert.equal(canSendWithoutFounderReview, true);
    assert.equal(cannotSendBeforeQa, false);
    assert.equal(cannotSendBeforeFounderReview, false);
    assert.equal(canCompleteBriefing, true);
  }

  {
    const blocked = buildReportPackageSendBlockedFinding({
      deliveryStatus: ReportPackageDeliveryStatus.REVIEWED,
      qaStatus: ReportPackageQaStatus.PENDING,
      requiresFounderReview: true,
      founderReviewedAt: null
    });

    assert.deepEqual(blocked.blockers, [
      "qa_not_approved",
      "founder_review_pending"
    ]);
    assert.match(blocked.summary, /attempted to send/i);
  }

  {
    let updateCalled = false;
    const db = {
      reportPackage: {
        findFirst: async () => null,
        update: async () => {
          updateCalled = true;
          throw new Error("should not update");
        }
      }
    } as any;

    await assert.rejects(
      () =>
        approveReportPackageQa({
          packageId: "pkg_cross_tenant",
          organizationId: "org_expected",
          actorUserId: "usr_admin",
          db
        }),
      /Executive delivery package not found/
    );

    assert.equal(updateCalled, false);
  }

  {
    let updatedReportStatus: string | null = null;
    const db = {
      reportPackage: {
        findFirst: async () => ({
          id: "pkg_sendable",
          organizationId: "org_123",
          assessmentId: "asm_123",
          latestReportId: "rpt_123",
          latestReport: {
            id: "rpt_123",
            reportJson: {}
          },
          deliveryStatus: ReportPackageDeliveryStatus.REVIEWED,
          qaStatus: ReportPackageQaStatus.APPROVED,
          requiresFounderReview: false,
          founderReviewedAt: null
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "pkg_sendable",
          organizationId: "org_123",
          assessmentId: "asm_123",
          ...data
        })
      },
      report: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updatedReportStatus = String(data.status ?? "");
          return {
            id: "rpt_123",
            ...data
          };
        }
      },
      domainEvent: {
        create: async () => ({ id: "evt_sent" })
      },
      deliveryStateRecord: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async () => ({ id: "ds_123" }),
        update: async () => ({ id: "ds_123" })
      },
      deliveryStateTransition: {
        create: async () => ({ id: "dst_123" })
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

    const sent = await markReportPackageSent({
      packageId: "pkg_sendable",
      organizationId: "org_123",
      actorUserId: "usr_123",
      notes: "Deliver to customer",
      db
    });

    assert.equal(sent.deliveryStatus, ReportPackageDeliveryStatus.SENT);
    assert.equal(updatedReportStatus, "DELIVERED");
  }

  console.log("executive-delivery tests passed");
}

void runExecutiveDeliveryTests();
