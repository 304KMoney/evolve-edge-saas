import assert from "node:assert/strict";
import {
  buildBriefingPacketSnapshot,
  buildExecutiveSummarySnapshot,
  buildFrameworkSummarySnapshot,
  buildRoadmapSummarySnapshot,
  canTransitionReportPackage,
  evaluateFounderReviewRequirement,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus
} from "../lib/executive-delivery";

function runExecutiveDeliveryTests() {
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

  console.log("executive-delivery tests passed");
}

runExecutiveDeliveryTests();
