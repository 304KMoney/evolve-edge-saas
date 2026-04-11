"use server";

import { AuditActorType, PlatformUserRole, prisma } from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import { requirePlatformPermission } from "../../lib/auth";
import { isInternalAdminEmail } from "../../lib/authorization";

function parsePlatformRole(value: string): PlatformUserRole {
  switch (value) {
    case PlatformUserRole.NONE:
    case PlatformUserRole.SUPER_ADMIN:
    case PlatformUserRole.OPERATOR:
    case PlatformUserRole.REVIEWER:
    case PlatformUserRole.EXECUTIVE_ADMIN:
      return value;
    default:
      throw new Error("Invalid platform role.");
  }
}

export async function updatePlatformRoleAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.roles.manage");
  const requestContext = await getServerAuditRequestContext();
  const userId = String(formData.get("userId") ?? "");
  const nextRole = parsePlatformRole(String(formData.get("platformRole") ?? "NONE"));

  if (!userId) {
    redirect("/admin?roleError=missing-user");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      platformRole: true
    }
  });

  if (!existingUser) {
    redirect("/admin?roleError=missing-user");
  }

  if (existingUser.platformRole === nextRole) {
    redirect("/admin?roleUpdated=1");
  }

  if (
    existingUser.platformRole === PlatformUserRole.SUPER_ADMIN &&
    nextRole !== PlatformUserRole.SUPER_ADMIN &&
    !isInternalAdminEmail(existingUser.email)
  ) {
    const superAdminCount = await prisma.user.count({
      where: {
        platformRole: PlatformUserRole.SUPER_ADMIN
      }
    });

    if (superAdminCount <= 1) {
      redirect("/admin?roleError=last-super-admin");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        platformRole: nextRole
      }
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "platform.role_updated",
      entityType: "user",
      entityId: existingUser.id,
      metadata: {
        targetEmail: existingUser.email,
        previousRole: existingUser.platformRole,
        nextRole
      },
      requestContext
    });
  });

  redirect("/admin?roleUpdated=1");
}
