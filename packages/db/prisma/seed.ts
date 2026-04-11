import {
  BillingAccessState,
  BillingInterval,
  BillingProvider,
  CanonicalPlanKey,
  CustomerAccountStageSource,
  CustomerAccountTimelineEntryType,
  CustomerLifecycleStage,
  CustomerRunStatus,
  CustomerRunStep,
  EvidenceAnnotationVisibility,
  EvidenceCategory,
  EvidenceProcessingStatus,
  EvidenceReviewStatus,
  EvidenceSource,
  EngagementCommercialModel,
  EngagementProgramStatus,
  EngagementProgramType,
  LeadSubmissionStatus,
  PlatformUserRole,
  PrismaClient,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  UserRole,
  SubscriptionStatus,
  AssessmentStatus,
  JobStatus,
  FindingSeverity,
  RecommendationPriority,
  ReportStatus,
  MonitoringCheckStatus,
  MonitoringFindingStatus,
  MonitoringFrameworkStatus,
  MonitoringSubscriptionStatus,
  ControlImplementationStatus,
  ControlScoreSource,
  FrameworkPostureStatus
} from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_LEAD_SCENARIOS, DEMO_SAMPLE_ORGANIZATIONS } from "../src/demo-catalog";
import { SUPPORTED_FRAMEWORK_CATALOG } from "../src/framework-catalog";
import { hashPassword } from "../src/security";
import { loadSeedEnvFromRepoRoot } from "./load-env";

loadSeedEnvFromRepoRoot();

const prisma = new PrismaClient();

const seedConfig = {
  planCode: process.env.SEED_PLAN_CODE ?? "scale-annual",
  planName: process.env.SEED_PLAN_NAME ?? "Scale Annual",
  ownerEmail:
    process.env.SEED_OWNER_EMAIL ??
    process.env.AUTH_ACCESS_EMAIL ??
    "owner@example.com",
  ownerFirstName: process.env.SEED_OWNER_FIRST_NAME ?? "Primary",
  ownerLastName: process.env.SEED_OWNER_LAST_NAME ?? "Owner",
  organizationName: process.env.SEED_ACCOUNT_NAME ?? "Primary Workspace",
  organizationSlug: process.env.SEED_ACCOUNT_SLUG ?? "primary-workspace",
  organizationIndustry:
    process.env.SEED_ACCOUNT_INDUSTRY ?? "AI Services",
  organizationSizeBand:
    process.env.SEED_ACCOUNT_SIZE_BAND ?? "11-50",
  organizationCountry: process.env.SEED_ACCOUNT_COUNTRY ?? "US"
};
const seedScenario = process.env.SEED_SCENARIO ?? "default";

function getDemoEvidenceStorageRoot() {
  return path.resolve(
    fileURLToPath(new URL("../../../apps/web/.data/evidence", import.meta.url))
  );
}

