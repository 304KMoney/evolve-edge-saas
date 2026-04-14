import {
  AuditActorType,
  DeliveryStateStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";

type DeliveryStateDbClient = Prisma.TransactionClient | typeof prisma;

const STATUS_ORDER: Record<DeliveryStateStatus, number> = {
  [DeliveryStateStatus.PAID]: 10,
  [DeliveryStateStatus.ROUTED]: 20,
  [DeliveryStateStatus.PROCESSING]: 30,
  [DeliveryStateStatus.REPORT_GENERATED]: 40,
  [DeliveryStateStatus.AWAITING_REVIEW]: 50,
  [DeliveryStateStatus.DELIVERED]: 60,
  [DeliveryStateStatus.FAILED]: 100
};

type TransitionInput = {
  db?: DeliveryStateDbClient;
  deliveryStateId?: string;
  sourceSystem?: string;
  sourceEventId?: string;
  organizationId?: string;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string | null;
  toStatus: DeliveryStateStatus;
  reasonCode?: string | null;
  note?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  linkages?: {
    userId?: string | null;
    billingEventId?: string | null;
    routingSnapshotId?: string | null;
    workflowDispatchId?: string | null;
    reportId?: string | null;
    reportPackageId?: string | null;
    externalResultReference?: string | null;
    entitlementsJson?: Prisma.InputJsonValue | null;
    routingHintsJson?: Prisma.InputJsonValue | null;
    statusReasonJson?: Prisma.InputJsonValue | null;
    latestExecutionResultJson?: Prisma.InputJsonValue | null;
    lastError?: string | null;
  };
};

export type DeliveryStateSnapshot = {
  status: DeliveryStateStatus;
  paidAt: Date | null;
  routedAt: Date | null;
  processingAt: Date | null;
  awaitingReviewAt: Date | null;
  reportGeneratedAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
};

function applyStatusTimestamp(
  status: DeliveryStateStatus,
  current: DeliveryStateSnapshot,
  at: Date
): DeliveryStateSnapshot {
  const next = { ...current };

  switch (status) {
    case DeliveryStateStatus.PAID:
      next.paidAt = next.paidAt ?? at;
      break;
    case DeliveryStateStatus.ROUTED:
      next.routedAt = next.routedAt ?? at;
      break;
    case DeliveryStateStatus.PROCESSING:
      next.processingAt = next.processingAt ?? at;
      break;
    case DeliveryStateStatus.REPORT_GENERATED:
      next.reportGeneratedAt = next.reportGeneratedAt ?? at;
      break;
    case DeliveryStateStatus.AWAITING_REVIEW:
      next.awaitingReviewAt = next.awaitingReviewAt ?? at;
      break;
    case DeliveryStateStatus.DELIVERED:
      next.deliveredAt = next.deliveredAt ?? at;
      break;
    case DeliveryStateStatus.FAILED:
      next.failedAt = at;
      break;
  }

  return next;
}

function toNullableJsonInput(
  value: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined
) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

export function applyDeliveryStateTransition(
  currentStatus: DeliveryStateStatus,
  nextStatus: DeliveryStateStatus,
  current: DeliveryStateSnapshot,
  at = new Date()
) {
  if (currentStatus === nextStatus) {
    return {
      changed: false,
      status: currentStatus,
      timestamps: applyStatusTimestamp(nextStatus, current, at)
    };
  }

  if (currentStatus === DeliveryStateStatus.FAILED) {
    return {
      changed: false,
      status: currentStatus,
      timestamps: current
    };
  }

  if (
    nextStatus !== DeliveryStateStatus.FAILED &&
    STATUS_ORDER[nextStatus] < STATUS_ORDER[currentStatus]
  ) {
    return {
      changed: false,
      status: currentStatus,
      timestamps: current
    };
  }

  return {
    changed: true,
    status: nextStatus,
    timestamps: applyStatusTimestamp(nextStatus, current, at)
  };
}

async function findDeliveryState(input: TransitionInput, db: DeliveryStateDbClient) {
  if (input.deliveryStateId) {
    return db.deliveryStateRecord.findUnique({
      where: { id: input.deliveryStateId }
    });
  }

  if (input.linkages?.workflowDispatchId) {
    return db.deliveryStateRecord.findUnique({
      where: { workflowDispatchId: input.linkages.workflowDispatchId }
    });
  }

  if (input.linkages?.routingSnapshotId) {
    return db.deliveryStateRecord.findUnique({
      where: { routingSnapshotId: input.linkages.routingSnapshotId }
    });
  }

  if (input.linkages?.reportPackageId) {
    return db.deliveryStateRecord.findUnique({
      where: { reportPackageId: input.linkages.reportPackageId }
    });
  }

  if (input.linkages?.reportId) {
    return db.deliveryStateRecord.findUnique({
      where: { reportId: input.linkages.reportId }
    });
  }

  if (input.sourceSystem && input.sourceEventId) {
    return db.deliveryStateRecord.findUnique({
      where: {
        sourceSystem_sourceEventId: {
          sourceSystem: input.sourceSystem,
          sourceEventId: input.sourceEventId
        }
      }
    });
  }

  return null;
}

export async function createDeliveryStateFromPaidRequest(input: {
  db?: DeliveryStateDbClient;
  organizationId: string;
  userId?: string | null;
  billingEventId?: string | null;
  sourceSystem: string;
  sourceEventType: string;
  sourceEventId: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  idempotencyKey: string;
  planCode?: Prisma.InputJsonValue | null;
  workflowCode?: Prisma.InputJsonValue | null;
  statusReasonJson?: Prisma.InputJsonValue | null;
}) {
  const db = input.db ?? prisma;
  const existing = await db.deliveryStateRecord.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });

  if (existing) {
    return existing;
  }

  const paidAt = new Date();
  const created = await db.deliveryStateRecord.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      billingEventId: input.billingEventId ?? null,
      sourceSystem: input.sourceSystem,
      sourceEventType: input.sourceEventType,
      sourceEventId: input.sourceEventId,
      sourceRecordType: input.sourceRecordType ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      idempotencyKey: input.idempotencyKey,
      planCode: input.planCode as any,
      workflowCode: input.workflowCode as any,
      statusReasonJson: input.statusReasonJson ?? undefined,
      status: DeliveryStateStatus.PAID,
      paidAt
    }
  });

  await db.deliveryStateTransition.create({
    data: {
      deliveryStateRecordId: created.id,
      organizationId: input.organizationId,
      actorUserId: input.userId ?? null,
      actorType: AuditActorType.WEBHOOK,
      actorLabel: input.sourceSystem,
      fromStatus: null,
      toStatus: DeliveryStateStatus.PAID,
      reasonCode: "payment.confirmed",
      metadata: input.statusReasonJson ?? undefined,
      occurredAt: paidAt
    }
  });

  return created;
}

