"use server";

import { AuditActorType, OperationsQueueStatus, prisma } from "@evolve-edge/db";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requirePlatformPermission } from "../../../lib/auth";
import {
  addOperationsQueueNote,
  assignOperationsQueueItem,
  synchronizeOperationsQueues,
  updateOperationsQueueStatus
} from "../../../lib/operations-queues";

function buildQueueHref(queueItemId: string, query?: string) {
  return (`/admin/queues/${queueItemId}${query ?? ""}`) as Route;
}

function buildQueueIndexHref(query?: string) {
  return (`/admin/queues${query ?? ""}`) as Route;
}

function revalidateQueuePaths(queueItemId?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/queues");
  if (queueItemId) {
    revalidatePath(`/admin/queues/${queueItemId}`);
  }
}

function parseQueueStatus(value: string) {
  return Object.values(OperationsQueueStatus).includes(value as OperationsQueueStatus)
    ? (value as OperationsQueueStatus)
    : null;
}

export async function refreshOperationsQueuesAction() {
  const session = await requirePlatformPermission("platform.accounts.manage");
  const result = await synchronizeOperationsQueues();

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queues_refreshed",
    entityType: "operationsQueue",
    entityId: "global",
    metadata: result,
    requestContext: await getServerAuditRequestContext()
  });

  revalidateQueuePaths(null);
  redirect(buildQueueIndexHref("?refreshed=1"));
}

export async function updateOperationsQueueStatusAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.accounts.manage");
  const queueItemId = String(formData.get("queueItemId") ?? "");
  const status = parseQueueStatus(String(formData.get("status") ?? ""));
  const note = String(formData.get("note") ?? "");

  if (!queueItemId || !status) {
    redirect(buildQueueIndexHref("?error=invalid-queue-status"));
  }

  const updated = await updateOperationsQueueStatus({
    queueItemId,
    status,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    note
  });

  await writeAuditLog(prisma, {
    organizationId: updated.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queue_status_updated",
    entityType: "operationsQueueItem",
    entityId: queueItemId,
    metadata: {
      status,
      note: note.trim() || null
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateQueuePaths(queueItemId);
  redirect(buildQueueHref(queueItemId, "?statusUpdated=1"));
}

export async function assignOperationsQueueItemAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.accounts.manage");
  const queueItemId = String(formData.get("queueItemId") ?? "");
  const assignedUserId = String(formData.get("assignedUserId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!queueItemId) {
    redirect(buildQueueIndexHref("?error=missing-queue-item"));
  }

  const updated = await assignOperationsQueueItem({
    queueItemId,
    assignedUserId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    note
  });

  await writeAuditLog(prisma, {
    organizationId: updated.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queue_assigned",
    entityType: "operationsQueueItem",
    entityId: queueItemId,
    metadata: {
      assignedUserId: updated.assignedUserId ?? null,
      note: note.trim() || null
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateQueuePaths(queueItemId);
  redirect(buildQueueHref(queueItemId, "?assignmentUpdated=1"));
}

export async function addOperationsQueueNoteAction(formData: FormData) {
  const session = await requirePlatformPermission("platform.accounts.manage");
  const queueItemId = String(formData.get("queueItemId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!queueItemId || !note.trim()) {
    redirect(buildQueueIndexHref("?error=missing-queue-note"));
  }

  const entry = await addOperationsQueueNote({
    queueItemId,
    note,
    actorUserId: session.user.id,
    actorEmail: session.user.email
  });

  await writeAuditLog(prisma, {
    organizationId: entry.organizationId,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queue_note_added",
    entityType: "operationsQueueItem",
    entityId: queueItemId,
    metadata: {
      noteLength: note.trim().length
    },
    requestContext: await getServerAuditRequestContext()
  });

  revalidateQueuePaths(queueItemId);
  redirect(buildQueueHref(queueItemId, "?noteAdded=1"));
}
