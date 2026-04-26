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
  getOrganizationReportPackages,
  getReportExecutiveDeliveryPackage,
  markReportPackageSent,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  upsertExecutiveDeliveryPackageForReport
} from "../lib/executive-delivery";
import { CommercialPlanCode } from "@evolve-edge/db";
import { buildExecutiveBriefingOutput } from "../lib/executive-briefing";

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
      executiveBriefingAvailable: true,
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
    assert.equal(packet.executiveBriefingAvailable, true);
  }

  {
    const scaleBriefing = buildExecutiveBriefingOutput({
      reportId: "rpt_123",
      reportTitle: "Executive Delivery Packet",
      assessmentName: "April 2026 Audit",
      versionLabel: "v1.0",
      planCode: CommercialPlanCode.SCALE,
      reportJson: {
        executiveSummary: "Leadership should focus on privileged access and vendor oversight.",
        postureScore: 68,
        riskLevel: "HIGH",
        findings: [
          {
            title: "Privileged access review is informal",
            severity: "HIGH",
            summary: "Admin permissions are not reviewed on a recurring schedule.",
            businessImpact: "Unreviewed privileged access increases operational and audit exposure."
          },
          {
            title: "Vendor due diligence is incomplete",
            severity: "MODERATE",
            summary: "Critical vendors are not reassessed consistently."
          }
        ],
        roadmap: [
          {
            title: "Formalize privileged access review",
            timeline: "30 days"
          }
        ]
      }
    }) as Record<string, unknown>;

    const starterBriefing = buildExecutiveBriefingOutput({
      reportId: "rpt_123",
      reportTitle: "Executive Delivery Packet",
      assessmentName: "April 2026 Audit",
      versionLabel: "v1.0",
      planCode: CommercialPlanCode.STARTER,
      reportJson: {}
    });

    assert.equal(scaleBriefing.planTier, "scale");
    assert.equal(Array.isArray(scaleBriefing.talkingPoints), true);
    assert.equal(Array.isArray((scaleBriefing.summary as Record<string, unknown>).keyRisks), true);
    assert.equal(starterBriefing, null);
  }

  {
    let findManyArgs: Record<string, unknown> | null = null;
    await getOrganizationReportPackages("org_123", {
      limit: 5,
      db: {
        reportPackage: {
          findMany: async (args: Record<string, unknown>) => {
            findManyArgs = args;
            return [];
          }
        }
      } as any
    });

    assert.ok(findManyArgs);
    const versionsSelection = ((findManyArgs as any).include.versions.select ?? {}) as Record<
      string,
      unknown
    >;
    assert.equal(versionsSelection.id, true);
    assert.equal(versionsSelection.reportId, true);
    assert.equal(versionsSelection.versionNumber, true);
    assert.equal(versionsSelection.createdAt, true);
    assert.equal(
      (((versionsSelection.report as Record<string, unknown>).select as Record<string, unknown>)
        .versionLabel),
      true
    );
  }

  {
    let findFirstArgs: Record<string, unknown> | null = null;
    await getReportExecutiveDeliveryPackage("rpt_123", {
      reportPackage: {
        findFirst: async (args: Record<string, unknown>) => {
          findFirstArgs = args;
          return null;
        }
      }
    } as any);

    assert.ok(findFirstArgs);
    const versionsSelection = ((findFirstArgs as any).include.versions.select ?? {}) as Record<
      string,
      unknown
    >;
    assert.equal(versionsSelection.id, true);
    assert.equal(versionsSelection.reportId, true);
    assert.equal(versionsSelection.versionNumber, true);
    assert.equal(
      (((versionsSelection.report as Record<string, unknown>).select as Record<string, unknown>)
        .status),
      true
    );
  }

  {
    let createdVersionData: Record<string, unknown> | null = null;
    await upsertExecutiveDeliveryPackageForReport({
      reportId: "rpt_123",
      actorUserId: "usr_123",
      db: {
        report: {
          findUnique: async () => ({
            id: "rpt_123",
            organizationId: "org_123",
            assessmentId: "asm_123",
            selectedPlan: CommercialPlanCode.ENTERPRISE,
            createdByUserId: "usr_123",
            title: "Enterprise Audit Report",
            versionLabel: "v2.0",
            reportJson: {
              executiveSummary: "Leadership should sequence remediation around access and vendor controls.",
              postureScore: 59,
              riskLevel: "HIGH",
              findings: [
                {
                  title: "Access review gap",
                  severity: "HIGH",
                  summary: "Administrative access is not reviewed frequently enough.",
                  businessImpact: "This increases breach impact and customer diligence friction."
                }
              ],
              roadmap: [
                {
                  title: "Launch quarterly access review",
                  timeline: "30 days",
                  priority: "P1",
                  ownerRole: "Security Lead",
                  effort: "Medium"
                }
              ]
            },
            assessment: {
              id: "asm_123",
              name: "Enterprise Assessment",
              organization: {
                frameworkSelections: [
                  {
                    framework: {
                      code: "SOC2",
                      name: "SOC 2",
                      version: "2017",
                      category: "Security"
                    }
                  }
                ]
              }
            }
          }),
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "rpt_123",
            ...data
          })
        },
        reportPackage: {
          findUnique: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "pkg_123",
            organizationId: "org_123",
            assessmentId: "asm_123",
            ...data
          })
        },
        reportPackageVersion: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdVersionData = data;
            return {
              id: "pkg_ver_123",
              ...data
            };
          }
        },
        domainEvent: {
          upsert: async () => ({ id: "evt_123" })
        },
        deliveryStateRecord: {
          findFirst: async () => null
        },
        customerRun: {
          findFirst: async () => null
        }
      } as any
    });

    assert.ok(createdVersionData);
    const briefingVersionData = createdVersionData as Record<string, unknown>;

    assert.equal(briefingVersionData.reportId, "rpt_123");
    assert.equal(Boolean(briefingVersionData.packetJson), true);
    const packetJson = briefingVersionData.packetJson as Record<string, unknown>;
    assert.equal(
      Boolean(
        packetJson.executiveBriefing &&
          typeof packetJson.executiveBriefing === "object"
      ),
      true
    );
    assert.equal(
      (packetJson.executiveBriefing as Record<string, unknown>).formatVersion,
      "executive-briefing.v1"
    );
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
        upsert: async () => ({ id: "evt_sent" })
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
