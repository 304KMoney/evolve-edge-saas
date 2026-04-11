"use server";

import { AuditActorType, EventReplayTargetType, prisma } from "@evolve-edge/db";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requirePlatformPermission } from "../../../lib/auth";
import { requestEventReplay } from "../../../lib/event-replay";
import {
  requireOperatorConfirmation,
  validateOperatorReason
} from "../../../lib/operator-safeguards";

function parseReplayTargetType(value: string) {
  switch (value) {
    case EventReplayTargetType.BILLING_EVENT:
    case EventReplayTargetType.DOMAIN_EVENT:
    case EventReplayTargetType.WEBHOOK_DELIVERY:
      return value;
    default:
      throw new Error("Invalid replay target type.");
  }
}

export async function replayEventAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.jobs.manage");
  const targetType = parseReplayTargetType(String(formData.get("targetType") ?? ""));
  const targetId = String(formData.get("targetId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/replays");
  const requestContext = await getServerAuditRequestContext();
  let reason = "";

  if (!targetId) {
    redirect(`${returnTo}?replayError=missing-target` as Route);
  }

  try {
    reason = validateOperatorReason(formData.get("reason"));
    requireOperatorConfirmation(formData.get("confirmation"), "REPLAY");

    const result = await requestEventReplay({
      targetType,
      targetId,
      userId: session.user.id,
      userEmail: session.user.email,
      reason,
      notes: String(formData.get("notes") ?? "").trim() || null
    });

    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.event_replayed",
      entityType: "eventReplay",
      entityId: result.attemptId,
      metadata: {
        targetType,
        targetId,
        correlationId: result.correlationId,
        reason
      },
      requestContext
    });

    redirect(`${returnTo}?replayed=1` as Route);
  } catch (error) {
    await writeAuditLog(prisma, {
      userId: session.user.id,
      actorType: AuditActorType.ADMIN,
      actorLabel: session.user.email,
      action: "admin.event_replay_failed",
      entityType: "eventReplay",
      entityId: targetId,
      metadata: {
        targetType,
        reason,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      requestContext
    });

    redirect(
      `${returnTo}?replayError=${encodeURIComponent(
        error instanceof Error ? error.message : "Unknown error"
      )}` as Route
    );
  }
}