export async function transitionDeliveryState(input: TransitionInput) {
  const db = input.db ?? prisma;
  const existing = await findDeliveryState(input, db);
  if (!existing) {
    return null;
  }

  const at = new Date();
  const currentSnapshot: DeliveryStateSnapshot = {
    status: existing.status,
    paidAt: existing.paidAt,
    routedAt: existing.routedAt,
    processingAt: existing.processingAt,
    awaitingReviewAt: existing.awaitingReviewAt,
    reportGeneratedAt: existing.reportGeneratedAt,
    deliveredAt: existing.deliveredAt,
    failedAt: existing.failedAt
  };

  const applied = applyDeliveryStateTransition(
    existing.status,
    input.toStatus,
    currentSnapshot,
    at
  );

  const updated = await db.deliveryStateRecord.update({
    where: { id: existing.id },
    data: {
      organizationId: input.organizationId ?? existing.organizationId,
      userId:
        input.linkages?.userId === undefined ? existing.userId : input.linkages.userId,
      billingEventId:
        input.linkages?.billingEventId === undefined
          ? existing.billingEventId
          : input.linkages.billingEventId,
      routingSnapshotId:
        input.linkages?.routingSnapshotId === undefined
          ? existing.routingSnapshotId
          : input.linkages.routingSnapshotId,
      workflowDispatchId:
        input.linkages?.workflowDispatchId === undefined
          ? existing.workflowDispatchId
          : input.linkages.workflowDispatchId,
      reportId:
        input.linkages?.reportId === undefined ? existing.reportId : input.linkages.reportId,
      reportPackageId:
        input.linkages?.reportPackageId === undefined
          ? existing.reportPackageId
          : input.linkages.reportPackageId,
      externalResultReference:
        input.linkages?.externalResultReference === undefined
          ? existing.externalResultReference
          : input.linkages.externalResultReference,
      entitlementsJson:
        input.linkages?.entitlementsJson === undefined
          ? toNullableJsonInput(existing.entitlementsJson)
          : toNullableJsonInput(input.linkages.entitlementsJson),
      routingHintsJson:
        input.linkages?.routingHintsJson === undefined
          ? toNullableJsonInput(existing.routingHintsJson)
          : toNullableJsonInput(input.linkages.routingHintsJson),
      statusReasonJson:
        input.linkages?.statusReasonJson === undefined
          ? toNullableJsonInput(existing.statusReasonJson)
          : toNullableJsonInput(input.linkages.statusReasonJson),
      latestExecutionResultJson:
        input.linkages?.latestExecutionResultJson === undefined
          ? toNullableJsonInput(existing.latestExecutionResultJson)
          : toNullableJsonInput(input.linkages.latestExecutionResultJson),
      lastError:
        input.linkages?.lastError === undefined ? existing.lastError : input.linkages.lastError,
      status: applied.status,
      paidAt: applied.timestamps.paidAt,
      routedAt: applied.timestamps.routedAt,
      processingAt: applied.timestamps.processingAt,
      awaitingReviewAt: applied.timestamps.awaitingReviewAt,
      reportGeneratedAt: applied.timestamps.reportGeneratedAt,
      deliveredAt: applied.timestamps.deliveredAt,
      failedAt: applied.timestamps.failedAt
    }
  });

  if (applied.changed) {
    await db.deliveryStateTransition.create({
      data: {
        deliveryStateRecordId: existing.id,
        organizationId: updated.organizationId,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? AuditActorType.SYSTEM,
        actorLabel: input.actorLabel ?? null,
        fromStatus: existing.status,
        toStatus: applied.status,
        reasonCode: input.reasonCode ?? null,
        note: input.note ?? null,
        metadata: input.metadata ?? undefined,
        occurredAt: at
      }
    });
  }

  return updated;
}

