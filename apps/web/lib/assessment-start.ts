import {
  AssessmentStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import type { AppSession } from "./auth";
import { writeAuditLog } from "./audit";
import { syncOrganizationCustomerAccount } from "./customer-accounts";
import { createCustomerRunForAssessment } from "./customer-runs";
import { publishDomainEvent } from "./domain-events";
import { requireAssessmentCreationAccess } from "./entitlement-guards";
import { trackProductAnalyticsEvent } from "./product-analytics";
import { buildUsageThresholdEvents } from "./usage";
import { recordUsageEvent, requireQuota } from "./usage-quotas";

const DEFAULT_ASSESSMENT_SECTIONS = [
  { key: "company-profile", title: "Company Profile" },
  { key: "ai-usage", title: "AI Usage Inventory" },
  { key: "data-handling", title: "Data Handling & Privacy" },
  { key: "controls-and-policies", title: "Controls & Policies" }
];

function buildDefaultAssessmentName() {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date());

  return `AI Governance Assessment - ${formattedDate}`;
}

export async function findReusableAssessmentId(
  organizationId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const assessment = await db.assessment.findFirst({
    where: {
      organizationId,
      status: {
        in: [
          AssessmentStatus.INTAKE_IN_PROGRESS,
          AssessmentStatus.INTAKE_SUBMITTED
        ]
      }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  return assessment?.id ?? null;
}

export async function createOrReuseAssessmentWorkspace(input: {
  session: AppSession;
  requestContext: Prisma.InputJsonValue;
  name?: string;
  reuseExisting?: boolean;
}) {
  const organizationId = input.session.organization!.id;
  const reuseExisting = input.reuseExisting ?? true;
  const existingAssessmentId = reuseExisting
    ? await findReusableAssessmentId(organizationId)
    : null;

  if (existingAssessmentId) {
    return {
      assessmentId: existingAssessmentId,
      created: false
    };
  }

  const session = input.session;
  const requestContext = input.requestContext;
  const name = (input.name ?? "").trim() || buildDefaultAssessmentName();
  const entitlements = await requireAssessmentCreationAccess(
    organizationId,
    "/dashboard/assessments?error=limit"
  );
  await requireQuota(organizationId, "audits", {
    failureRedirect: "/dashboard/assessments",
    failureMessage:
      "Monthly audit quota reached. Upgrade required to create another assessment."
  });

  const createdAssessment = await prisma.$transaction(async (tx) => {
    const existingAssessmentCount = await tx.assessment.count({
      where: { organizationId }
    });

    const assessment = await tx.assessment.create({
      data: {
        organizationId,
        createdByUserId: session.user.id,
        name,
        status: AssessmentStatus.INTAKE_IN_PROGRESS,
        sections: {
          create: DEFAULT_ASSESSMENT_SECTIONS.map((section, index) => ({
            key: section.key,
            title: section.title,
            status: index === 0 ? "in_progress" : "not_started",
            orderIndex: index + 1
          }))
        }
      }
    });

    await recordUsageEvent(
      {
        organizationId,
        meterKey: "audits",
        idempotencyKey: `usage:audits:${assessment.id}`,
        source: "assessment.create",
        sourceRecordType: "assessment",
        sourceRecordId: assessment.id,
        metadata: {
          assessmentId: assessment.id,
          assessmentName: assessment.name
        }
      },
      tx
    );

    await tx.notification.create({
      data: {
        organizationId,
        type: "assessment.created",
        title: "Assessment created",
        body: `${name} was created and is ready for intake.`,
        actionUrl: `/dashboard/assessments/${assessment.id}`
      }
    });

    await publishDomainEvent(tx, {
      type: "assessment.created",
      aggregateType: "assessment",
      aggregateId: assessment.id,
      orgId: organizationId,
      userId: session.user.id,
      idempotencyKey: `assessment.created:${assessment.id}`,
      payload: {
        assessmentId: assessment.id,
        organizationId,
        userId: session.user.id,
        name,
        status: assessment.status,
        isFirstAssessment: existingAssessmentCount === 0
      } satisfies Prisma.InputJsonValue
    });

    if (existingAssessmentCount === 0) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "product.first_assessment_created",
        payload: {
          assessmentId: assessment.id,
          assessmentName: assessment.name
        },
        source: "assessment-create",
        path: "/dashboard/assessments",
        session,
        organizationId,
        userId: session.user.id,
        billingPlanCode: entitlements.planCode
      });
    }

    const usageEvents = buildUsageThresholdEvents({
      metric: "active_assessments",
      used: existingAssessmentCount + 1,
      limit: entitlements.activeAssessmentsLimit,
      organizationId
    });

    for (const event of usageEvents) {
      await publishDomainEvent(tx, event);

      const thresholdPercent =
        typeof event.payload === "object" &&
        event.payload &&
        "thresholdPercent" in event.payload
          ? Number((event.payload as Record<string, unknown>).thresholdPercent)
          : 0;

      if (thresholdPercent >= 100) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "usage.limit_reached",
          payload: {
            metric: "active_assessments",
            thresholdPercent,
            limit: entitlements.activeAssessmentsLimit,
            used: existingAssessmentCount + 1
          },
          source: "assessment-create",
          path: "/dashboard/assessments",
          session,
          organizationId,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "assessment.created",
      entityType: "assessment",
      entityId: assessment.id,
      metadata: {
        name,
        isFirstAssessment: existingAssessmentCount === 0
      },
      requestContext
    });

    await createCustomerRunForAssessment({
      db: tx,
      organizationId,
      initiatedByUserId: session.user.id,
      assessmentId: assessment.id,
      source: "workspace_assessment_create",
      contextJson: {
        assessmentName: assessment.name
      }
    });

    await syncOrganizationCustomerAccount(organizationId, {
      db: tx,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      reason: "Assessment creation started the intake lifecycle."
    });

    return assessment;
  });

  return {
    assessmentId: createdAssessment.id,
    created: true
  };
}
