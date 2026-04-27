"use server";

import {
  Prisma,
  hashPassword,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import { publishDomainEvent } from "../../lib/domain-events";
import {
  dispatchPendingEmailNotifications,
  queueEmailNotification
} from "../../lib/email";
import {
  getCanonicalCommercialPlanDefinition,
  resolvePublicCanonicalPlanCode
} from "../../lib/commercial-catalog";
import {
  buildPricingAccessSignInPath,
  generatePricingAccessTemporaryPassword,
  shouldIssuePricingAccessCredentials
} from "../../lib/pricing-access";
import {
  captureLeadSubmission,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { getAppUrl } from "../../lib/runtime-config";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildStartRedirect(input: {
  planCode: string;
  error?: string;
  submitted?: string;
  delivery?: string;
}) {
  const searchParams = new URLSearchParams({
    plan: input.planCode
  });

  if (input.error) {
    searchParams.set("error", input.error);
  }

  if (input.submitted) {
    searchParams.set("submitted", input.submitted);
  }

  if (input.delivery) {
    searchParams.set("delivery", input.delivery);
  }

  return `/start?${searchParams.toString()}`;
}

export async function requestPricingAccessAction(formData: FormData) {
  const planCode = resolvePublicCanonicalPlanCode(String(formData.get("planCode") ?? ""));
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const companyName = String(formData.get("companyName") ?? "").trim();

  if (!planCode || planCode === "enterprise") {
    redirect("/pricing");
  }

  if (!email || !companyName) {
    redirect(buildStartRedirect({ planCode, error: "missing-required" }));
  }

  const plan = getCanonicalCommercialPlanDefinition(planCode);
  if (!plan) {
    redirect("/pricing");
  }

  const requestContext = await getServerAuditRequestContext();
  const attribution = await readLeadAttributionFromCookies();
  const appUrl = getAppUrl();
  const requestSuffix =
    typeof (requestContext as Record<string, unknown> | null | undefined)?.requestId === "string"
      ? ((requestContext as Record<string, unknown>).requestId as string)
      : Date.now().toString();

  let deliveryMode: "guide-only" | "guide-and-credentials" = "guide-only";

  await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { email },
      include: {
        passwordCredential: true,
        memberships: {
          select: {
            organizationId: true
          }
        }
      }
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          email,
          firstName: firstName || null,
          lastName: lastName || null
        },
        include: {
          passwordCredential: true,
          memberships: {
            select: {
              organizationId: true
            }
          }
        }
      });

      await publishDomainEvent(tx, {
        type: "user.created",
        aggregateType: "user",
        aggregateId: user.id,
        userId: user.id,
        idempotencyKey: `user.created:${user.id}`,
        payload: {
          userId: user.id,
          email: user.email,
          source: "pricing-access"
        } satisfies Prisma.InputJsonValue
      });
    } else if ((!user.firstName && firstName) || (!user.lastName && lastName)) {
      user = await tx.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName ?? (firstName || null),
          lastName: user.lastName ?? (lastName || null)
        },
        include: {
          passwordCredential: true,
          memberships: {
            select: {
              organizationId: true
            }
          }
        }
      });
    }

    const hasWorkspaceAccess = user.memberships.length > 0;
    const shouldIssueCredentials = shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess,
      hasPasswordCredential: Boolean(user.passwordCredential)
    });
    const signInPath = buildPricingAccessSignInPath({
      planCode,
      hasWorkspaceAccess
    });
    const signInUrl = `${appUrl}${signInPath}`;

    let temporaryPassword: string | null = null;
    if (shouldIssueCredentials) {
      temporaryPassword = generatePricingAccessTemporaryPassword();

      await tx.passwordCredential.upsert({
        where: { userId: user.id },
        update: {
          passwordHash: hashPassword(temporaryPassword),
          passwordUpdatedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null
        },
        create: {
          userId: user.id,
          passwordHash: hashPassword(temporaryPassword)
        }
      });
    }

    const leadCapture = await captureLeadSubmission(
      {
        source: "pricing_plan_selection",
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        companyName,
        intent: "launch-pricing",
        sourcePath: `/start?plan=${planCode}`,
        requestedPlanCode: planCode,
        pricingContext: "pricing-start",
        userId: user.id,
        attribution,
        actorLabel: email,
        requestContext,
        payload: {
          companyName,
          planCode,
          planName: plan.displayName
        } satisfies Prisma.InputJsonValue
      },
      tx
    );

    await queueEmailNotification(tx, {
      templateKey: "pricing-access-guide",
      recipientEmail: email,
      recipientName: firstName || null,
      userId: user.id,
      eventId: leadCapture.eventId,
      idempotencyKey: `email:pricing-access-guide:${user.id}:${planCode}:${requestSuffix}`,
      payload: {
        companyName,
        planName: plan.displayName,
        signInUrl,
        credentialsIssued: shouldIssueCredentials,
        nextStep: hasWorkspaceAccess
          ? "Sign in and open your workspace. Your team already has app access, so we will not reset an active password."
          : "Sign in and continue the guided onboarding flow to create your workspace, confirm the selected plan, and launch the first assessment."
      }
    });

    if (temporaryPassword) {
      deliveryMode = "guide-and-credentials";
      await queueEmailNotification(tx, {
        templateKey: "pricing-access-credentials",
        recipientEmail: email,
        recipientName: firstName || null,
        userId: user.id,
        eventId: leadCapture.eventId,
        idempotencyKey: `email:pricing-access-credentials:${user.id}:${planCode}:${requestSuffix}`,
        payload: {
          loginEmail: email,
          temporaryPassword,
          signInUrl
        }
      });
    }

    await writeAuditLog(tx, {
      userId: user.id,
      actorLabel: email,
      action: "pricing.access_requested",
      entityType: "user",
      entityId: user.id,
      metadata: {
        companyName,
        planCode,
        leadId: leadCapture.lead.id,
        hasWorkspaceAccess,
        credentialsIssued: Boolean(temporaryPassword)
      },
      requestContext
    });
  });

  try {
    await dispatchPendingEmailNotifications({ limit: 10 });
  } catch (error) {
    console.error("[pricing-access] Failed to dispatch queued pricing access emails.", error);
  }

  redirect(
    buildStartRedirect({
      planCode,
      submitted: "1",
      delivery: deliveryMode
    })
  );
}