async function writeDemoEvidenceArtifact(storageKey: string, contents: string) {
  const root = getDemoEvidenceStorageRoot();
  const absolutePath = path.resolve(root, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

async function seedDemoCustomerAccounts(input: {
  primaryOrganizationId: string;
  primaryOrganizationName: string;
  primaryLeadSubmissionId: string;
  primaryUserId: string;
  secondaryOrganizationId: string;
  secondaryOrganizationName: string;
  secondaryLeadSubmissionId: string;
  secondaryUserId: string;
}) {
  const primaryLeadEmail = seedConfig.ownerEmail.toLowerCase();
  const secondaryLeadEmail = "operator@northbridge-payments.example";

  await prisma.leadSubmission.deleteMany({
    where: {
      normalizedEmail: {
        in: [
          primaryLeadEmail,
          secondaryLeadEmail,
          ...DEMO_LEAD_SCENARIOS.map((scenario) => scenario.email.toLowerCase())
        ]
      }
    }
  });

  const primaryLead = await prisma.leadSubmission.create({
    data: {
      id: input.primaryLeadSubmissionId,
      organizationId: input.primaryOrganizationId,
      userId: input.primaryUserId,
      email: seedConfig.ownerEmail,
      normalizedEmail: primaryLeadEmail,
      firstName: seedConfig.ownerFirstName,
      lastName: seedConfig.ownerLastName,
      companyName: input.primaryOrganizationName,
      jobTitle: "Chief Operating Officer",
      teamSize: "51-200",
      source: "demo-founder-tour",
      intent: "guided-demo",
      stage: LeadSubmissionStatus.CONVERTED,
      sourcePath: "/pricing",
      requestedPlanCode: seedConfig.planCode,
      pricingContext: "demo",
      payload: {
        source: "demo-founder-tour",
        companyName: input.primaryOrganizationName
      },
      dedupeKey: `demo:${primaryLeadEmail}:converted`
    }
  });

  const secondaryLead = await prisma.leadSubmission.create({
    data: {
      id: input.secondaryLeadSubmissionId,
      organizationId: input.secondaryOrganizationId,
      userId: input.secondaryUserId,
      email: secondaryLeadEmail,
      normalizedEmail: secondaryLeadEmail,
      firstName: "Jordan",
      lastName: "Lee",
      companyName: input.secondaryOrganizationName,
      jobTitle: "Security Program Manager",
      teamSize: "201-500",
      source: "demo-partner-referral",
      intent: "follow-on-program",
      stage: LeadSubmissionStatus.CONVERTED,
      sourcePath: "/contact-sales",
      requestedPlanCode: seedConfig.planCode,
      pricingContext: "demo",
      payload: {
        source: "demo-partner-referral",
        companyName: input.secondaryOrganizationName
      },
      dedupeKey: `demo:${secondaryLeadEmail}:converted`
    }
  });

  for (const scenario of DEMO_LEAD_SCENARIOS) {
    await prisma.leadSubmission.create({
      data: {
        email: scenario.email,
        normalizedEmail: scenario.email.toLowerCase(),
        firstName: scenario.firstName,
        lastName: scenario.lastName,
        companyName: scenario.companyName,
        jobTitle: "Decision maker",
        teamSize: "11-50",
        source: scenario.source,
        intent: scenario.intent,
        stage:
          scenario.lifecycleStage === "LEAD"
            ? LeadSubmissionStatus.CAPTURED
            : LeadSubmissionStatus.QUALIFIED,
        sourcePath: "/trust",
        requestedPlanCode: scenario.requestedPlanCode,
        pricingContext: "demo",
        payload: {
          stageSummary: scenario.stageSummary
        },
        dedupeKey: `demo:${scenario.email.toLowerCase()}:${scenario.lifecycleStage.toLowerCase()}`
      }
    });
  }

  const accountDefinitions = [
    {
      dedupeKey: `customer:${input.primaryOrganizationId}`,
      organizationId: input.primaryOrganizationId,
      primaryLeadSubmissionId: primaryLead.id,
      primaryContactEmail: seedConfig.ownerEmail,
      companyName: input.primaryOrganizationName,
      lifecycleStage: CustomerLifecycleStage.MONITORING_ACTIVE,
      nextActionLabel: "Quarterly stakeholder review",
      nextActionOwner: "Founder",
      nextActionDueAt: new Date("2026-05-20T15:00:00.000Z"),
      wonAt: new Date("2026-03-18T16:00:00.000Z"),
      briefingScheduledAt: new Date("2026-04-11T14:00:00.000Z"),
      monitoringActivatedAt: new Date("2026-04-12T09:00:00.000Z")
    },
    {
      dedupeKey: `customer:${input.secondaryOrganizationId}`,
      organizationId: input.secondaryOrganizationId,
      primaryLeadSubmissionId: secondaryLead.id,
      primaryContactEmail: secondaryLead.email,
      companyName: input.secondaryOrganizationName,
      lifecycleStage: CustomerLifecycleStage.REPORT_READY,
      nextActionLabel: "Prepare executive briefing",
      nextActionOwner: "Delivery Operator",
      nextActionDueAt: new Date("2026-04-15T11:00:00.000Z"),
      wonAt: new Date("2026-03-26T10:00:00.000Z"),
      briefingScheduledAt: null,
      monitoringActivatedAt: null
    },
    ...DEMO_LEAD_SCENARIOS.map((scenario) => ({
      dedupeKey: `lead:${scenario.key}`,
      organizationId: null,
      primaryLeadSubmissionId: null,
      primaryContactEmail: scenario.email,
      companyName: scenario.companyName,
      lifecycleStage: scenario.lifecycleStage as CustomerLifecycleStage,
      nextActionLabel:
        scenario.lifecycleStage === "LEAD"
          ? "Book qualification call"
          : scenario.lifecycleStage === "QUALIFIED"
            ? "Prepare tailored proposal"
            : "Follow up on proposal feedback",
      nextActionOwner: "Founder",
      nextActionDueAt: new Date("2026-04-14T16:00:00.000Z"),
      wonAt: null,
      briefingScheduledAt: null,
      monitoringActivatedAt: null
    }))
  ];

  for (const accountDefinition of accountDefinitions) {
    const account = await prisma.customerAccount.upsert({
      where: {
        dedupeKey: accountDefinition.dedupeKey
      },
      update: {
        organizationId: accountDefinition.organizationId,
        primaryLeadSubmissionId: accountDefinition.primaryLeadSubmissionId,
        primaryContactEmail: accountDefinition.primaryContactEmail,
        normalizedPrimaryContactEmail:
          accountDefinition.primaryContactEmail.toLowerCase(),
        companyName: accountDefinition.companyName,
        lifecycleStage: accountDefinition.lifecycleStage,
        stageSource: CustomerAccountStageSource.SYSTEM,
        stageUpdatedAt: new Date("2026-04-10T09:00:00.000Z"),
        lastSystemSyncedAt: new Date("2026-04-10T09:00:00.000Z"),
        wonAt: accountDefinition.wonAt,
        briefingScheduledAt: accountDefinition.briefingScheduledAt,
        monitoringActivatedAt: accountDefinition.monitoringActivatedAt,
        nextActionLabel: accountDefinition.nextActionLabel,
        nextActionOwner: accountDefinition.nextActionOwner,
        nextActionDueAt: accountDefinition.nextActionDueAt,
        metadata: {
          source: "demo-seed"
        }
      },
      create: {
        organizationId: accountDefinition.organizationId,
        primaryLeadSubmissionId: accountDefinition.primaryLeadSubmissionId,
        dedupeKey: accountDefinition.dedupeKey,
        primaryContactEmail: accountDefinition.primaryContactEmail,
        normalizedPrimaryContactEmail:
          accountDefinition.primaryContactEmail.toLowerCase(),
        companyName: accountDefinition.companyName,
        lifecycleStage: accountDefinition.lifecycleStage,
        stageSource: CustomerAccountStageSource.SYSTEM,
        stageUpdatedAt: new Date("2026-04-10T09:00:00.000Z"),
        lastSystemSyncedAt: new Date("2026-04-10T09:00:00.000Z"),
        wonAt: accountDefinition.wonAt,
        briefingScheduledAt: accountDefinition.briefingScheduledAt,
        monitoringActivatedAt: accountDefinition.monitoringActivatedAt,
        nextActionLabel: accountDefinition.nextActionLabel,
        nextActionOwner: accountDefinition.nextActionOwner,
        nextActionDueAt: accountDefinition.nextActionDueAt,
        metadata: {
          source: "demo-seed"
        }
      }
    });

    await prisma.customerAccountTimelineEntry.deleteMany({
      where: {
        customerAccountId: account.id
      }
    });

    await prisma.customerAccountTimelineEntry.create({
      data: {
        customerAccountId: account.id,
        organizationId: account.organizationId,
        actorUserId:
          account.organizationId === input.primaryOrganizationId
            ? input.primaryUserId
            : account.organizationId === input.secondaryOrganizationId
              ? input.secondaryUserId
              : null,
        entryType: CustomerAccountTimelineEntryType.STATUS_CHANGED,
        actorLabel: "demo-seed",
        title: `Lifecycle seeded as ${account.lifecycleStage.replaceAll("_", " ").toLowerCase()}`,
        body: "Deterministic demo lifecycle data was created for sales and investor presentations."
      }
    });
  }
}

async function seedDemoPresentationData(input: {
  planId: string;
  primaryUserId: string;
  primaryOrganizationId: string;
  primaryOrganizationName: string;
  primaryAssessmentId: string;
  primaryReportId: string;
  primaryMonitoringSubscriptionId: string;
}) {
  const secondaryOrganizationDefinition = DEMO_SAMPLE_ORGANIZATIONS[1];
  const secondaryUser = await prisma.user.upsert({
    where: { email: "operator@northbridge-payments.example" },
    update: {
      firstName: "Jordan",
      lastName: "Lee",
      platformRole: PlatformUserRole.OPERATOR
    },
    create: {
      email: "operator@northbridge-payments.example",
      firstName: "Jordan",
      lastName: "Lee",
      platformRole: PlatformUserRole.OPERATOR,
      authProviderId: "seed_northbridge_operator"
    }
  });

  const secondaryOrganization = await prisma.organization.upsert({
    where: { slug: secondaryOrganizationDefinition.slug },
    update: {
      billingOwnerUserId: secondaryUser.id,
      currentPostureScore: 79,
      onboardingCompletedAt: new Date("2026-04-02T12:00:00.000Z")
    },
    create: {
      name: secondaryOrganizationDefinition.name,
      slug: secondaryOrganizationDefinition.slug,
      billingOwnerUserId: secondaryUser.id,
      industry: secondaryOrganizationDefinition.industry,
      sizeBand: secondaryOrganizationDefinition.sizeBand,
      country: secondaryOrganizationDefinition.country,
      currentPostureScore: 79,
      aiUsageSummary:
        "Uses AI for payment operations review, vendor due diligence, and secure internal copilots.",
      onboardingCompletedAt: new Date("2026-04-02T12:00:00.000Z"),
      regulatoryProfile: {
        frameworks: ["PCI DSS", "SOC 2", "NIST CSF"]
      }
    }
  });

  const secondaryBillingCustomer = await prisma.billingCustomer.upsert({
    where: {
      organizationId_billingProvider: {
        organizationId: secondaryOrganization.id,
        billingProvider: BillingProvider.STRIPE
      }
    },
    update: {
      billingOwnerUserId: secondaryUser.id,
        providerCustomerId: "cus_demo_northbridge_scale_annual",
      email: secondaryUser.email,
      name: secondaryOrganization.name,
      metadata: {
        source: "demo-seed"
      }
    },
    create: {
      organizationId: secondaryOrganization.id,
      billingOwnerUserId: secondaryUser.id,
      billingProvider: BillingProvider.STRIPE,
        providerCustomerId: "cus_demo_northbridge_scale_annual",
      email: secondaryUser.email,
      name: secondaryOrganization.name,
      metadata: {
        source: "demo-seed"
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: secondaryOrganization.id,
        userId: secondaryUser.id
      }
    },
    update: { role: UserRole.OWNER },
    create: {
      organizationId: secondaryOrganization.id,
      userId: secondaryUser.id,
      role: UserRole.OWNER
    }
  });

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: "sub_demo_northbridge_scale_annual" },
    update: {
      organizationId: secondaryOrganization.id,
      planId: input.planId,
      billingCustomerId: secondaryBillingCustomer.id,
      status: SubscriptionStatus.ACTIVE,
      accessState: BillingAccessState.ACTIVE,
      billingProvider: BillingProvider.STRIPE,
      externalStatus: "active",
        canonicalPlanKeySnapshot: CanonicalPlanKey.SCALE,
      planCodeSnapshot: seedConfig.planCode
    },
    create: {
      organizationId: secondaryOrganization.id,
      planId: input.planId,
      billingCustomerId: secondaryBillingCustomer.id,
      accessState: BillingAccessState.ACTIVE,
      billingProvider: BillingProvider.STRIPE,
      externalStatus: "active",
        canonicalPlanKeySnapshot: CanonicalPlanKey.SCALE,
      planCodeSnapshot: seedConfig.planCode,
        stripeCustomerId: "cus_demo_northbridge_scale_annual",
        stripeSubscriptionId: "sub_demo_northbridge_scale_annual",
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-03-31T23:59:59.000Z"),
      accessEndsAt: new Date("2027-03-31T23:59:59.000Z"),
      reactivatedAt: new Date("2026-04-01T00:00:00.000Z"),
      statusUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      billingMetadata: {
        source: "demo-seed",
        invoiceStatus: "paid"
      }
    }
  });

  const secondaryAssessment = await prisma.assessment.upsert({
    where: { id: "asm_demo_northbridge_follow_on" },
    update: {
      organizationId: secondaryOrganization.id,
      postureScore: 79,
      riskLevel: "Moderate",
      status: AssessmentStatus.REPORT_PUBLISHED,
      completedAt: new Date("2026-04-08T17:30:00.000Z")
    },
    create: {
      id: "asm_demo_northbridge_follow_on",
      organizationId: secondaryOrganization.id,
      name: "Northbridge Follow-on Control Review",
      status: AssessmentStatus.REPORT_PUBLISHED,
      postureScore: 79,
      riskLevel: "Moderate",
      submittedAt: new Date("2026-04-06T11:00:00.000Z"),
      completedAt: new Date("2026-04-08T17:30:00.000Z")
    }
  });

  const secondaryReport = await prisma.report.upsert({
    where: { id: "rpt_demo_northbridge_follow_on" },
    update: {
      organizationId: secondaryOrganization.id,
      assessmentId: secondaryAssessment.id,
      createdByUserId: secondaryUser.id,
      status: ReportStatus.DELIVERED,
      deliveredAt: new Date("2026-04-09T10:00:00.000Z"),
      viewedAt: new Date("2026-04-09T15:00:00.000Z")
    },
    create: {
      id: "rpt_demo_northbridge_follow_on",
      organizationId: secondaryOrganization.id,
      assessmentId: secondaryAssessment.id,
      createdByUserId: secondaryUser.id,
      title: "Northbridge Payment Controls Follow-on",
      versionLabel: "v1.0",
      status: ReportStatus.DELIVERED,
      publishedAt: new Date("2026-04-08T17:30:00.000Z"),
      deliveredAt: new Date("2026-04-09T10:00:00.000Z"),
      viewedAt: new Date("2026-04-09T15:00:00.000Z"),
      reportJson: {
        summary: "Follow-on review completed with stronger control coverage and a limited remediation queue."
      }
    }
  });

  await seedDemoCustomerAccounts({
    primaryOrganizationId: input.primaryOrganizationId,
    primaryOrganizationName: input.primaryOrganizationName,
    primaryLeadSubmissionId: "lead_demo_helix",
    primaryUserId: input.primaryUserId,
    secondaryOrganizationId: secondaryOrganization.id,
    secondaryOrganizationName: secondaryOrganization.name,
    secondaryLeadSubmissionId: "lead_demo_northbridge",
    secondaryUserId: secondaryUser.id
  });

  const primaryAuditProgram = await prisma.engagementProgram.upsert({
    where: { externalKey: `demo-program:${input.primaryOrganizationId}:one-time-audit` },
    update: {
      organizationId: input.primaryOrganizationId,
      customerAccountId: (
        await prisma.customerAccount.findUnique({
          where: { organizationId: input.primaryOrganizationId }
        })
      )?.id,
      subscriptionId: (
        await prisma.subscription.findFirst({
          where: { organizationId: input.primaryOrganizationId },
          orderBy: { createdAt: "desc" }
        })
      )?.id,
      status: EngagementProgramStatus.ACTIVE
    },
    create: {
      organizationId: input.primaryOrganizationId,
      customerAccountId: (
        await prisma.customerAccount.findUnique({
          where: { organizationId: input.primaryOrganizationId }
        })
      )?.id,
      subscriptionId: (
        await prisma.subscription.findFirst({
          where: { organizationId: input.primaryOrganizationId },
          orderBy: { createdAt: "desc" }
        })
      )?.id,
      type: EngagementProgramType.ONE_TIME_AUDIT,
      status: EngagementProgramStatus.ACTIVE,
      commercialModel: EngagementCommercialModel.PROJECT,
      externalKey: `demo-program:${input.primaryOrganizationId}:one-time-audit`,
      name: "Helix AI Governance Audit",
      description: "Primary audit engagement used for the founder demo flow.",
      currentCycleLabel: "Q2 2026",
      startedAt: new Date("2026-03-20T10:00:00.000Z")
    }
  });

  const primaryMonitoringProgram = await prisma.engagementProgram.upsert({
    where: { externalKey: `demo-program:${input.primaryOrganizationId}:monitoring` },
    update: {
      organizationId: input.primaryOrganizationId,
      status: EngagementProgramStatus.ACTIVE
    },
    create: {
      organizationId: input.primaryOrganizationId,
      customerAccountId: (
        await prisma.customerAccount.findUnique({
          where: { organizationId: input.primaryOrganizationId }
        })
      )?.id,
      subscriptionId: (
        await prisma.subscription.findFirst({
          where: { organizationId: input.primaryOrganizationId },
          orderBy: { createdAt: "desc" }
        })
      )?.id,
      type: EngagementProgramType.ONGOING_MONITORING,
      status: EngagementProgramStatus.ACTIVE,
      commercialModel: EngagementCommercialModel.SUBSCRIPTION,
      externalKey: `demo-program:${input.primaryOrganizationId}:monitoring`,
      name: "Helix Continuous Monitoring Program",
      description: "Recurring monitoring program used to demonstrate retention-ready SaaS value.",
      currentCycleLabel: "April monitoring cycle",
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      nextReviewAt: new Date("2026-05-10T09:00:00.000Z")
    }
  });

  const primaryPackage = await prisma.reportPackage.upsert({
    where: {
      organizationId_assessmentId: {
        organizationId: input.primaryOrganizationId,
        assessmentId: input.primaryAssessmentId
      }
    },
    update: {
      engagementProgramId: primaryAuditProgram.id,
      latestReportId: input.primaryReportId,
      title: "Helix Leadership Briefing Packet",
      deliveryStatus: ReportPackageDeliveryStatus.BRIEFING_COMPLETED,
      qaStatus: ReportPackageQaStatus.APPROVED,
      reviewedAt: new Date("2026-04-09T14:00:00.000Z"),
      founderReviewedAt: null,
      sentAt: new Date("2026-04-09T18:00:00.000Z"),
      briefingBookedAt: new Date("2026-04-10T13:00:00.000Z"),
      briefingCompletedAt: new Date("2026-04-10T16:00:00.000Z")
    },
    create: {
      organizationId: input.primaryOrganizationId,
      assessmentId: input.primaryAssessmentId,
      engagementProgramId: primaryAuditProgram.id,
      latestReportId: input.primaryReportId,
      title: "Helix Leadership Briefing Packet",
      deliveryStatus: ReportPackageDeliveryStatus.BRIEFING_COMPLETED,
      qaStatus: ReportPackageQaStatus.APPROVED,
      reviewedAt: new Date("2026-04-09T14:00:00.000Z"),
      reviewedByUserId: input.primaryUserId,
      sentAt: new Date("2026-04-09T18:00:00.000Z"),
      sentByUserId: input.primaryUserId,
      briefingBookedAt: new Date("2026-04-10T13:00:00.000Z"),
      briefingBookedByUserId: input.primaryUserId,
      briefingCompletedAt: new Date("2026-04-10T16:00:00.000Z"),
      briefingCompletedByUserId: input.primaryUserId
    }
  });

  await prisma.reportPackageVersion.upsert({
    where: {
      reportId: input.primaryReportId
    },
    update: {
      reportPackageId: primaryPackage.id,
      versionNumber: 1,
      createdByUserId: input.primaryUserId,
      executiveSummaryJson: {
        overview:
          "Helix has a credible governance baseline, but privacy handling and formal AI policy adoption remain the priority board-level actions."
      },
      roadmapSummaryJson: {
        priorities: [
          "Approve AI acceptable use policy",
          "Add PHI handling controls for AI copilots",
          "Formalize vendor review checklist"
        ]
      },
      frameworkSummaryJson: {
        frameworks: ["HIPAA", "SOC 2", "NIST CSF", "GDPR", "PCI DSS", "ISO 27001"]
      },
      packetJson: {
        packetType: "executive-briefing",
        note: "Demo packet only"
      }
    },
    create: {
      reportPackageId: primaryPackage.id,
      reportId: input.primaryReportId,
      versionNumber: 1,
      createdByUserId: input.primaryUserId,
      executiveSummaryJson: {
        overview:
          "Helix has a credible governance baseline, but privacy handling and formal AI policy adoption remain the priority board-level actions."
      },
      roadmapSummaryJson: {
        priorities: [
          "Approve AI acceptable use policy",
          "Add PHI handling controls for AI copilots",
          "Formalize vendor review checklist"
        ]
      },
      frameworkSummaryJson: {
        frameworks: ["HIPAA", "SOC 2", "NIST CSF", "GDPR", "PCI DSS", "ISO 27001"]
      },
      packetJson: {
        packetType: "executive-briefing",
        note: "Demo packet only"
      }
    }
  });

  await prisma.monitoringSubscription.update({
    where: { id: input.primaryMonitoringSubscriptionId },
    data: {
      engagementProgramId: primaryMonitoringProgram.id
    }
  });

  await prisma.assessment.update({
    where: { id: input.primaryAssessmentId },
    data: {
      engagementProgramId: primaryAuditProgram.id
    }
  });

  await prisma.report.update({
    where: { id: input.primaryReportId },
    data: {
      engagementProgramId: primaryAuditProgram.id
    }
  });

  await writeDemoEvidenceArtifact(
    "demo/helix/ai-acceptable-use-policy-v1.md",
    "# Helix Health Group AI Acceptable Use Policy\n\nThis is seeded demo evidence for investor and prospect presentations.\n"
  );

  const firstControl = await prisma.controlAssessment.findFirst({
    where: { organizationId: input.primaryOrganizationId },
    orderBy: { createdAt: "asc" }
  });

  const evidence = await prisma.evidenceFile.upsert({
    where: {
      id: "evidence_demo_helix_policy"
    },
    update: {
      organizationId: input.primaryOrganizationId,
      engagementProgramId: primaryAuditProgram.id,
      assessmentId: input.primaryAssessmentId,
      reportId: input.primaryReportId,
      frameworkId: firstControl?.frameworkId ?? null,
      frameworkControlId: firstControl?.frameworkControlId ?? null,
      uploadedByUserId: input.primaryUserId,
      reviewedByUserId: input.primaryUserId,
      title: "AI Acceptable Use Policy",
      fileName: "ai-acceptable-use-policy-v1.md",
      storageProvider: "local",
      storageKey: "demo/helix/ai-acceptable-use-policy-v1.md",
      mimeType: "text/markdown",
      extension: "md",
      sizeBytes: 101,
      sha256Hash: "demo-helix-policy-sha",
      source: EvidenceSource.CUSTOMER_UPLOAD,
      category: EvidenceCategory.POLICY_DOCUMENT,
      processingStatus: EvidenceProcessingStatus.PARSED,
      reviewStatus: EvidenceReviewStatus.APPROVED,
      visibleSummary:
        "Seeded policy artifact demonstrating evidence review and framework linkage.",
      parserVersion: "demo-seed-v1",
      parsedAt: new Date("2026-04-08T14:30:00.000Z"),
      reviewedAt: new Date("2026-04-09T09:00:00.000Z")
    },
    create: {
      id: "evidence_demo_helix_policy",
      organizationId: input.primaryOrganizationId,
      engagementProgramId: primaryAuditProgram.id,
      assessmentId: input.primaryAssessmentId,
      reportId: input.primaryReportId,
      frameworkId: firstControl?.frameworkId ?? null,
      frameworkControlId: firstControl?.frameworkControlId ?? null,
      uploadedByUserId: input.primaryUserId,
      reviewedByUserId: input.primaryUserId,
      title: "AI Acceptable Use Policy",
      fileName: "ai-acceptable-use-policy-v1.md",
      storageProvider: "local",
      storageKey: "demo/helix/ai-acceptable-use-policy-v1.md",
      mimeType: "text/markdown",
      extension: "md",
      sizeBytes: 101,
      sha256Hash: "demo-helix-policy-sha",
      source: EvidenceSource.CUSTOMER_UPLOAD,
      category: EvidenceCategory.POLICY_DOCUMENT,
      processingStatus: EvidenceProcessingStatus.PARSED,
      reviewStatus: EvidenceReviewStatus.APPROVED,
      visibleSummary:
        "Seeded policy artifact demonstrating evidence review and framework linkage.",
      parserVersion: "demo-seed-v1",
      parsedAt: new Date("2026-04-08T14:30:00.000Z"),
      reviewedAt: new Date("2026-04-09T09:00:00.000Z")
    }
  });

  await prisma.evidenceFileVersion.upsert({
    where: {
      evidenceFileId_versionNumber: {
        evidenceFileId: evidence.id,
        versionNumber: 1
      }
    },
    update: {
      organizationId: input.primaryOrganizationId,
      createdByUserId: input.primaryUserId,
      fileName: "ai-acceptable-use-policy-v1.md",
      storageKey: "demo/helix/ai-acceptable-use-policy-v1.md",
      mimeType: "text/markdown",
      extension: "md",
      sizeBytes: 101,
      sha256Hash: "demo-helix-policy-sha",
      source: EvidenceSource.CUSTOMER_UPLOAD
    },
    create: {
      evidenceFileId: evidence.id,
      organizationId: input.primaryOrganizationId,
      createdByUserId: input.primaryUserId,
      versionNumber: 1,
      fileName: "ai-acceptable-use-policy-v1.md",
      storageProvider: "local",
      storageKey: "demo/helix/ai-acceptable-use-policy-v1.md",
      mimeType: "text/markdown",
      extension: "md",
      sizeBytes: 101,
      sha256Hash: "demo-helix-policy-sha",
      source: EvidenceSource.CUSTOMER_UPLOAD
    }
  });

  await prisma.evidenceAnnotation.deleteMany({
    where: {
      evidenceFileId: evidence.id
    }
  });

  await prisma.evidenceAnnotation.create({
    data: {
      evidenceFileId: evidence.id,
      organizationId: input.primaryOrganizationId,
      authorUserId: input.primaryUserId,
      visibility: EvidenceAnnotationVisibility.INTERNAL,
      body: "Demo reviewer note: evidence approved for presentation and linked to framework scoring."
    }
  });

  await prisma.customerRun.upsert({
    where: {
      idempotencyKey: `customer-run:${input.primaryAssessmentId}:demo`
    },
    update: {
      organizationId: input.primaryOrganizationId,
      initiatedByUserId: input.primaryUserId,
      assessmentId: input.primaryAssessmentId,
      reportId: input.primaryReportId,
      runType: "assessment_delivery",
      source: "demo-seed",
      status: CustomerRunStatus.SUCCEEDED,
      currentStep: CustomerRunStep.DELIVERY,
      stepsJson: {
        intake: "completed",
        analysis: "completed",
        report: "completed",
        crm: "completed",
        delivery: "completed"
      },
      completedAt: new Date("2026-04-09T18:00:00.000Z")
    },
    create: {
      organizationId: input.primaryOrganizationId,
      initiatedByUserId: input.primaryUserId,
      assessmentId: input.primaryAssessmentId,
      reportId: input.primaryReportId,
      runType: "assessment_delivery",
      source: "demo-seed",
      idempotencyKey: `customer-run:${input.primaryAssessmentId}:demo`,
      status: CustomerRunStatus.SUCCEEDED,
      currentStep: CustomerRunStep.DELIVERY,
      stepsJson: {
        intake: "completed",
        analysis: "completed",
        report: "completed",
        crm: "completed",
        delivery: "completed"
      },
      completedAt: new Date("2026-04-09T18:00:00.000Z")
    }
  });
}

