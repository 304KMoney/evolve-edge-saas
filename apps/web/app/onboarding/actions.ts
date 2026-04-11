"use server";

import { Prisma, UserRole, hashPassword, prisma } from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { createTrialSubscription, ensureDefaultPlans } from "../../lib/billing";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import { syncOrganizationCustomerAccount } from "../../lib/customer-accounts";
import { publishDomainEvents } from "../../lib/domain-events";
import { requireCurrentSession } from "../../lib/auth";
import { queueEmailNotification } from "../../lib/email";
import {
  captureLeadSubmission,
  markLeadConverted,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { trackProductAnalyticsEvent } from "../../lib/product-analytics";
import { getRevenuePlanDefinition } from "../../lib/revenue-catalog";
import { getAppUrl } from "../../lib/runtime-config";
import {
  ensureDefaultFrameworkCatalog,
  ensureUniqueOrganizationSlug,
  slugifyOrganizationName
} from "../../lib/organization";

const DEFAULT_FRAMEWORK_CODES = ["soc2", "hipaa", "nist-csf"];
const DEFAULT_ASSESSMENT_SECTIONS = [
  { key: "company-profile", title: "Company Profile" },
  { key: "ai-usage", title: "AI Usage Inventory" },
  { key: "data-handling", title: "Data Handling & Privacy" },
  { key: "controls-and-policies", title: "Controls & Policies" }
];

export async function completeOnboardingAction(formData: FormData) {
  const session = await requireCurrentSession();
  const accountName = String(formData.get("accountName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const sizeBand = String(formData.get("sizeBand") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const aiUsageSummary = String(formData.get("aiUsageSummary") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const selectedFrameworkCodes = formData
    .getAll("frameworkCodes")
    .map((value) => String(value))
    .filter(Boolean);
  const firstAssessmentName = String(
    formData.get("firstAssessmentName") ?? ""
  ).trim();
  const requestedPlanCode = String(formData.get("planCode") ?? "").trim();
  const leadSource = String(formData.get("leadSource") ?? "").trim();
  const leadIntent = String(formData.get("leadIntent") ?? "").trim();
  const leadPlanCode = String(formData.get("leadPlanCode") ?? "").trim();
  const sourcePath = String(formData.get("sourcePath") ?? "").trim() || "/onboarding";
  const selectedPlanCode = getRevenuePlanDefinition(requestedPlanCode)
    ? requestedPlanCode
    : "";

  if (!accountName) {
    redirect("/onboarding?error=missing-account");
  }

  const frameworkCodes =
    selectedFrameworkCodes.length > 0
      ? selectedFrameworkCodes
      : DEFAULT_FRAMEWORK_CODES;
  const completedAt = new Date();
  const requestContext = await getServerAuditRequestContext();
  const attribution = await readLeadAttributionFromCookies();

  await ensureDefaultPlans();
  await ensureDefaultFrameworkCatalog();

  const organizationSlug = session.organization
    ? null
    : await ensureUniqueOrganizationSlug(slugifyOrganizationName(accountName));
  const frameworks = await prisma.framework.findMany({
    where: {
      code: {
        in: frameworkCodes
      }
    }
  });

  await prisma.$transaction(async (tx) => {
    const organization = session.organization
      ? await tx.organization.update({
          where: { id: session.organization.id },
          data: {
            name: accountName,
            industry: industry || null,
            sizeBand: sizeBand || null,
            country: country || null,
            aiUsageSummary: aiUsageSummary || null,
            onboardingCompletedAt: completedAt,
            regulatoryProfile: {
              frameworks: frameworkCodes
            }
          }
        })
      : await tx.organization.create({
          data: {
            name: accountName,
            slug: organizationSlug!,
            industry: industry || null,
            sizeBand: sizeBand || null,
            country: country || null,
            aiUsageSummary: aiUsageSummary || null,
            onboardingCompletedAt: completedAt,
            createdByUserId: session.user.id,
            regulatoryProfile: {
              frameworks: frameworkCodes
            }
          }
        });

    const existingMembership = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: session.user.id
        }
      }
    });

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: session.user.id
        }
      },
      update: {
        role: UserRole.OWNER
      },
      create: {
        organizationId: organization.id,
        userId: session.user.id,
        role: UserRole.OWNER
      }
    });

    await tx.organizationFramework.deleteMany({
      where: { organizationId: organization.id }
    });

    if (frameworks.length > 0) {
      await tx.organizationFramework.createMany({
        data: frameworks.map((framework) => ({
          organizationId: organization.id,
          frameworkId: framework.id
        })),
        skipDuplicates: true
      });
    }

    await tx.user.update({
      where: { id: session.user.id },
      data: {
        onboardingCompletedAt: completedAt
      }
    });

    if (password.length >= 10) {
      await tx.passwordCredential.upsert({
        where: { userId: session.user.id },
        update: {
          passwordHash: hashPassword(password),
          passwordUpdatedAt: completedAt
        },
        create: {
          userId: session.user.id,
          passwordHash: hashPassword(password)
        }
      });
    }

    const existingSubscription = await tx.subscription.findFirst({
      where: { organizationId: organization.id }
    });

    if (!existingSubscription) {
      await createTrialSubscription(organization.id, {
        db: tx,
        userId: session.user.id,
        planCode: selectedPlanCode || undefined,
        actorLabel: session.user.email,
        requestContext
      });
    }

    if (firstAssessmentName) {
      const existingAssessment = await tx.assessment.findFirst({
        where: {
          organizationId: organization.id,
          name: firstAssessmentName
        }
      });

      if (!existingAssessment) {
        await tx.assessment.create({
          data: {
            organizationId: organization.id,
            createdByUserId: session.user.id,
            name: firstAssessmentName,
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
      }
    }

    await tx.notification.deleteMany({
      where: {
        organizationId: organization.id,
        type: "onboarding_completed"
      }
    });

    await tx.notification.create({
      data: {
        organizationId: organization.id,
        type: "onboarding_completed",
        title: "Workspace ready",
        body: firstAssessmentName
          ? `Your workspace is live and "${firstAssessmentName}" is ready for intake.`
          : "Your workspace is live. Create your first assessment to begin."
      }
    });

    const events = [];

    if (!session.organization) {
      events.push({
        type: "org.created",
        aggregateType: "organization",
        aggregateId: organization.id,
        orgId: organization.id,
        userId: session.user.id,
        idempotencyKey: `org.created:${organization.id}`,
        occurredAt: completedAt,
        payload: {
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          industry: organization.industry,
          sizeBand: organization.sizeBand,
          country: organization.country
        } satisfies Prisma.InputJsonValue
      });

      events.push({
        type: "onboarding.started",
        aggregateType: "organization",
        aggregateId: organization.id,
        orgId: organization.id,
        userId: session.user.id,
        idempotencyKey: `onboarding.started:${organization.id}`,
        occurredAt: completedAt,
        payload: {
          organizationId: organization.id,
          userId: session.user.id,
          organizationName: organization.name,
          source: "self-serve-onboarding"
        } satisfies Prisma.InputJsonValue
      });
    }

    if (!existingMembership) {
      events.push({
        type: "membership.added",
        aggregateType: "organizationMember",
        aggregateId: `${organization.id}:${session.user.id}`,
        orgId: organization.id,
        userId: session.user.id,
        idempotencyKey: `membership.added:${organization.id}:${session.user.id}`,
        occurredAt: completedAt,
        payload: {
          organizationId: organization.id,
          userId: session.user.id,
          role: UserRole.OWNER,
          source: "onboarding"
        } satisfies Prisma.InputJsonValue
      });
    }

    events.push({
      type: "onboarding.completed",
      aggregateType: "organization",
      aggregateId: organization.id,
      orgId: organization.id,
      userId: session.user.id,
      idempotencyKey: `onboarding.completed:${organization.id}`,
      occurredAt: completedAt,
      payload: {
        organizationId: organization.id,
        userId: session.user.id,
        frameworkCodes,
        firstAssessmentName: firstAssessmentName || null
      } satisfies Prisma.InputJsonValue
    });

    if (events.length > 0) {
      await publishDomainEvents(tx, events);
    }

    const leadCapture = await captureLeadSubmission(
      {
        source: "onboarding_completion",
        email: session.user.email,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        companyName: accountName,
        teamSize: sizeBand || null,
        intent: leadIntent || "self-serve-onboarding",
        sourcePath,
        requestedPlanCode: leadPlanCode || selectedPlanCode || null,
        pricingContext: leadSource || null,
        userId: session.user.id,
        organizationId: organization.id,
        attribution,
        payload: {
          industry: industry || null,
          country: country || null,
          frameworkCodes,
          firstAssessmentName: firstAssessmentName || null
        },
        actorLabel: session.user.email,
        requestContext
      },
      tx
    );

    if (!leadCapture.deduped) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "funnel.lead_captured",
        payload: {
          source: "onboarding_completion",
          intent: leadIntent || "self-serve-onboarding",
          requestedPlanCode: leadPlanCode || selectedPlanCode || null,
          companyName: accountName,
          deduped: false
        },
        source: "onboarding",
        path: sourcePath,
        session,
        organizationId: organization.id,
        userId: session.user.id,
        attribution,
        billingPlanCode: leadPlanCode || selectedPlanCode || null
      });
    }

    await markLeadConverted({
      email: session.user.email,
      organizationId: organization.id,
      userId: session.user.id,
      requestedPlanCode: leadPlanCode || selectedPlanCode || null,
      actorLabel: session.user.email,
      requestContext,
      db: tx
    });

    if (!session.organization) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "signup.completed",
        payload: {
          organizationId: organization.id,
          requestedPlanCode: leadPlanCode || selectedPlanCode || null
        },
        source: "onboarding",
        path: sourcePath,
        session,
        organizationId: organization.id,
        userId: session.user.id,
        attribution,
        billingPlanCode: leadPlanCode || selectedPlanCode || null
      });
    }

    await trackProductAnalyticsEvent({
      db: tx,
      name: "onboarding.completed",
      payload: {
        organizationId: organization.id,
        frameworkCount: frameworkCodes.length,
        requestedPlanCode: leadPlanCode || selectedPlanCode || null
      },
      source: "onboarding",
      path: sourcePath,
      session,
      organizationId: organization.id,
      userId: session.user.id,
      attribution,
      billingPlanCode: leadPlanCode || selectedPlanCode || null
    });

    await writeAuditLog(tx, {
      organizationId: organization.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "onboarding.completed",
      entityType: "organization",
      entityId: organization.id,
      metadata: {
        frameworkCodes,
        firstAssessmentName: firstAssessmentName || null
      },
      requestContext
    });

    await queueEmailNotification(tx, {
      templateKey: "welcome",
      recipientEmail: session.user.email,
        recipientName: session.user.firstName,
        orgId: organization.id,
        userId: session.user.id,
        idempotencyKey: `email:welcome:${organization.id}:${session.user.id}`,
        payload: {
          organizationName: organization.name,
          firstAssessmentName: firstAssessmentName || null,
          dashboardUrl: `${getAppUrl()}/dashboard`
        }
      });

    await syncOrganizationCustomerAccount(organization.id, {
      db: tx,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      reason: "Onboarding completion synced the operator lifecycle control plane."
    });
  });

  redirect("/dashboard");
}
