import type { Prisma } from "@evolve-edge/db";
import { prisma } from "@evolve-edge/db";

export class OrganizationScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationScopeError";
  }
}

export function assertOrgScope(
  orgId: string | null | undefined,
  context = "query"
): asserts orgId is string {
  if (typeof orgId !== "string" || orgId.trim().length === 0) {
    throw new OrganizationScopeError(`Missing orgId scope for ${context}.`);
  }
}

export function withOrgScope<T extends Record<string, unknown>>(
  orgId: string | null | undefined,
  where: T,
  context = "query"
) {
  assertOrgScope(orgId, context);

  return {
    ...where,
    organizationId: orgId
  };
}

export async function requireActiveOrganization(
  organizationId: string,
  db: Pick<typeof prisma, "organization"> = prisma
) {
  const organization = await db.organization.findFirst({
    where: {
      id: organizationId,
      deletedAt: null
    },
    select: {
      id: true,
      archivedAt: true,
      deletedAt: true
    }
  });

  if (!organization) {
    throw new OrganizationScopeError("Organization was not found or has been deleted.");
  }

  if (organization.archivedAt) {
    throw new OrganizationScopeError("Organization is archived.");
  }

  return organization;
}

export async function softDeleteOrganizationData(input: {
  organizationId: string;
  actorUserId?: string | null;
  db?: typeof prisma;
}) {
  assertOrgScope(input.organizationId, "organization deletion");
  const db = input.db ?? prisma;
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: input.organizationId },
      data: {
        archivedAt: now,
        deletedAt: now
      }
    });

    await tx.session.updateMany({
      where: {
        user: {
          memberships: {
            some: {
              organizationId: input.organizationId
            }
          }
        },
        revokedAt: null
      },
      data: {
        revokedAt: now,
        revokedReason: "organization_deleted"
      }
    });
  });

  return {
    organizationId: input.organizationId,
    deletedAt: now
  };
}
