"use server";

import { MonitoringFindingStatus, prisma } from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requireOrganizationPermission } from "../../../lib/auth";
import { updateMonitoringFindingStatus } from "../../../lib/continuous-monitoring";
import { requireEntitlement } from "../../../lib/entitlements";

function parseMonitoringFindingStatus(value: string): MonitoringFindingStatus {
  if (
    value === MonitoringFindingStatus.OPEN ||
    value === MonitoringFindingStatus.ACCEPTED ||
    value === MonitoringFindingStatus.IN_REMEDIATION ||
    value === MonitoringFindingStatus.RESOLVED ||
    value === MonitoringFindingStatus.DEFERRED
  ) {
    return value;
  }

  throw new Error("Invalid monitoring finding status.");
}

export async function updateMonitoringFindingStatusAction(formData: FormData) {
  const session = await requireOrganizationPermission("findings.manage");
  await requireEntitlement(session.organization!.id, "monitoring.manage", {
    failureRedirect: "/dashboard/monitoring?error=plan"
  });
  const organizationId = session.organization!.id;
  const monitoringFindingId = String(formData.get("monitoringFindingId") ?? "");
  const status = parseMonitoringFindingStatus(String(formData.get("status") ?? ""));
  const remediationNotes = String(formData.get("remediationNotes") ?? "");
  const acceptedReason = String(formData.get("acceptedReason") ?? "");
  const ownerRole = String(formData.get("ownerRole") ?? "");
  const deferredUntilValue = String(formData.get("deferredUntil") ?? "");
  const deferredUntil = deferredUntilValue ? new Date(deferredUntilValue) : null;

  await prisma.$transaction(async (tx) => {
    const updated = await updateMonitoringFindingStatus({
      db: tx,
      organizationId,
      monitoringFindingId,
      actorUserId: session.user.id,
      status,
      remediationNotes,
      acceptedReason,
      ownerRole,
      deferredUntil
    });

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "monitoring.finding_status_updated",
      entityType: "monitoringFinding",
      entityId: updated.id,
      metadata: {
        status: updated.status,
        ownerRole: updated.ownerRole
      },
      requestContext: await getServerAuditRequestContext()
    });
  });

  redirect("/dashboard/monitoring?updated=1" as never);
}
