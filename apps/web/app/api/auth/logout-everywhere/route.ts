import { NextResponse } from "next/server";
import { AuditActorType, prisma } from "@evolve-edge/db";
import { AUTH_SESSION_COOKIE, requireCurrentSession } from "../../../../lib/auth";
import { writeAuditLog, buildAuditRequestContextFromRequest } from "../../../../lib/audit";
import { cookies } from "next/headers";
import { enforceTrustedOrigin } from "../../../../lib/route-security";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";

export async function POST(request: Request) {
  const invalidOrigin = enforceTrustedOrigin(request);
  if (invalidOrigin) {
    return invalidOrigin;
  }

  const rateLimited = await applyRouteRateLimit(request, {
    key: "auth-logout-everywhere",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const session = await requireCurrentSession({ requireOrganization: true });
  await prisma.session.deleteMany({
    where: {
      userId: session.user.id
    }
  });

  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);

  await writeAuditLog(prisma, {
    organizationId: session.organization?.id ?? null,
    userId: session.user.id,
    actorType: AuditActorType.USER,
    actorLabel: session.user.email,
    action: "auth.logout_everywhere",
    entityType: "user",
    entityId: session.user.id,
    requestContext: buildAuditRequestContextFromRequest(request)
  });

  return NextResponse.json({ ok: true });
}
