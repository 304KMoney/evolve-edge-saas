import { Prisma, prisma } from "@evolve-edge/db";

type DeliveryReconciliationDbClient = Prisma.TransactionClient | typeof prisma;

type DeliveryStateWithReconciliation = Prisma.DeliveryStateRecordGetPayload<{
  include: {
    billingEvent: true;
    routingSnapshot: true;
    workflowDispatch: true;
    report: true;
    reportPackage: true;
  };
}>;

export type DeliveryReconciliationSummary = {
  payment: {
    billingEventId: string | null;
    stripeEventId: string | null;
    type: string | null;
    sourceEventId: string;
    sourceRecordId: string | null;
  };
  routing: {
    routingSnapshotId: string | null;
    planCode: string | null;
    workflowCode: string | null;
    status: string | null;
  };
  execution: {
    workflowDispatchId: string | null;
    externalExecutionId: string | null;
    status: string | null;
    responseStatus: number | null;
    externalResultReference: string | null;
  };
  delivery: {
    deliveryStateId: string;
    status: string;
    reportId: string | null;
    reportPackageId: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
  };
};

export function buildDeliveryReconciliationSummary(
  deliveryState: DeliveryStateWithReconciliation
): DeliveryReconciliationSummary {
  return {
    payment: {
      billingEventId: deliveryState.billingEventId ?? null,
      stripeEventId: deliveryState.billingEvent?.stripeEventId ?? null,
      type: deliveryState.billingEvent?.type ?? deliveryState.sourceEventType,
      sourceEventId: deliveryState.sourceEventId,
      sourceRecordId: deliveryState.sourceRecordId ?? null
    },
    routing: {
      routingSnapshotId: deliveryState.routingSnapshotId ?? null,
      planCode:
        deliveryState.routingSnapshot?.planCode?.toString() ??
        deliveryState.planCode?.toString() ??
        null,
      workflowCode:
        deliveryState.routingSnapshot?.workflowCode?.toString() ??
        deliveryState.workflowCode?.toString() ??
        null,
      status: deliveryState.routingSnapshot?.status?.toString() ?? null
    },
    execution: {
      workflowDispatchId: deliveryState.workflowDispatchId ?? null,
      externalExecutionId: deliveryState.workflowDispatch?.externalExecutionId ?? null,
      status: deliveryState.workflowDispatch?.status?.toString() ?? null,
      responseStatus: deliveryState.workflowDispatch?.responseStatus ?? null,
      externalResultReference: deliveryState.externalResultReference ?? null
    },
    delivery: {
      deliveryStateId: deliveryState.id,
      status: deliveryState.status.toString(),
      reportId: deliveryState.reportId ?? null,
      reportPackageId: deliveryState.reportPackageId ?? null,
      deliveredAt: deliveryState.deliveredAt?.toISOString() ?? null,
      failedAt: deliveryState.failedAt?.toISOString() ?? null
    }
  };
}

export async function getDeliveryReconciliationSummary(input: {
  db?: DeliveryReconciliationDbClient;
  deliveryStateId?: string;
  billingEventId?: string;
  routingSnapshotId?: string;
  workflowDispatchId?: string;
}) {
  // This helper is intentionally operator-oriented and resolves globally unique
  // reconciliation records. Customer-facing or org-scoped surfaces should wrap it
  // in an organization-aware resolver instead of passing untrusted global ids.
  const db = input.db ?? prisma;

  let deliveryState: DeliveryStateWithReconciliation | null = null;

  if (input.deliveryStateId) {
    deliveryState = await db.deliveryStateRecord.findUnique({
      where: { id: input.deliveryStateId },
      include: {
        billingEvent: true,
        routingSnapshot: true,
        workflowDispatch: true,
        report: true,
        reportPackage: true
      }
    });
  } else if (input.workflowDispatchId) {
    deliveryState = await db.deliveryStateRecord.findUnique({
      where: { workflowDispatchId: input.workflowDispatchId },
      include: {
        billingEvent: true,
        routingSnapshot: true,
        workflowDispatch: true,
        report: true,
        reportPackage: true
      }
    });
  } else if (input.routingSnapshotId) {
    deliveryState = await db.deliveryStateRecord.findUnique({
      where: { routingSnapshotId: input.routingSnapshotId },
      include: {
        billingEvent: true,
        routingSnapshot: true,
        workflowDispatch: true,
        report: true,
        reportPackage: true
      }
    });
  } else if (input.billingEventId) {
    deliveryState = await db.deliveryStateRecord.findFirst({
      where: { billingEventId: input.billingEventId },
      orderBy: { createdAt: "desc" },
      include: {
        billingEvent: true,
        routingSnapshot: true,
        workflowDispatch: true,
        report: true,
        reportPackage: true
      }
    });
  }

  return deliveryState ? buildDeliveryReconciliationSummary(deliveryState) : null;
}