async function main() {
  const seededCanonicalPlanKey = seedConfig.planCode.startsWith("enterprise")
    ? CanonicalPlanKey.ENTERPRISE
    : CanonicalPlanKey.SCALE;

  const plan = await prisma.plan.upsert({
    where: { code: seedConfig.planCode },
    update: {
      canonicalKey: seededCanonicalPlanKey,
        family: seedConfig.planCode.startsWith("enterprise") ? "enterprise" : "scale",
      version: 1,
      description: "Seeded plan for local development and investor-demo safe billing flows.",
      currency: "USD",
      billingIntervalMode: BillingInterval.ANNUAL,
      trialDays: 14,
      sortOrder: seedConfig.planCode.startsWith("enterprise") ? 20 : 10,
      isActive: true,
      isPublic: true,
      billingProvider: BillingProvider.STRIPE,
      billingLookupKey: seedConfig.planCode,
      entitlementConfig: {
        limits: {
          activeAssessments: 5,
          seats: 8,
          frameworks: 6
        },
        features: {
          roadmap: true,
          reportCenter: true,
          quarterlyReassessments: true
        }
      },
      adminMetadata: {
        source: "seed",
        supportTier: "standard"
      }
    },
    create: {
      code: seedConfig.planCode,
      canonicalKey: seededCanonicalPlanKey,
        family: seedConfig.planCode.startsWith("enterprise") ? "enterprise" : "scale",
      version: 1,
      name: seedConfig.planName,
      description: "Seeded plan for local development and investor-demo safe billing flows.",
      currency: "USD",
      billingIntervalMode: BillingInterval.ANNUAL,
      billingInterval: "annual",
      priceCents: 120000,
      trialDays: 14,
      sortOrder: seedConfig.planCode.startsWith("enterprise") ? 20 : 10,
      isActive: true,
      isPublic: true,
      billingProvider: BillingProvider.STRIPE,
      billingLookupKey: seedConfig.planCode,
      activeAssessmentsLimit: 5,
      seatsLimit: 8,
      frameworksLimit: 6,
      features: {
        roadmap: true,
        reportCenter: true,
        quarterlyReassessments: true
      },
      entitlementConfig: {
        limits: {
          activeAssessments: 5,
          seats: 8,
          frameworks: 6
        },
        features: {
          roadmap: true,
          reportCenter: true,
          quarterlyReassessments: true
        }
      },
      adminMetadata: {
        source: "seed",
        supportTier: "standard"
      }
    }
  });

  const user = await prisma.user.upsert({
    where: { email: seedConfig.ownerEmail },
    update: {
      platformRole: PlatformUserRole.SUPER_ADMIN
    },
    create: {
      email: seedConfig.ownerEmail,
      firstName: seedConfig.ownerFirstName,
      lastName: seedConfig.ownerLastName,
      platformRole: PlatformUserRole.SUPER_ADMIN,
      authProviderId: `seed_${seedConfig.organizationSlug}_owner`
    }
  });

  const bootstrapPassword = process.env.AUTH_ACCESS_PASSWORD;
  if (bootstrapPassword) {
    await prisma.passwordCredential.upsert({
      where: { userId: user.id },
      update: {
        passwordHash: hashPassword(bootstrapPassword),
        passwordUpdatedAt: new Date()
      },
      create: {
        userId: user.id,
        passwordHash: hashPassword(bootstrapPassword)
      }
    });
  }

  const organization = await prisma.organization.upsert({
    where: { slug: seedConfig.organizationSlug },
    update: {
      billingOwnerUserId: user.id,
      currentPostureScore: 72
    },
    create: {
      name: seedConfig.organizationName,
      slug: seedConfig.organizationSlug,
      billingOwnerUserId: user.id,
      industry: seedConfig.organizationIndustry,
      sizeBand: seedConfig.organizationSizeBand,
      country: seedConfig.organizationCountry,
      aiUsageSummary: "Uses AI copilots for operations, drafting, research, and internal support workflows.",
      currentPostureScore: 72,
      regulatoryProfile: {
        frameworks: ["HIPAA", "SOC 2", "NIST CSF", "GDPR", "PCI DSS", "ISO 27001"]
      }
    }
  });

  const billingCustomer = await prisma.billingCustomer.upsert({
    where: {
      organizationId_billingProvider: {
        organizationId: organization.id,
        billingProvider: BillingProvider.STRIPE
      }
    },
    update: {
      billingOwnerUserId: user.id,
      providerCustomerId: `cus_seed_${seedConfig.organizationSlug}`,
      email: seedConfig.ownerEmail,
      name: seedConfig.organizationName,
      metadata: {
        source: "seed"
      }
    },
    create: {
      organizationId: organization.id,
      billingOwnerUserId: user.id,
      billingProvider: BillingProvider.STRIPE,
      providerCustomerId: `cus_seed_${seedConfig.organizationSlug}`,
      email: seedConfig.ownerEmail,
      name: seedConfig.organizationName,
      metadata: {
        source: "seed"
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id
      }
    },
    update: { role: UserRole.OWNER },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: UserRole.OWNER
    }
  });

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: "sub_seed_scale_annual" },
    update: {
      planId: plan.id,
      billingCustomerId: billingCustomer.id,
      status: SubscriptionStatus.ACTIVE,
      accessState: BillingAccessState.ACTIVE,
      billingProvider: BillingProvider.STRIPE,
      externalStatus: "active",
      canonicalPlanKeySnapshot: seededCanonicalPlanKey,
      planCodeSnapshot: seedConfig.planCode,
        stripePriceIdSnapshot: process.env.STRIPE_PRICE_SCALE_ANNUAL ?? null,
      accessEndsAt: new Date("2027-03-31T23:59:59.000Z"),
      statusUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      reactivatedAt: new Date("2026-04-01T00:00:00.000Z"),
      billingMetadata: {
        source: "seed",
        invoiceStatus: "paid"
      }
    },
    create: {
      organizationId: organization.id,
      planId: plan.id,
      billingCustomerId: billingCustomer.id,
      accessState: BillingAccessState.ACTIVE,
      billingProvider: BillingProvider.STRIPE,
      externalStatus: "active",
      canonicalPlanKeySnapshot: seededCanonicalPlanKey,
      planCodeSnapshot: seedConfig.planCode,
      stripeCustomerId: `cus_seed_${seedConfig.organizationSlug}`,
        stripeSubscriptionId: "sub_seed_scale_annual",
        stripePriceIdSnapshot: process.env.STRIPE_PRICE_SCALE_ANNUAL ?? null,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-03-31T23:59:59.000Z"),
      accessEndsAt: new Date("2027-03-31T23:59:59.000Z"),
      trialStartedAt: new Date("2026-04-07T00:00:00.000Z"),
      trialEndsAt: new Date("2026-04-21T23:59:59.000Z"),
      reactivatedAt: new Date("2026-04-01T00:00:00.000Z"),
      statusUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      billingMetadata: {
        source: "seed",
        invoiceStatus: "paid"
      }
    }
  });

  for (const frameworkDefinition of SUPPORTED_FRAMEWORK_CATALOG) {
    const framework = await prisma.framework.upsert({
      where: { code: frameworkDefinition.code },
      update: {
        name: frameworkDefinition.name,
        category: frameworkDefinition.category,
        version: frameworkDefinition.version
      },
      create: {
        code: frameworkDefinition.code,
        name: frameworkDefinition.name,
        category: frameworkDefinition.category,
        version: frameworkDefinition.version
      }
    });

    for (const family of frameworkDefinition.families) {
      for (const [index, control] of family.controls.entries()) {
        await prisma.frameworkControl.upsert({
          where: {
            frameworkId_code: {
              frameworkId: framework.id,
              code: control.code
            }
          },
          update: {
            familyCode: family.code,
            familyName: family.name,
            title: control.title,
            description: control.description,
            weight: control.weight,
            sortOrder: family.sortOrder * 100 + index + 1
          },
          create: {
            frameworkId: framework.id,
            code: control.code,
            familyCode: family.code,
            familyName: family.name,
            title: control.title,
            description: control.description,
            weight: control.weight,
            sortOrder: family.sortOrder * 100 + index + 1
          }
        });
      }
    }

    await prisma.organizationFramework.upsert({
      where: {
        organizationId_frameworkId: {
          organizationId: organization.id,
          frameworkId: framework.id
        }
      },
      update: {},
      create: {
        organizationId: organization.id,
        frameworkId: framework.id
      }
    });
  }

  const assessment = await prisma.assessment.upsert({
    where: { id: "asm_demo_q2_ai_governance_review" },
    update: {
      postureScore: 72,
      riskLevel: "Moderate",
      status: AssessmentStatus.ANALYSIS_RUNNING
    },
    create: {
      id: "asm_demo_q2_ai_governance_review",
      organizationId: organization.id,
      name: "Q2 AI Governance Review",
      status: AssessmentStatus.ANALYSIS_RUNNING,
      postureScore: 72,
      riskLevel: "Moderate",
      submittedAt: new Date("2026-04-08T14:05:00.000Z")
    }
  });

  const sections = [
    ["company-profile", "Company Profile", "completed", 1],
    ["ai-usage", "AI Usage", "completed", 2],
    ["data-handling", "Data Handling", "completed", 3],
    ["controls-and-policies", "Controls & Policies", "in_review", 4]
  ] as const;

  for (const [key, title, status, orderIndex] of sections) {
    await prisma.assessmentSection.upsert({
      where: {
        assessmentId_key: {
          assessmentId: assessment.id,
          key
        }
      },
      update: { status },
      create: {
        assessmentId: assessment.id,
        key,
        title,
        status,
        orderIndex
      }
    });
  }

  await prisma.analysisJob.upsert({
    where: { id: "job_demo_q2_analysis" },
    update: {
      status: JobStatus.RUNNING
    },
    create: {
      id: "job_demo_q2_analysis",
      assessmentId: assessment.id,
      provider: "dify",
      status: JobStatus.RUNNING,
      jobType: "report_generation",
      inputPayload: {
        assessmentId: assessment.id,
        mode: "executive_report"
      },
      startedAt: new Date("2026-04-09T12:10:00.000Z")
    }
  });

  await prisma.finding.deleteMany({
    where: { assessmentId: assessment.id }
  });

  await prisma.recommendation.deleteMany({
    where: { assessmentId: assessment.id }
  });

  await prisma.finding.createMany({
    data: [
      {
        assessmentId: assessment.id,
        title: "No formal AI acceptable use policy",
        summary: "The organization has no approved policy governing employee AI tool usage.",
        severity: FindingSeverity.HIGH,
        riskDomain: "governance",
        impactedFrameworks: ["SOC 2", "ISO 27001"],
        score: 82,
        sortOrder: 1
      },
      {
        assessmentId: assessment.id,
        title: "PHI handling guidance missing for AI copilots",
        summary: "Teams use AI-assisted tools without documented PHI handling controls.",
        severity: FindingSeverity.CRITICAL,
        riskDomain: "privacy",
        impactedFrameworks: ["HIPAA"],
        score: 91,
        sortOrder: 2
      },
      {
        assessmentId: assessment.id,
        title: "Vendor review process not documented for LLM tools",
        summary: "AI vendor onboarding is inconsistent and lacks documented approval criteria.",
        severity: FindingSeverity.MEDIUM,
        riskDomain: "third-party risk",
        impactedFrameworks: ["NIST CSF"],
        score: 61,
        sortOrder: 3
      }
    ]
  });

  await prisma.recommendation.createMany({
    data: [
      {
        assessmentId: assessment.id,
        title: "Approve AI acceptable use policy",
        description: "Draft, approve, and communicate a formal AI usage policy.",
        priority: RecommendationPriority.URGENT,
        ownerRole: "Compliance Lead",
        effort: "Medium",
        targetTimeline: "30 days",
        sortOrder: 1
      },
      {
        assessmentId: assessment.id,
        title: "Create model and vendor intake checklist",
        description: "Require review of data handling, retention, vendor posture, and model usage context.",
        priority: RecommendationPriority.HIGH,
        ownerRole: "CTO",
        effort: "Low",
        targetTimeline: "14 days",
        sortOrder: 2
      },
      {
        assessmentId: assessment.id,
        title: "Add PHI guidance for AI copilots",
        description: "Define approved use cases, redaction expectations, and prohibited inputs.",
        priority: RecommendationPriority.HIGH,
        ownerRole: "Security + Operations",
        effort: "Medium",
        targetTimeline: "21 days",
        sortOrder: 3
      }
    ]
  });

  const report = await prisma.report.upsert({
    where: { id: "rpt_demo_board_summary_q1" },
    update: {},
    create: {
      id: "rpt_demo_board_summary_q1",
      organizationId: organization.id,
      assessmentId: assessment.id,
      createdByUserId: user.id,
      title: "Board Summary - Q1 Assessment",
      versionLabel: "v1.0",
      status: ReportStatus.PUBLISHED,
      publishedAt: new Date("2026-03-31T18:00:00.000Z"),
      reportJson: {
        summary: "Moderate posture with governance and PHI handling gaps."
      }
    }
  });

  const monitoringSubscription = await prisma.monitoringSubscription.upsert({
    where: { organizationId: organization.id },
    update: {
      status: MonitoringSubscriptionStatus.ACTIVE,
      currentPostureScore: 72,
      currentRiskLevel: "Moderate",
      lastAssessmentId: assessment.id,
      lastReportId: report.id,
      lastSyncedAt: new Date("2026-04-10T09:00:00.000Z"),
      activatedAt: new Date("2026-04-01T00:00:00.000Z"),
      nextReviewAt: new Date("2026-05-10T09:00:00.000Z")
    },
    create: {
      organizationId: organization.id,
      status: MonitoringSubscriptionStatus.ACTIVE,
      cadenceDays: 30,
      currentPostureScore: 72,
      currentRiskLevel: "Moderate",
      lastAssessmentId: assessment.id,
      lastReportId: report.id,
      lastSyncedAt: new Date("2026-04-10T09:00:00.000Z"),
      activatedAt: new Date("2026-04-01T00:00:00.000Z"),
      nextReviewAt: new Date("2026-05-10T09:00:00.000Z")
    }
  });

  const seededFindings = await prisma.finding.findMany({
    where: { assessmentId: assessment.id },
    orderBy: { sortOrder: "asc" }
  });

  for (const finding of seededFindings) {
    await prisma.monitoringFinding.upsert({
      where: {
        organizationId_dedupeKey: {
          organizationId: organization.id,
          dedupeKey: `${finding.riskDomain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${finding.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        }
      },
      update: {
        monitoringSubscriptionId: monitoringSubscription.id,
        sourceFindingId: finding.id,
        lastAssessmentId: assessment.id,
        lastReportId: report.id,
        title: finding.title,
        summary: finding.summary,
        severity: finding.severity,
        riskDomain: finding.riskDomain,
        impactedFrameworks: finding.impactedFrameworks,
        status:
          finding.severity === FindingSeverity.CRITICAL
            ? MonitoringFindingStatus.OPEN
            : finding.severity === FindingSeverity.HIGH
              ? MonitoringFindingStatus.IN_REMEDIATION
              : MonitoringFindingStatus.DEFERRED,
        ownerRole:
          finding.riskDomain === "privacy" ? "Privacy Lead" : "Program Owner",
        remediationNotes:
          finding.severity === FindingSeverity.CRITICAL
            ? "Founder review required before customer delivery."
            : "Assigned for the next remediation cycle.",
        firstDetectedAt: new Date("2026-04-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-04-10T09:00:00.000Z"),
        lastStatusChangedAt: new Date("2026-04-10T09:00:00.000Z")
      },
      create: {
        organizationId: organization.id,
        monitoringSubscriptionId: monitoringSubscription.id,
        dedupeKey: `${finding.riskDomain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${finding.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        sourceFindingId: finding.id,
        firstAssessmentId: assessment.id,
        lastAssessmentId: assessment.id,
        lastReportId: report.id,
        title: finding.title,
        summary: finding.summary,
        severity: finding.severity,
        riskDomain: finding.riskDomain,
        impactedFrameworks: finding.impactedFrameworks,
        status:
          finding.severity === FindingSeverity.CRITICAL
            ? MonitoringFindingStatus.OPEN
            : finding.severity === FindingSeverity.HIGH
              ? MonitoringFindingStatus.IN_REMEDIATION
              : MonitoringFindingStatus.DEFERRED,
        ownerRole:
          finding.riskDomain === "privacy" ? "Privacy Lead" : "Program Owner",
        remediationNotes:
          finding.severity === FindingSeverity.CRITICAL
            ? "Founder review required before customer delivery."
            : "Assigned for the next remediation cycle.",
        deferredUntil:
          finding.severity === FindingSeverity.MEDIUM
            ? new Date("2026-05-15T00:00:00.000Z")
            : null,
        firstDetectedAt: new Date("2026-04-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-04-10T09:00:00.000Z"),
        lastStatusChangedAt: new Date("2026-04-10T09:00:00.000Z")
      }
    });
  }

  const frameworks = await prisma.organizationFramework.findMany({
    where: { organizationId: organization.id },
    include: { framework: true }
  });

  for (const selection of frameworks) {
    await prisma.monitoringFramework.upsert({
      where: {
        organizationId_frameworkId: {
          organizationId: organization.id,
          frameworkId: selection.frameworkId
        }
      },
      update: {
        monitoringSubscriptionId: monitoringSubscription.id,
        lastAssessmentId: assessment.id,
        status:
          selection.framework.name === "HIPAA"
            ? MonitoringFrameworkStatus.ATTENTION_REQUIRED
            : MonitoringFrameworkStatus.WATCH,
        score: selection.framework.name === "HIPAA" ? 54 : 71,
        openFindingsCount: selection.framework.name === "HIPAA" ? 1 : 2,
        inRemediationCount: 1,
        resolvedFindingsCount: 0,
        trendDelta: selection.framework.name === "HIPAA" ? -6 : 2,
        lastReviewedAt: new Date("2026-04-10T09:00:00.000Z")
      },
      create: {
        organizationId: organization.id,
        monitoringSubscriptionId: monitoringSubscription.id,
        frameworkId: selection.frameworkId,
        lastAssessmentId: assessment.id,
        status:
          selection.framework.name === "HIPAA"
            ? MonitoringFrameworkStatus.ATTENTION_REQUIRED
            : MonitoringFrameworkStatus.WATCH,
        score: selection.framework.name === "HIPAA" ? 54 : 71,
        openFindingsCount: selection.framework.name === "HIPAA" ? 1 : 2,
        inRemediationCount: 1,
        resolvedFindingsCount: 0,
        trendDelta: selection.framework.name === "HIPAA" ? -6 : 2,
        lastReviewedAt: new Date("2026-04-10T09:00:00.000Z")
      }
    });
  }

  const frameworkControls = await prisma.frameworkControl.findMany({
    where: {
      frameworkId: {
        in: frameworks.map((selection) => selection.frameworkId)
      }
    },
    orderBy: [{ frameworkId: "asc" }, { sortOrder: "asc" }]
  });

  await prisma.controlAssessmentSnapshot.deleteMany({
    where: {
      organizationId: organization.id
    }
  });
  await prisma.frameworkPostureSnapshot.deleteMany({
    where: {
      organizationId: organization.id
    }
  });
  await prisma.controlAssessment.deleteMany({
    where: {
      organizationId: organization.id
    }
  });

  for (const [index, control] of frameworkControls.entries()) {
    const cycleIndex = index % 4;
    const status =
      cycleIndex === 0
        ? ControlImplementationStatus.IMPLEMENTED
        : cycleIndex === 1
          ? ControlImplementationStatus.PARTIALLY_IMPLEMENTED
          : cycleIndex === 2
            ? ControlImplementationStatus.NEEDS_REVIEW
            : ControlImplementationStatus.NOT_IMPLEMENTED;
    const score =
      status === ControlImplementationStatus.IMPLEMENTED
        ? 88
        : status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
          ? 58
          : status === ControlImplementationStatus.NEEDS_REVIEW
            ? 44
            : 24;

    const controlAssessment = await prisma.controlAssessment.create({
      data: {
        organizationId: organization.id,
        frameworkId: control.frameworkId,
        frameworkControlId: control.id,
        engagementProgramId: null,
        assessmentId: assessment.id,
        reportId: report.id,
        reviewedByUserId: user.id,
        status,
        score,
        overriddenScore: score,
        scoreSource:
          status === ControlImplementationStatus.NEEDS_REVIEW
            ? ControlScoreSource.INFERRED
            : ControlScoreSource.REVIEWED,
        weighting: control.weight,
        rationale:
          status === ControlImplementationStatus.IMPLEMENTED
            ? "Seeded evidence and reviewer confirmation indicate the control is operating."
            : status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
              ? "Control exists but remediation work remains open."
              : status === ControlImplementationStatus.NEEDS_REVIEW
                ? "Supporting artifacts are present but still require reviewer confirmation."
                : "Open findings indicate this control is not yet operating effectively.",
        summaryJson: {
          source: "seed",
          linkedFindingCount:
            status === ControlImplementationStatus.NOT_IMPLEMENTED ||
            status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
              ? 1
              : 0
        },
        lastScoredAt: new Date("2026-04-10T09:00:00.000Z"),
        lastReviewedAt:
          status === ControlImplementationStatus.NEEDS_REVIEW
            ? null
            : new Date("2026-04-10T09:00:00.000Z")
      }
    });

    await prisma.controlAssessmentSnapshot.create({
      data: {
        organizationId: organization.id,
        controlAssessmentId: controlAssessment.id,
        frameworkId: control.frameworkId,
        frameworkControlId: control.id,
        assessmentId: assessment.id,
        reportId: report.id,
        status,
        score,
        scoreSource: controlAssessment.scoreSource,
        rationale: controlAssessment.rationale,
        summaryJson: controlAssessment.summaryJson,
        recordedAt: new Date("2026-04-10T09:00:00.000Z")
      }
    });
  }

  for (const selection of frameworks) {
    const controlAssessments = await prisma.controlAssessment.findMany({
      where: {
        organizationId: organization.id,
        frameworkId: selection.frameworkId
      }
    });
    const implementedControlsCount = controlAssessments.filter(
      (controlAssessment) =>
        controlAssessment.status === ControlImplementationStatus.IMPLEMENTED
    ).length;
    const gapControlsCount = controlAssessments.filter(
      (controlAssessment) =>
        controlAssessment.status === ControlImplementationStatus.NOT_IMPLEMENTED ||
        controlAssessment.status === ControlImplementationStatus.PARTIALLY_IMPLEMENTED
    ).length;
    const needsReviewControlsCount = controlAssessments.filter(
      (controlAssessment) =>
        controlAssessment.status === ControlImplementationStatus.NEEDS_REVIEW
    ).length;
    const score = Math.round(
      controlAssessments.reduce(
        (total, controlAssessment) => total + (controlAssessment.score ?? 0),
        0
      ) / Math.max(controlAssessments.length, 1)
    );

    await prisma.frameworkPostureSnapshot.create({
      data: {
        organizationId: organization.id,
        frameworkId: selection.frameworkId,
        assessmentId: assessment.id,
        reportId: report.id,
        status:
          gapControlsCount >= 2 || score < 60
            ? FrameworkPostureStatus.ATTENTION_REQUIRED
            : gapControlsCount > 0
              ? FrameworkPostureStatus.WATCH
              : FrameworkPostureStatus.STABLE,
        score,
        assessedControlsCount: controlAssessments.length,
        implementedControlsCount,
        gapControlsCount,
        needsReviewControlsCount,
        weightedCoveragePercent: score,
        sourceLabel: "seed_baseline",
        scoringSummaryJson: {
          source: "seed",
          frameworkCode: selection.framework.code
        },
        recordedAt: new Date("2026-04-10T09:00:00.000Z")
      }
    });
  }

  await prisma.monitoringRiskSnapshot.deleteMany({
    where: {
      organizationId: organization.id,
      source: "seed_baseline"
    }
  });

  await prisma.monitoringRiskSnapshot.createMany({
    data: [
      {
        organizationId: organization.id,
        monitoringSubscriptionId: monitoringSubscription.id,
        assessmentId: assessment.id,
        reportId: report.id,
        source: "seed_baseline",
        postureScore: 68,
        riskLevel: "Elevated",
        openFindingsCount: 4,
        criticalFindingsCount: 1,
        resolvedFindingsCount: 0,
        recordedAt: new Date("2026-03-15T12:00:00.000Z")
      },
      {
        organizationId: organization.id,
        monitoringSubscriptionId: monitoringSubscription.id,
        assessmentId: assessment.id,
        reportId: report.id,
        source: "seed_baseline",
        postureScore: 72,
        riskLevel: "Moderate",
        openFindingsCount: 3,
        criticalFindingsCount: 1,
        resolvedFindingsCount: 1,
        recordedAt: new Date("2026-04-10T09:00:00.000Z")
      }
    ]
  });

  const checks = [
    ["policy-attestation", "Policy and control attestation refresh", "governance", 30],
    ["vendor-risk-review", "Vendor and AI tool review cycle", "third_party", 30],
    ["access-control-review", "Access and privileged operations review", "security", 30],
    ["executive-reporting-refresh", "Executive reporting refresh", "reporting", 90]
  ] as const;

  for (const [key, title, targetType, cadenceDays] of checks) {
    await prisma.monitoringCheck.upsert({
      where: {
        organizationId_key: {
          organizationId: organization.id,
          key
        }
      },
      update: {
        monitoringSubscriptionId: monitoringSubscription.id,
        title,
        targetType,
        cadenceDays,
        status: MonitoringCheckStatus.ACTIVE,
        nextRunAt: new Date("2026-05-10T09:00:00.000Z")
      },
      create: {
        organizationId: organization.id,
        monitoringSubscriptionId: monitoringSubscription.id,
        key,
        title,
        description: "Seeded recurring monitoring placeholder.",
        targetType,
        cadenceDays,
        status: MonitoringCheckStatus.ACTIVE,
        nextRunAt: new Date("2026-05-10T09:00:00.000Z")
      }
    });
  }

  if (seedScenario === "demo") {
    await seedDemoPresentationData({
      planId: plan.id,
      primaryUserId: user.id,
      primaryOrganizationId: organization.id,
      primaryOrganizationName: organization.name,
      primaryAssessmentId: assessment.id,
      primaryReportId: report.id,
      primaryMonitoringSubscriptionId: monitoringSubscription.id
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
