import { Prisma, AuditActorType, DataClassification, prisma } from "@evolve-edge/db";
import { headers } from "next/headers";

type AuditDbClient = Prisma.TransactionClient | typeof prisma;

type AuditRequestContext = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  host: string | null;
  path: string | null;
};

type AuditLogInput = {
  organizationId?: string | null;
  userId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  dataClassification?: DataClassification | null;
  metadata?: Prisma.InputJsonValue;
  requestContext?: Prisma.InputJsonValue | null;
};

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 512) : null;
}

function readRequestIdFromHeaders(headersLike: {
  get(name: string): string | null;
}) {
  return (
    trimOrNull(headersLike.get("x-request-id")) ??
    trimOrNull(headersLike.get("x-correlation-id")) ??
    trimOrNull(headersLike.get("x-vercel-id"))
  );
}

export async function getServerAuditRequestContext(): Promise<Prisma.InputJsonValue> {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get("x-forwarded-for");
    const pathname =
      requestHeaders.get("x-invoke-path") ??
      requestHeaders.get("next-url") ??
      requestHeaders.get("x-pathname");

    const context: AuditRequestContext = {
      requestId: readRequestIdFromHeaders(requestHeaders),
      ipAddress: trimOrNull(
        forwardedFor ? forwardedFor.split(",")[0] ?? null : null
      ),
      userAgent: trimOrNull(requestHeaders.get("user-agent")),
      referer: trimOrNull(requestHeaders.get("referer")),
      host: trimOrNull(requestHeaders.get("host")),
      path: trimOrNull(pathname)
    };

    return context;
  } catch {
    return {
      requestId: null,
      ipAddress: null,
      userAgent: null,
      referer: null,
      host: null,
      path: null
    } satisfies AuditRequestContext;
  }
}

export function buildAuditRequestContextFromRequest(
  request: Request,
  pathOverride?: string | null
): Prisma.InputJsonValue {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return {
    requestId: readRequestIdFromHeaders(request.headers),
    ipAddress: trimOrNull(
      forwardedFor ? forwardedFor.split(",")[0] ?? null : null
    ),
    userAgent: trimOrNull(request.headers.get("user-agent")),
    referer: trimOrNull(request.headers.get("referer")),
    host: trimOrNull(request.headers.get("host")),
    path: trimOrNull(pathOverride ?? new URL(request.url).pathname)
  } satisfies AuditRequestContext;
}

export async function writeAuditLog(db: AuditDbClient, input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      actorType: input.actorType ?? AuditActorType.USER,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      resourceType: input.resourceType ?? input.entityType,
      resourceId: input.resourceId ?? input.entityId,
      dataClassification: input.dataClassification ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
      requestContext: input.requestContext ?? Prisma.JsonNull
    }
  });
}
