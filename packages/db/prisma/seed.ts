import { PrismaClient, UserRole, SubscriptionStatus, AssessmentStatus, JobStatus, FindingSeverity, RecommendationPriority, ReportStatus } from "@prisma/client";

const prisma = new PrismaClient();

const seedConfig = {
  planCode: process.env.SEED_PLAN_CODE ?? "growth-annual",
  planName: process.env.SEED_PLAN_NAME ?? "Growth Annual",
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

async function main() {
  const plan = await prisma.plan.upsert({
    where: { code: seedConfig.planCode },
    update: {},
    create: {
      code: seedConfig.planCode,
      name: seedConfig.planName,
      billingInterval: "annual",
      priceCents: 120000,
      activeAssessmentsLimit: 5,
      seatsLimit: 8,
      frameworksLimit: 6,
      features: {
        roadmap: true,
        reportCenter: true,
        quarterlyReassessments: true
      }
    }
  });

  const user = await prisma.user.upsert({
    where: { email: seedConfig.ownerEmail },
    update: {},
    create: {
      email: seedConfig.ownerEmail,
      firstName: seedConfig.ownerFirstName,
      lastName: seedConfig.ownerLastName,
      authProviderId: `seed_${seedConfig.organizationSlug}_owner`
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: seedConfig.organizationSlug },
    update: {
      currentPostureScore: 72
    },
    create: {
      name: seedConfig.organizationName,
      slug: seedConfig.organizationSlug,
      industry: seedConfig.organizationIndustry,
      sizeBand: seedConfig.organizationSizeBand,
      country: seedConfig.organizationCountry,
      aiUsageSummary: "Uses AI copilots for operations, drafting, research, and internal support workflows.",
      currentPostureScore: 72,
      regulatoryProfile: {
        frameworks: ["HIPAA", "SOC2", "NIST-CSF", "GDPR", "PCI-DSS"]
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
    where: { stripeSubscriptionId: "sub_demo_growth_annual" },
    update: {
      status: SubscriptionStatus.ACTIVE
    },
    create: {
      organizationId: organization.id,
      planId: plan.id,
      stripeCustomerId: `cus_seed_${seedConfig.organizationSlug}`,
      stripeSubscriptionId: `sub_seed_${seedConfig.planCode}`,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-03-31T23:59:59.000Z")
    }
  });

  const frameworkCodes = [
    ["soc2", "SOC 2", "Security"],
    ["hipaa", "HIPAA", "Privacy"],
    ["nist-csf", "NIST CSF", "Security"],
    ["gdpr", "GDPR", "Privacy"],
    ["pci-dss", "PCI DSS", "Compliance"]
  ] as const;

  for (const [code, name, category] of frameworkCodes) {
    const framework = await prisma.framework.upsert({
      where: { code },
      update: {},
      create: { code, name, category }
    });

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

  await prisma.report.upsert({
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