export async function markDeliveryStateAwaitingReviewForReport(input: {
  db?: DeliveryStateDbClient;
  organizationId: string;
  reportId: string;
  reportPackageId: string;
  actorUserId?: string | null;
}) {
  const db = input.db ?? prisma;
  const byReference = await db.deliveryStateRecord.findFirst({
    where: {
      organizationId: input.organizationId,
      OR: [
        { reportId: input.reportId },
        { reportPackageId: input.reportPackageId },
        { externalResultReference: input.reportId }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  if (!byReference) {
    return null;
  }

  return transitionDeliveryState({
    db,
    deliveryStateId: byReference.id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorType: AuditActorType.SYSTEM,
    actorLabel: "executive-delivery",
    toStatus: DeliveryStateStatus.AWAITING_REVIEW,
    reasonCode: "delivery.awaiting_review",
    linkages: {
      reportId: input.reportId,
      reportPackageId: input.reportPackageId
    }
  });
}

export async function markDeliveryStateDeliveredForReport(input: {
  db?: DeliveryStateDbClient;
  organizationId: string;
  reportId: string;
  reportPackageId: string;
  actorUserId: string;
}) {
  const db = input.db ?? prisma;
  const existing = await db.deliveryStateRecord.findFirst({
    where: {
      organizationId: input.organizationId,
      OR: [{ reportPackageId: input.reportPackageId }, { reportId: input.reportId }]
    },
    orderBy: { createdAt: "desc" }
  });

  if (!existing) {
    return null;
  }

  return transitionDeliveryState({
    db,
    deliveryStateId: existing.id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorType: AuditActorType.USER,
    actorLabel: "report-delivery",
    toStatus: DeliveryStateStatus.DELIVERED,
    reasonCode: "delivery.sent",
    linkages: {
      reportId: input.reportId,
      reportPackageId: input.reportPackageId
    }
  });
}
