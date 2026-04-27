import {
  CustomerRunStatus,
  DeliveryStateStatus,
  Prisma,
  WebhookDeliveryStatus,
  WorkflowDispatchStatus,
  prisma
} from "@evolve-edge/db";

type FulfillmentVisibilityDbClient = Prisma.TransactionClient | typeof prisma;

type FulfillmentVisibilityEntryStatus = "aligned" | "attention" | "recovered";
type FulfillmentVisibilityEntrySeverity = "info" | "warning" | "critical";

type FulfillmentVisibilityInput = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  deliveryState: {
    id: string;
    status: DeliveryStateStatus;
    updatedAt: Date;
    deliveredAt: Date | null;
    failedAt: Date | null;
    lastError: string | null;
    reportId: string | null;
    workflowDispatchId: string | null;
    sourceRecordType: string | null;
    sourceRecordId: string | null;
  };
  report: {
    id: string;
    title: string | null;
    assessmentId: string | null;
  } | null;
  workflowDispatch: {
    id: string;
    status: WorkflowDispatchStatus;
    attemptCount: number;
    lastError: string | null;
    updatedAt: Date;
    externalExecutionId: string | null;
  } | null;
  customerRun: {
    id: string;
    status: CustomerRunStatus;
    currentStep: string;
    lastError: string | null;
    retryCount: number;
    lastRecoveredAt: Date | null;
    lastRecoveryNote: string | null;
  } | null;
  webhookDeliveries: Array<{
    id: string;
    destination: string;
    status: WebhookDeliveryStatus;
    lastError: string | null;
    attemptCount: number;
    updatedAt: Date;
    deliveredAt: Date | null;
    eventType: string;
  }>;
};

export type FulfillmentVisibilityEntry = {
  code:
    | "aligned"
    | "delivery_state_missing_customer_run"
    | "delivery_completed_but_run_open"
    | "delivery_failed_but_run_not_action_required"
    | "dispatch_failed_but_run_active"
    | "routed_without_dispatch_link"
    | "crm_delivery_failed_without_run_attention"
    | "recently_recovered";
  status: FulfillmentVisibilityEntryStatus;
  severity: FulfillmentVisibilityEntrySeverity;
  title: string;
  summary: string;
  recommendedAction: string | null;
  canonicalSource:
    | "DeliveryStateRecord"
    | "WorkflowDispatch"
    | "WebhookDelivery"
    | "CustomerRun";
  observedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  linkage: {
    deliveryStateId: string;
    workflowDispatchId: string | null;
    customerRunId: string | null;
    reportId: string | null;
    assessmentId: string | null;
    outboundDestinations: string[];
  };
  state: {
    deliveryStatus: string;
    workflowDispatchStatus: string | null;
    customerRunStatus: string | null;
    customerRunStep: string | null;
    failedDestinations: string[];
    retryCount: number;
    recoveryAt: string | null;
  };
};

export type FulfillmentVisibilitySummary = {
  counts: {
    aligned: number;
    attention: number;
    recovered: number;
    critical: number;
  };
  recentAttention: FulfillmentVisibilityEntry[];
  recentRecovered: FulfillmentVisibilityEntry[];
};

function isCustomerRunActive(status: CustomerRunStatus | null | undefined) {
  return status === CustomerRunStatus.PENDING || status === CustomerRunStatus.RUNNING;
}

function isCustomerRunAttentionStatus(status: CustomerRunStatus | null | undefined) {
  return status === CustomerRunStatus.ACTION_REQUIRED || status === CustomerRunStatus.FAILED;
}

function isDeliveryPastRouting(status: DeliveryStateStatus) {
  return (
    status === DeliveryStateStatus.ROUTED ||
    status === DeliveryStateStatus.PROCESSING ||
    status === DeliveryStateStatus.AWAITING_REVIEW ||
    status === DeliveryStateStatus.REPORT_GENERATED ||
    status === DeliveryStateStatus.DELIVERED ||
    status === DeliveryStateStatus.FAILED
  );
}

function isDeliveryVisibleToCustomer(status: DeliveryStateStatus) {
  return status === DeliveryStateStatus.DELIVERED;
}

