import { AuditActorType, prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireAdminSession } from "../../../../lib/auth";
import {
  getKpiDashboardSnapshot,
  parseKpiDashboardFilters,
  serializeKpiSnapshotToCsv
} from "../../../../lib/kpi-dashboard";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  const url = new URL(request.url);
  const filters = parseKpiDashboardFilters({
    preset: url.searchParams.get("preset"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    organizationId: url.searchParams.get("organizationId"),
    stage: url.searchParams.get("stage"),
    engagementType: url.searchParams.get("engagementType"),
    trendGrain: url.searchParams.get("trendGrain")
  });
  const snapshot = await getKpiDashboardSnapshot(filters);

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.kpi_dashboard_exported",
    entityType: "adminKpiDashboard",
    entityId: "global",
    requestContext: await getServerAuditRequestContext(),
    metadata: {
      preset: snapshot.filters.preset,
      from: snapshot.filters.from,
      to: snapshot.filters.to,
      organizationId: snapshot.filters.organizationId,
      stage: snapshot.filters.stage,
      engagementType: snapshot.filters.engagementType,
      trendGrain: snapshot.filters.trendGrain
    }
  });

  const csv = serializeKpiSnapshotToCsv(snapshot);

  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="evolve-edge-kpis-${snapshot.filters.from}-to-${snapshot.filters.to}.csv"`
    }
  });
}
