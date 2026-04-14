import { DeliveryStateStatus, Prisma, prisma } from "@evolve-edge/db";

type DeliveryMismatchDbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_THRESHOLDS = {
  paidNotRoutedMinutes: 15,
  routedNotDeliveredMinutes: 180
} as const;

type DeliveryStateForMismatch = Prisma.DeliveryStateRecordGetPayload<{
  include: {
    organization: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
    billingEvent: {
      select: {
        id: true;
        stripeEventId: true;
        type: true;
        status: true;
        createdAt: true;
      };
    };
    routingSnapshot: {
      select: {
        id: true;
        billingEventId: true;
        status: true;
        workflowCode: true;
        planCode: true;
        createdAt: true;
      };
    };
    workflowDispatch: {
      select: {
        id: true;
        status: true;
        externalExecutionId: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}>;

export type DeliveryMismatchCode =
  | "paid_not_routed"
  | "routed_not_delivered"
  | "delivered_without_matching_payment";

export type DeliveryMismatchFinding = {
  code: DeliveryMismatchCode;
  severity: "warning" | "critical";
  title: string;
  summary: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  deliveryState: {
    id: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
    routedAt: string | null;
    deliveredAt: string | null;
  };
  linkage: {
    billingEventId: string | null;
    routingSnapshotId: string | null;
    workflowDispatchId: string | null;
    stripeEventId: string | null;
    externalExecutionId: string | null;
  };
  observedAt: string;
  ageMinutes: number;
  metadata: Record<string, unknown>;
};

function getAgeMinutes(since: Date | null | undefined, observedAt: Date) {
  if (!since) {
    return 0;
  }

  return Math.max(0, Math.floor((observedAt.getTime() - since.getTime()) / 60000));
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function buildBaseFinding(
  record: DeliveryStateForMismatch,
  observedAt: Date
) {
  return {
    organization: {
      id: record.organization.id,
      name: record.organization.name,
      slug: record.organization.slug
    },
    deliveryState: {
      id: record.id,
      status: record.status.toString(),
      createdAt: record.createdAt.toISOString(),
      paidAt: toIso(record.paidAt),
      routedAt: toIso(record.routedAt),
      deliveredAt: toIso(record.deliveredAt)
    },
    linkage: {
      billingEventId: record.billingEventId ?? record.routingSnapshot?.billingEventId ?? null,
      routingSnapshotId: record.routingSnapshotId ?? null,
      workflowDispatchId: record.workflowDispatchId ?? null,
      stripeEventId: record.billingEvent?.stripeEventId ?? null,
      externalExecutionId: record.workflowDispatch?.externalExecutionId ?? null
    },
    observedAt: observedAt.toISOString()
  };
}

export function detectDeliveryMismatchForRecord(
  record: DeliveryStateForMismatch,
  observedAt = new Date(),
  thresholds = DEFAULT_THRESHOLDS
): DeliveryMismatchFinding[] {
  const findings: DeliveryMismatchFinding[] = [];
  const base = buildBaseFinding(record, observedAt);
  const paymentReferenceAge = getAgeMinutes(record.paidAt ?? record.createdAt, observedAt);
  const routedReferenceAge = getAgeMinutes(
    record.reportGeneratedAt ??
      record.awaitingReviewAt ??
      record.processingAt ??
      record.routedAt ??
      record.createdAt,
    observedAt
  );
  const hasMatchingPayment =
    Boolean(record.billingEventId) || Boolean(record.routingSnapshot?.billingEventId);

  if (
    record.status === DeliveryStateStatus.PAID &&
    paymentReferenceAge >= thresholds.paidNotRoutedMinutes &&
    !record.routingSnapshotId
  ) {
    findings.push({
      ...base,
      code: "paid_not_routed",
      severity: "warning",
      title: "Paid request has not been routed",
      summary:
        "The backend recorded payment for this request, but no routing snapshot has been linked within the expected window.",
      ageMinutes: paymentReferenceAge,
      metadata: {
        thresholdMinutes: thresholds.paidNotRoutedMinutes,
        sourceSystem: record.sourceSystem,
        sourceEventType: record.sourceEventType
      }
    });
  }

  const isRoutedButNotDeliveredStatus =
    record.status === DeliveryStateStatus.ROUTED ||
    record.status === DeliveryStateStatus.PROCESSING ||
    record.status === DeliveryStateStatus.AWAITING_REVIEW ||
    record.status === DeliveryStateStatus.REPORT_GENERATED;

  if (
    isRoutedButNotDeliveredStatus &&
    routedReferenceAge >= thresholds.routedNotDeliveredMinutes &&
    !record.deliveredAt &&
    !record.failedAt
  ) {
    findings.push({
      ...base,
      code: "routed_not_delivered",
      severity: "warning",
      title: "Routed request has not reached delivery",
      summary:
        "This request progressed into routing or execution, but it has not reached delivered or failed within the expected window.",
      ageMinutes: routedReferenceAge,
      metadata: {
        thresholdMinutes: thresholds.routedNotDeliveredMinutes,
        currentStatus: record.status.toString(),
        workflowDispatchStatus: record.workflowDispatch?.status?.toString() ?? null,
        routingSnapshotStatus: record.routingSnapshot?.status?.toString() ?? null
      }
    });
  }

  if (record.status === DeliveryStateStatus.DELIVERED && !hasMatchingPayment) {
    findings.push({
      ...base,
      code: "delivered_without_matching_payment",
      severity: "critical",
      title: "Delivered request is missing a payment record",
      summary:
        "The request is marked delivered, but neither the delivery state nor the linked routing snapshot contains a matching payment record.",
      ageMinutes: getAgeMinutes(record.deliveredAt ?? record.createdAt, observedAt),
      metadata: {
        sourceSystem: record.sourceSystem,
        sourceEventType: record.sourceEventType,
        sourceEventId: record.sourceEventId
      }
    });
  }

  return findings;
}

export async function listDeliveryMismatchFindings(input?: {
  db?: DeliveryMismatchDbClient;
  organizationId?: string;
  observedAt?: Date;
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>;
  limit?: number;
}) {
  const db = input?.db ?? prisma;
  const observedAt = input?.observedAt ?? new Date();
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(input?.thresholds ?? {})
  };

  const records = await db.deliveryStateRecord.findMany({
    where: input?.organizationId
      ? {
          organizationId: input.organizationId
        }
      : undefined,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      billingEvent: {
        select: {
          id: true,
          stripeEventId: true,
          type: true,
          status: true,
          createdAt: true
        }
      },
      routingSnapshot: {
        select: {
          id: true,
          billingEventId: true,
          status: true,
          workflowCode: true,
          planCode: true,
          createdAt: true
        }
      },
      workflowDispatch: {
        select: {
          id: true,
          status: true,
          externalExecutionId: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 200
  });

  return records.flatMap((record) =>
    detectDeliveryMismatchForRecord(record, observedAt, thresholds)
  );
}

export function getDeliveryMismatchDetectionGuide() {
  return {
    mismatchCodes: [
      "paid_not_routed",
      "routed_not_delivered",
      "delivered_without_matching_payment"
    ],
    thresholds: {
      paidNotRoutedMinutes: DEFAULT_THRESHOLDS.paidNotRoutedMinutes,
      routedNotDeliveredMinutes: DEFAULT_THRESHOLDS.routedNotDeliveredMinutes
    },
    sourceOfTruth: {
      payment: "BillingEvent",
      routing: "RoutingSnapshot",
      execution: "WorkflowDispatch",
      delivery: "DeliveryStateRecord"
    }
  };
}
