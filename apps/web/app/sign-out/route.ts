import { AUTH_SESSION_COOKIE, revokeSession } from "../../lib/auth";
import { buildAuditRequestContextFromRequest, writeAuditLog } from "../../lib/audit";
import { getRuntimeEnvironment } from "../../lib/runtime-config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hashOpaqueToken, prisma } from "@evolve-edge/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  const dbSession = token
    ? await prisma.session.findFirst({
        where: {
          tokenHash: hashOpaqueToken(token)
        },
        include: {
          user: true
        }
      })
    : null;

  await revokeSession(token);

  if (dbSession) {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: dbSession.userId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" }
    });

    await writeAuditLog(prisma, {
      organizationId: membership?.organizationId ?? null,
      userId: dbSession.userId,
      actorLabel: dbSession.user.email,
      action: "auth.sign_out",
      entityType: "session",
      entityId: dbSession.id,
      requestContext: buildAuditRequestContextFromRequest(request)
    });
  }

  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getRuntimeEnvironment() === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
