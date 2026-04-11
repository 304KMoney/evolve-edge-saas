"use server";

import { InviteStatus, Prisma, hashOpaqueToken, prisma } from "@evolve-edge/db";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requireCurrentSession } from "../../../lib/auth";
import { publishDomainEvent } from "../../../lib/domain-events";
import { queueEmailNotification } from "../../../lib/email";
import { getAppUrl } from "../../../lib/runtime-config";

export async function acceptInviteAction(token: string) {
  const session = await requireCurrentSession();
  const requestContext = await getServerAuditRequestContext();

  const invite = await prisma.organizationInvite.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token)
    },
    include: {
      organization: true
    }
  });

  if (
    !invite ||
    invite.status !== InviteStatus.PENDING ||
    invite.expiresAt <= new Date()
  ) {
    redirect(`/invite/${token}?error=invalid` as Route);
  }

  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    redirect(`/invite/${token}?error=email` as Route);
  }

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: session.user.id
        }
      }
    });

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: session.user.id
        }
      },
      update: {
        role: invite.role,
        isBillingAdmin: invite.isBillingAdmin
      },
      create: {
        organizationId: invite.organizationId,
        userId: session.user.id,
        role: invite.role,
        isBillingAdmin: invite.isBillingAdmin
      }
    });

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: {
        status: InviteStatus.ACCEPTED,
        acceptedAt: new Date()
      }
    });

    await tx.user.update({
      where: { id: session.user.id },
      data: {
        onboardingCompletedAt: new Date()
      }
    });

    if (!existingMembership) {
      await publishDomainEvent(tx, {
        type: "membership.added",
        aggregateType: "organizationMember",
        aggregateId: `${invite.organizationId}:${session.user.id}`,
        orgId: invite.organizationId,
        userId: session.user.id,
        idempotencyKey: `membership.added:${invite.organizationId}:${session.user.id}`,
        payload: {
          organizationId: invite.organizationId,
          userId: session.user.id,
          role: invite.role,
          source: "invite.accepted",
          inviteId: invite.id
        } satisfies Prisma.InputJsonValue
      });
    }

    await writeAuditLog(tx, {
      organizationId: invite.organizationId,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "membership.invite_accepted",
      entityType: "organizationInvite",
      entityId: invite.id,
        metadata: {
          invitedRole: invite.role,
          invitedBillingAdmin: invite.isBillingAdmin,
          existingMembership: Boolean(existingMembership)
        },
      requestContext
    });

    await queueEmailNotification(tx, {
      templateKey: "member-joined",
      recipientEmail: session.user.email,
      recipientName: session.user.firstName,
      orgId: invite.organizationId,
      userId: session.user.id,
      idempotencyKey: `email:member-joined:${invite.organizationId}:${session.user.id}`,
      payload: {
        organizationName: invite.organization.name,
        dashboardUrl: `${getAppUrl()}/dashboard`
      }
    });
  });

  redirect("/dashboard");
}
