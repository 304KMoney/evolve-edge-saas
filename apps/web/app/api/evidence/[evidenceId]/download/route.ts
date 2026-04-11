import { AuditActorType, prisma } from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../../lib/audit";
import { requireOrganizationPermission } from "../../../../../lib/auth";
import { getEvidenceDownloadPayload } from "../../../../../lib/evidence";

export const dynamic = "force-dynamic";

function buildContentDisposition(fileName: string) {
  const sanitized = fileName.replace(/["\r\n]/g, "");
  return `attachment; filename="${sanitized}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ evidenceId: string }> }
) {
  const session = await requireOrganizationPermission("evidence.view");
  const { evidenceId } = await params;
  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId");
  const payload = await getEvidenceDownloadPayload({
    organizationId: session.organization!.id,
    evidenceFileId: evidenceId,
    versionId
  });

  if (!payload) {
    return new Response("Evidence file not found.", { status: 404 });
  }

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorType: AuditActorType.USER,
    actorLabel: session.user.email,
    action: "evidence.downloaded",
    entityType: "evidenceFile",
    entityId: payload.evidence.id,
    metadata: {
      versionId: versionId ?? null,
      fileName: payload.fileName
    },
    requestContext: await getServerAuditRequestContext()
  });

  return new Response(payload.stream, {
    headers: {
      "content-type": payload.mimeType,
      "content-disposition": buildContentDisposition(payload.fileName),
      "cache-control": "private, no-store"
    }
  });
}