function isTerminalWebhookFailure(status: WebhookDeliveryStatus) {
  return (
    status === WebhookDeliveryStatus.FAILED ||
    status === WebhookDeliveryStatus.RETRYING
  );
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function compareSeverity(
  left: FulfillmentVisibilityEntrySeverity,
  right: FulfillmentVisibilityEntrySeverity
) {
  const rank: Record<FulfillmentVisibilityEntrySeverity, number> = {
    critical: 3,
    warning: 2,
    info: 1
  };

  return rank[right] - rank[left];
}

export function sortFulfillmentVisibilityEntries(
  entries: FulfillmentVisibilityEntry[]
) {
  return [...entries].sort((left, right) => {
    if (left.status !== right.status) {
      const statusRank: Record<FulfillmentVisibilityEntryStatus, number> = {
        attention: 3,
        recovered: 2,
        aligned: 1
      };
      return statusRank[right.status] - statusRank[left.status];
    }

    const severityDiff = compareSeverity(left.severity, right.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return (
      new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime()
    );
  });
}

export function buildFulfillmentVisibilityEntry(
  input: FulfillmentVisibilityInput
): FulfillmentVisibilityEntry {
  const failedWebhookDeliveries = input.webhookDeliveries.filter((delivery) =>
    isTerminalWebhookFailure(delivery.status)
  );
  const observedAt = input.deliveryState.updatedAt.toISOString();
  const base = {
    observedAt,
    organization: input.organization,
    linkage: {
      deliveryStateId: input.deliveryState.id,
      workflowDispatchId: input.workflowDispatch?.id ?? input.deliveryState.workflowDispatchId,
      customerRunId: input.customerRun?.id ?? null,
      reportId: input.deliveryState.reportId ?? input.report?.id ?? null,
      assessmentId: input.report?.assessmentId ?? null,
      outboundDestinations: input.webhookDeliveries.map((delivery) => delivery.destination)
    },
    state: {
      deliveryStatus: input.deliveryState.status,
      workflowDispatchStatus: input.workflowDispatch?.status ?? null,
      customerRunStatus: input.customerRun?.status ?? null,
      customerRunStep: input.customerRun?.currentStep ?? null,
      failedDestinations: failedWebhookDeliveries.map((delivery) => delivery.destination),
      retryCount:
        input.customerRun?.retryCount ?? Math.max(input.workflowDispatch?.attemptCount ?? 0, 0),
      recoveryAt: toIso(input.customerRun?.lastRecoveredAt)
    }
  } satisfies Pick<
    FulfillmentVisibilityEntry,
    "observedAt" | "organization" | "linkage" | "state"
  >;

  if (
    isDeliveryPastRouting(input.deliveryState.status) &&
    !input.customerRun &&
    (input.deliveryState.reportId || input.report?.assessmentId)
  ) {
    return {
      ...base,
      code: "delivery_state_missing_customer_run",
      status: "attention",
      severity: "warning",
      title: "Canonical delivery state is missing a customer run link",
      summary:
        "Delivery-state progress exists for this workflow, but operators do not have a linked customer-run record to summarize recovery and customer-facing status.",
      recommendedAction:
        "Create or repair the customer-run linkage from the canonical report or assessment record before replaying anything.",
      canonicalSource: "DeliveryStateRecord"
    };
  }

  if (
    isDeliveryVisibleToCustomer(input.deliveryState.status) &&
    input.customerRun &&
    input.customerRun.status !== CustomerRunStatus.COMPLETED
  ) {
    return {
      ...base,
      code: "delivery_completed_but_run_open",
      status: "attention",
      severity: "critical",
      title: "Customer-facing delivery finished while the run is still open",
      summary:
        "The canonical delivery state is already delivered, but the customer run has not reached a completed state yet.",
      recommendedAction:
        "Reconcile the customer run from the delivered report state before taking further manual action.",
      canonicalSource: "DeliveryStateRecord"
    };
  }

  if (
    input.deliveryState.status === DeliveryStateStatus.FAILED &&
    input.customerRun &&
    !isCustomerRunAttentionStatus(input.customerRun.status)
  ) {
    return {
      ...base,
      code: "delivery_failed_but_run_not_action_required",
      status: "attention",
      severity: "warning",
      title: "Delivery failed without moving the customer run into attention",
      summary:
        "Delivery is already in a failed state, but the linked customer run still looks active or complete to operators.",
      recommendedAction:
        "Update the customer run to an action-required state from the canonical delivery failure before retrying.",
      canonicalSource: "DeliveryStateRecord"
    };
  }

  if (
    input.workflowDispatch?.status === WorkflowDispatchStatus.FAILED &&
    isCustomerRunActive(input.customerRun?.status)
  ) {
    return {
      ...base,
      code: "dispatch_failed_but_run_active",
      status: "attention",
      severity: "warning",
      title: "Workflow dispatch failed while the customer run still looks active",
      summary:
        "The dispatch layer has already failed, but the linked customer run has not yet surfaced that failure as operator-visible attention.",
      recommendedAction:
        "Reconcile the customer run from the failed workflow dispatch before replaying the execution path.",
      canonicalSource: "WorkflowDispatch"
    };
  }

  if (
    failedWebhookDeliveries.length > 0 &&
    input.customerRun &&
    !isCustomerRunAttentionStatus(input.customerRun.status)
  ) {
    return {
      ...base,
      code: "crm_delivery_failed_without_run_attention",
      status: "attention",
      severity: "warning",
      title: "Outbound delivery is blocked without a matching customer-run warning",
      summary:
        "At least one outbound delivery is failed or retrying, but the linked customer run has not moved into an operator-visible attention state.",
      recommendedAction:
        "Review the failed outbound destinations and reconcile the customer run before replaying external delivery.",
      canonicalSource: "WebhookDelivery"
    };
  }

  if (
    isDeliveryPastRouting(input.deliveryState.status) &&
    !input.workflowDispatch &&
    input.deliveryState.status !== DeliveryStateStatus.FAILED
  ) {
    return {
      ...base,
      code: "routed_without_dispatch_link",
      status: "attention",
      severity: "warning",
      title: "Delivery progressed without a linked workflow dispatch",
      summary:
        "The delivery-state record has moved beyond paid, but no workflow dispatch is linked for operators to inspect or replay.",
      recommendedAction:
        "Repair the dispatch linkage from the canonical routing or delivery record before attempting recovery.",
      canonicalSource: "DeliveryStateRecord"
    };
  }

  if (
    (input.customerRun?.lastRecoveredAt &&
      !isCustomerRunAttentionStatus(input.customerRun.status)) ||
    ((input.workflowDispatch?.attemptCount ?? 0) > 1 &&
      input.workflowDispatch?.status !== WorkflowDispatchStatus.FAILED)
  ) {
    return {
      ...base,
      code: "recently_recovered",
      status: "recovered",
      severity: "info",
      title: "Recent recovery signal detected",
      summary:
        "This workflow has already recorded a retry or recovery signal, and the current canonical state no longer looks blocked.",
      recommendedAction:
        "Continue monitoring unless the same record moves back into attention or stops progressing.",
      canonicalSource: input.customerRun?.lastRecoveredAt
        ? "CustomerRun"
        : "WorkflowDispatch"
    };
  }

  return {
    ...base,
    code: "aligned",
    status: "aligned",
    severity: "info",
    title: "Fulfillment records are aligned",
    summary:
      "Customer run, workflow dispatch, delivery state, and outbound delivery signals agree well enough for operators.",
    recommendedAction: null,
    canonicalSource: "DeliveryStateRecord"
  };
}

export function buildFulfillmentVisibilitySummary(
  entries: FulfillmentVisibilityEntry[]
): FulfillmentVisibilitySummary {
  return {
    counts: {
      aligned: entries.filter((entry) => entry.status === "aligned").length,
      attention: entries.filter((entry) => entry.status === "attention").length,
      recovered: entries.filter((entry) => entry.status === "recovered").length,
      critical: entries.filter((entry) => entry.severity === "critical").length
    },
    recentAttention: sortFulfillmentVisibilityEntries(
      entries.filter((entry) => entry.status === "attention")
    ).slice(0, 6),
    recentRecovered: sortFulfillmentVisibilityEntries(
      entries.filter((entry) => entry.status === "recovered")
    ).slice(0, 4)
  };
}

function matchesFulfillmentVisibilitySearch(
  q: string,
  entry: FulfillmentVisibilityEntry
) {
  if (!q.trim()) {
    return true;
  }

  const normalized = q.trim().toLowerCase();
  const haystack = [
    entry.code,
    entry.title,
    entry.summary,
    entry.organization.name,
    entry.organization.slug,
    entry.linkage.deliveryStateId,
    entry.linkage.workflowDispatchId,
    entry.linkage.customerRunId,
    entry.linkage.reportId,
    entry.linkage.assessmentId,
    entry.state.deliveryStatus,
    entry.state.workflowDispatchStatus,
    entry.state.customerRunStatus,
    entry.state.customerRunStep,
    ...entry.state.failedDestinations,
    ...entry.linkage.outboundDestinations
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

export async function listFulfillmentVisibilityEntries(input?: {
  db?: FulfillmentVisibilityDbClient;
  organizationId?: string;
  q?: string;
  limit?: number;
}) {
  const db = input?.db ?? prisma;
  const limit = Math.max(input?.limit ?? 12, 1);
  const candidateLimit = Math.max(limit * 4, 24);

  const deliveryStates = await db.deliveryStateRecord.findMany({
    where: input?.organizationId ? { organizationId: input.organizationId } : undefined,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      workflowDispatch: {
        select: {
          id: true,
          status: true,
          attemptCount: true,
          lastError: true,
          updatedAt: true,
          externalExecutionId: true
        }
      },
      report: {
        select: {
          id: true,
          title: true,
          assessmentId: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: candidateLimit
  });

  const reportIds = Array.from(
    new Set(
      deliveryStates
        .map((record) => record.reportId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const assessmentIds = Array.from(
    new Set(
      deliveryStates
        .map((record) => record.report?.assessmentId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const customerRuns =
    reportIds.length > 0 || assessmentIds.length > 0
      ? await db.customerRun.findMany({
          where: {
            ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
            OR: [
              reportIds.length > 0 ? { reportId: { in: reportIds } } : undefined,
              assessmentIds.length > 0 ? { assessmentId: { in: assessmentIds } } : undefined
            ].filter(Boolean) as Prisma.CustomerRunWhereInput[]
          },
          select: {
            id: true,
            reportId: true,
            assessmentId: true,
            status: true,
            currentStep: true,
            lastError: true,
            retryCount: true,
            lastRecoveredAt: true,
            lastRecoveryNote: true,
            updatedAt: true
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
        })
      : [];

  const webhookDeliveries =
    reportIds.length > 0
      ? await db.webhookDelivery.findMany({
          where: {
            event: {
              aggregateType: "report",
              aggregateId: { in: reportIds },
              ...(input?.organizationId ? { orgId: input.organizationId } : {})
            }
          },
          select: {
            id: true,
            destination: true,
            status: true,
            lastError: true,
            attemptCount: true,
            updatedAt: true,
            deliveredAt: true,
            event: {
              select: {
                aggregateId: true,
                type: true
              }
            }
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
        })
      : [];

  const customerRunByReportId = new Map<string, (typeof customerRuns)[number]>();
  const customerRunByAssessmentId = new Map<string, (typeof customerRuns)[number]>();
  for (const run of customerRuns) {
    if (run.reportId && !customerRunByReportId.has(run.reportId)) {
      customerRunByReportId.set(run.reportId, run);
    }
    if (run.assessmentId && !customerRunByAssessmentId.has(run.assessmentId)) {
      customerRunByAssessmentId.set(run.assessmentId, run);
    }
  }

  const webhookDeliveriesByReportId = new Map<
    string,
    Array<(typeof webhookDeliveries)[number]>
  >();
  for (const delivery of webhookDeliveries) {
    const reportId = delivery.event.aggregateId;
    const current = webhookDeliveriesByReportId.get(reportId) ?? [];
    if (!current.some((existing) => existing.destination === delivery.destination)) {
      current.push(delivery);
    }
    webhookDeliveriesByReportId.set(reportId, current);
  }

  const entries = deliveryStates.map((record) => {
    const customerRun =
      (record.reportId ? customerRunByReportId.get(record.reportId) : undefined) ??
      (record.report?.assessmentId
        ? customerRunByAssessmentId.get(record.report.assessmentId)
        : undefined) ??
      null;

    return buildFulfillmentVisibilityEntry({
      organization: record.organization,
      deliveryState: {
        id: record.id,
        status: record.status,
        updatedAt: record.updatedAt,
        deliveredAt: record.deliveredAt,
        failedAt: record.failedAt,
        lastError: record.lastError,
        reportId: record.reportId,
        workflowDispatchId: record.workflowDispatchId,
        sourceRecordType: record.sourceRecordType,
        sourceRecordId: record.sourceRecordId
      },
      report: record.report
        ? {
            id: record.report.id,
            title: record.report.title,
            assessmentId: record.report.assessmentId
          }
        : null,
      workflowDispatch: record.workflowDispatch
        ? {
            id: record.workflowDispatch.id,
            status: record.workflowDispatch.status,
            attemptCount: record.workflowDispatch.attemptCount,
            lastError: record.workflowDispatch.lastError,
            updatedAt: record.workflowDispatch.updatedAt,
            externalExecutionId: record.workflowDispatch.externalExecutionId
          }
        : null,
      customerRun: customerRun
        ? {
            id: customerRun.id,
            status: customerRun.status,
            currentStep: customerRun.currentStep,
            lastError: customerRun.lastError,
            retryCount: customerRun.retryCount,
            lastRecoveredAt: customerRun.lastRecoveredAt,
            lastRecoveryNote: customerRun.lastRecoveryNote
          }
        : null,
      webhookDeliveries: (record.reportId
        ? webhookDeliveriesByReportId.get(record.reportId)
        : [])?.map((delivery) => ({
        id: delivery.id,
        destination: delivery.destination,
        status: delivery.status,
        lastError: delivery.lastError,
        attemptCount: delivery.attemptCount,
        updatedAt: delivery.updatedAt,
        deliveredAt: delivery.deliveredAt,
        eventType: delivery.event.type
      })) ?? []
    });
  });

  return sortFulfillmentVisibilityEntries(
    entries.filter((entry) => matchesFulfillmentVisibilitySearch(input?.q ?? "", entry))
  ).slice(0, limit);
}
