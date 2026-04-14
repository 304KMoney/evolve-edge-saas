import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  AuditActorType,
  Prisma,
  ProvisioningStatus,
  SubscriptionStatus,
  UserRole,
  hashOpaqueToken,
  prisma
} from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import { createTrialSubscription, ensureDefaultPlans, upsertSubscriptionFromStripe } from "./billing";
import { publishDomainEvents } from "./domain-events";
import { getAppUrl, requireEnv } from "./runtime-config";
import { ensureUniqueOrganizationSlug, slugifyOrganizationName } from "./organization";

type ProvisioningDbClient = Prisma.TransactionClient | typeof prisma;

export type ProvisionOrgInput = {
  sourceSystem: string;
  externalReferenceId: string;
  companyName: string;
  primaryContactEmail: string;
  planCode?: string | null;
  crmAccountId?: string | null;
  // Deal ids are accepted as CRM/operator reference metadata only. They must
  // not become the source of truth for provisioning eligibility, billing,
  // entitlements, routing, or delivery decisions.
  crmDealId?: string | null;
  workspaceMetadata?: Prisma.InputJsonValue;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  subscriptionStatus?: SubscriptionStatus;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function requireProvisioningApiToken() {
  return requireEnv("PROVISION_ORG_API_TOKEN");
}

export function isProvisioningAuthorized(request: Request) {
  const expected = requireProvisioningApiToken();
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!provided || provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function normalizeMetadata(
  value: Prisma.InputJsonValue | undefined
): Prisma.InputJsonValue {
  if (value === undefined) {
    return {};
  }

  return value;
}

async function createPendingOwnerInvite(
  db: ProvisioningDbClient,
  organizationId: string,
  email: string
) {
  const token = randomBytes(32).toString("base64url");

  await db.organizationInvite.updateMany({
    where: {
      organizationId,
      email,
      status: "PENDING"
    },
    data: {
      status: "REVOKED"
    }
  });

  const invite = await db.organizationInvite.create({
    data: {
      organizationId,
      email,
      role: UserRole.OWNER,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });

  return {
    invite,
    inviteUrl: `${getAppUrl()}/invite/${token}`
  };
}

// External provisioning should be the only route used by sales/ops automations.
// It is idempotent by sourceSystem + externalReferenceId and is safe to replay
// without creating duplicate organizations or subscriptions.
export async function provisionOrganizationFromExternalTrigger(
  input: ProvisionOrgInput
) {
  const sourceSystem = input.sourceSystem.trim().toLowerCase();
  const externalReferenceId = input.externalReferenceId.trim();
  const companyName = input.companyName.trim();
  const primaryContactEmail = normalizeEmail(input.primaryContactEmail);
  const planCode = input.planCode?.trim() || null;

  if (!sourceSystem || !externalReferenceId || !companyName || !primaryContactEmail) {
    throw new Error(
      "sourceSystem, externalReferenceId, companyName, and primaryContactEmail are required."
    );
  }

  await ensureDefaultPlans();
  const organizationSlug = await ensureUniqueOrganizationSlug(
    slugifyOrganizationName(companyName)
  );

  const existingRequest = await prisma.provisioningRequest.findUnique({
    where: {
      sourceSystem_externalReferenceId: {
        sourceSystem,
        externalReferenceId
      }
    },
    include: {
      organization: true
    }
  });

  if (existingRequest?.status === ProvisioningStatus.PROVISIONED) {
    return {
      requestId: existingRequest.id,
      organizationId: existingRequest.organizationId,
      organizationSlug: existingRequest.organization?.slug ?? null,
      ownerUserId: existingRequest.ownerUserId,
      ownerInviteId: existingRequest.ownerInviteId,
      inviteUrl: null,
      status: existingRequest.status,
      idempotentReplay: true
    };
  }

  const requestRecord =
    existingRequest ??
    (await prisma.provisioningRequest.create({
      data: {
        sourceSystem,
        externalReferenceId,
        primaryContactEmail,
        planCode,
        crmAccountId: input.crmAccountId?.trim() || null,
        crmDealId: input.crmDealId?.trim() || null,
        payload: {
          companyName,
          primaryContactEmail,
          planCode,
          crmAccountId: input.crmAccountId?.trim() || null,
          crmDealId: input.crmDealId?.trim() || null,
          workspaceMetadata: normalizeMetadata(input.workspaceMetadata)
        }
      }
    }));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdAt = new Date();
      const organization =
        requestRecord.organizationId
          ? await tx.organization.findUnique({
              where: { id: requestRecord.organizationId }
            })
          : null;
      const activeOrganization =
        organization ??
        (await tx.organization.create({
          data: {
            name: companyName,
            slug: organizationSlug,
            onboardingCompletedAt: null,
            regulatoryProfile: {
              provisioning: {
                sourceSystem,
                externalReferenceId,
                crmAccountId: input.crmAccountId?.trim() || null,
                crmDealId: input.crmDealId?.trim() || null
              },
              workspaceMetadata: normalizeMetadata(input.workspaceMetadata)
            }
          }
        }));

      const existingUser = await tx.user.findUnique({
        where: { email: primaryContactEmail }
      });
      const createdUser = !existingUser;
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email: primaryContactEmail
          }
        }));

      const existingMembership = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: activeOrganization.id,
            userId: user.id
          }
        }
      });

      const ownerInvite = existingMembership
        ? null
        : await createPendingOwnerInvite(tx, activeOrganization.id, primaryContactEmail);

      const latestSubscription = await tx.subscription.findFirst({
        where: { organizationId: activeOrganization.id },
        orderBy: { createdAt: "desc" }
      });

      let subscriptionId: string | null = latestSubscription?.id ?? null;

      if (input.stripeCustomerId && input.stripeSubscriptionId) {
        const stripeSubscription = await upsertSubscriptionFromStripe({
          db: tx,
          organizationId: activeOrganization.id,
          stripeCustomerId: input.stripeCustomerId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripePriceId: input.stripePriceId ?? null,
          fallbackPlanCode: planCode,
          status: input.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
          auditActorType: AuditActorType.INTERNAL_API,
          auditActorLabel: sourceSystem
        });
        subscriptionId = stripeSubscription.id;
      } else if (!latestSubscription) {
        const trialSubscription = await createTrialSubscription(activeOrganization.id, {
          db: tx,
          planCode,
          actorType: AuditActorType.INTERNAL_API,
          actorLabel: sourceSystem
        });
        subscriptionId = trialSubscription.id;
      }

      const events = [];

      if (!organization) {
        events.push({
          type: "org.created",
          aggregateType: "organization",
          aggregateId: activeOrganization.id,
          orgId: activeOrganization.id,
          idempotencyKey: `org.created:${activeOrganization.id}`,
          occurredAt: createdAt,
          payload: {
            organizationId: activeOrganization.id,
            name: activeOrganization.name,
            slug: activeOrganization.slug,
            sourceSystem,
            externalReferenceId
          } satisfies Prisma.InputJsonValue
        });
      }

      if (createdUser) {
        events.push({
          type: "user.created",
          aggregateType: "user",
          aggregateId: user.id,
          userId: user.id,
          idempotencyKey: `user.created:${user.id}`,
          occurredAt: createdAt,
          payload: {
            userId: user.id,
            email: user.email,
            source: "internal-provisioning"
          } satisfies Prisma.InputJsonValue
        });
      }

      if (events.length > 0) {
        await publishDomainEvents(tx, events);
      }

      await writeAuditLog(tx, {
        organizationId: activeOrganization.id,
        userId: user.id,
        actorType: AuditActorType.INTERNAL_API,
        actorLabel: sourceSystem,
        action: "org.provisioned",
        entityType: "organization",
        entityId: activeOrganization.id,
        metadata: {
          externalReferenceId,
          crmAccountId: input.crmAccountId?.trim() || null,
          crmDealId: input.crmDealId?.trim() || null,
          subscriptionId
        }
      });

      const updatedRequest = await tx.provisioningRequest.update({
        where: { id: requestRecord.id },
        data: {
          organizationId: activeOrganization.id,
          ownerUserId: user.id,
          ownerInviteId: ownerInvite?.invite.id ?? null,
          planCode,
          crmAccountId: input.crmAccountId?.trim() || null,
          crmDealId: input.crmDealId?.trim() || null,
          status: ProvisioningStatus.PROVISIONED,
          processedAt: createdAt,
          failedAt: null,
          lastError: null,
          payload: {
            companyName,
            primaryContactEmail,
            planCode,
            crmAccountId: input.crmAccountId?.trim() || null,
            crmDealId: input.crmDealId?.trim() || null,
            workspaceMetadata: normalizeMetadata(input.workspaceMetadata),
            stripeCustomerId: input.stripeCustomerId ?? null,
            stripeSubscriptionId: input.stripeSubscriptionId ?? null,
            stripePriceId: input.stripePriceId ?? null
          }
        }
      });

      return {
        requestId: updatedRequest.id,
        organizationId: activeOrganization.id,
        organizationSlug: activeOrganization.slug,
        ownerUserId: user.id,
        ownerInviteId: ownerInvite?.invite.id ?? null,
        inviteUrl: ownerInvite?.inviteUrl ?? null,
        subscriptionId,
        status: updatedRequest.status,
        idempotentReplay: false
      };
    });

    return result;
  } catch (error) {
    await prisma.provisioningRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: ProvisioningStatus.FAILED,
        failedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    });

    throw error;
  }
}
