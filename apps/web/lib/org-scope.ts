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
  const organization = await db.organization.findUnique({
    where: {
      id: organizationId
    },
    select: {
      id: true
    }
  });

  if (!organization) {
    throw new OrganizationScopeError("Organization was not found.");
  }

  return organization;
}

export async function softDeleteOrganizationData(input: {
  organizationId: string;
  actorUserId?: string | null;
  db?: typeof prisma;
}) {
  assertOrgScope(input.organizationId, "organization deletion");
  void input;
  throw new OrganizationScopeError(
    "Organization soft deletion is not supported by the current schema."
  );
}
