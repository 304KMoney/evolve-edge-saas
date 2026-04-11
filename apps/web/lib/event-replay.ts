import {
  BillingEventStatus,
  CustomerAccountTimelineCategory,
  CustomerAccountTimelineEntryType,
  CustomerAccountTimelineSeverity,
  CustomerAccountTimelineSourceSystem,
  CustomerAccountTimelineVisibility,
  DomainEventStatus,
  EventReplayAttemptStatus,
  EventReplayTargetType,
  Prisma,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import {
  REPLAYABLE_STRIPE_EVENT_TYPES,
  replayStoredStripeBillingEvent
} from "./stripe-billing-replay";
import { buildCorrelationId, normalizeExternalError } from "./reliability";
import { getOutboundWebhookDestinations, replayDomainEventDeliveries, replayWebhookDeliveryById } from "./webhook-dispatcher";
import {
  getN8nWorkflowDestinations,
  N8nWorkflowName,
  shouldDispatchEventToN8nWorkflow
} from "./n8n";
import { shouldSyncHubSpotEvent } from "./hubspot";
import { recordCustomerAccountTimelineEvent } from "./account-timeline";

type ReplayDbClient = Prisma.TransactionClient | typeof prisma;

const MAX_REPLAY_ATTEMPTS_PER_24H = 3;
const REPLAY_WINDOW_HOURS = 24;

export const EVENT_REPLAY_TARGET_TYPES = Object.values(
  EventReplayTargetType
) as EventReplayTargetType[];

export type EventReplayFilters = {
  q?: string | null;
  targetType?: EventReplayTargetType | null;
  retryability?: "retryable" | "non_retryable" | "all" | null;
};

type ReplayEligibility = {
  eligible: boolean;
  code: string;
  reason: string;
  retryable: boolean;
  normalizedState:
    | "received"
    | "processing"
    | "succeeded"
    | "failed_retryable"
    | "failed_terminal"
    | "replayed";
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReplayTargetType(targetType: EventReplayTargetType) {
  return formatLabel(targetType);
}

export function formatReplayAttemptStatus(status: EventReplayAttemptStatus) {
  return formatLabel(status);
}

function getReplayWindowStart() {
  return new Date(Date.now() - REPLAY_WINDOW_HOURS * 60 * 60 * 1000);
}

async function countRecentReplayAttempts(
  targetType: EventReplayTargetType,
  targetId: string,
  db: ReplayDbClient
) {
  return db.eventReplayAttempt.count({
    where: {
      targetType,
      targetId,
      createdAt: {
        gte: getReplayWindowStart()
      }
    }
  });
}

function classifyFailure(message: string | null | undefined) {
  if (!message) {
    return {
      retryable: true,
      category: "unknown",
      message: "No failure message recorded."
    };
  }

  const normalized = normalizeExternalError(new Error(message));
  return {
    retryable: normalized.retryable,
    category: normalized.category,
    message: normalized.message
  };
}

function buildRateLimitedEligibility(replayCount: number): ReplayEligibility | null {
  if (replayCount < MAX_REPLAY_ATTEMPTS_PER_24H) {
    return null;
  }

  return {
    eligible: false,
    code: "rate_limited",
    reason: `Replay blocked after ${MAX_REPLAY_ATTEMPTS_PER_24H} attempts in ${REPLAY_WINDOW_HOURS} hours.`,
    retryable: false,
    normalizedState: "failed_terminal"
  };
}

export function getBillingEventReplayEligibility(input: {
  status: BillingEventStatus;
  type: string;
  lastError?: string | null;
  replayCount24h: number;
}) {
  const rateLimited = buildRateLimitedEligibility(input.replayCount24h);
  if (rateLimited) {
    return rateLimited;
  }

  if (!REPLAYABLE_STRIPE_EVENT_TYPES.includes(input.type as (typeof REPLAYABLE_STRIPE_EVENT_TYPES)[number])) {
    return {
      eligible: false,
      code: "unsupported_type",
      reason: "This Stripe event type is not approved for manual replay.",
      retryable: false,
      normalizedState: "failed_terminal"
    } satisfies ReplayEligibility;
  }

  if (input.status === BillingEventStatus.PROCESSED) {
    return {
      eligible: false,
      code: "already_processed",
      reason: "This billing event was already processed successfully.",
      retryable: false,
      normalizedState: "succeeded"
    } satisfies ReplayEligibility;
  }

  if (input.status === BillingEventStatus.PROCESSING) {
    return {
      eligible: false,
      code: "in_flight",
      reason: "This billing event is currently processing.",
      retryable: false,
      normalizedState: "processing"
    } satisfies ReplayEligibility;
  }

  const failure = classifyFailure(input.lastError);

  return {
    eligible: input.status === BillingEventStatus.FAILED || input.status === BillingEventStatus.PENDING,
    code: failure.retryable ? "eligible_retryable" : "eligible_reviewed",
    reason: failure.retryable
      ? "This billing event can be replayed safely after a transient failure."
      : `Last failure was classified as ${failure.category}. Replay is allowed only because this event type is idempotent and operator-reviewed.`,
    retryable: failure.retryable,
    normalizedState:
      input.status === BillingEventStatus.PENDING
        ? "received"
        : failure.retryable
          ? "failed_retryable"
          : "failed_terminal"
  } satisfies ReplayEligibility;
}

export function getWebhookDeliveryReplayEligibility(input: {
  status: WebhookDeliveryStatus;
  lastError?: string | null;
  destinationConfigured: boolean;
  replayCount24h: number;
}) {
  const rateLimited = buildRateLimitedEligibility(input.replayCount24h);
  if (rateLimited) {
    return rateLimited;
  }

  if (!input.destinationConfigured) {
    return {
      eligible: false,
      code: "destination_missing",
      reason: "The destination is not currently configured, so replay is blocked.",
      retryable: false,
      normalizedState: "failed_terminal"
    } satisfies ReplayEligibility;
  }

  if (input.status === WebhookDeliveryStatus.DELIVERED) {
    return {
      eligible: false,
      code: "already_delivered",
      reason: "This delivery already succeeded.",
      retryable: false,
      normalizedState: "succeeded"
    } satisfies ReplayEligibility;
  }

  if (input.status === WebhookDeliveryStatus.PROCESSING) {
    return {
      eligible: false,
      code: "in_flight",
      reason: "This delivery is currently processing.",
      retryable: false,
      normalizedState: "processing"
    } satisfies ReplayEligibility;
  }

  const failure = classifyFailure(input.lastError);
  return {
    eligible: true,
    code: failure.retryable ? "eligible_retryable" : "eligible_reviewed",
    reason: failure.retryable
      ? "This outbound delivery is safe to replay."
      : `Last failure was classified as ${failure.category}. Replay requires an operator to confirm the underlying issue is fixed.`,
    retryable: failure.retryable,
    normalizedState:
      input.status === WebhookDeliveryStatus.PENDING
        ? "received"
        : failure.retryable
          ? "failed_retryable"
          : "failed_terminal"
  } satisfies ReplayEligibility;
}

function getApplicableDestinationNamesForDomainEvent(event: {
  type: string;
  payload: unknown;
}) {
  return getOutboundWebhookDestinations()
    .filter((destination) => {
      if (destination.provider === "hubspot") {
        return shouldSyncHubSpotEvent(event.type);
      }

      if (destination.provider === "n8n") {
        return shouldDispatchEventToN8nWorkflow({
          workflow: destination.name as N8nWorkflowName,
          eventType: event.type,
          payload: event.payload
        });
      }

      return true;
    })
    .map((destination) => destination.name);
}

export function getDomainEventReplayEligibility(input: {
  status: DomainEventStatus;
  type: string;
  payload: unknown;
  replayCount24h: number;
  hasFailedDelivery: boolean;
}) {
  const rateLimited = buildRateLimitedEligibility(input.replayCount24h);
  if (rateLimited) {
    return rateLimited;
  }

  if (input.status === DomainEventStatus.PROCESSED) {
    return {
      eligible: false,
      code: "already_processed",
      reason: "This domain event is already fully processed.",
      retryable: false,
      normalizedState: "succeeded"
    } satisfies ReplayEligibility;
  }

  if (input.status === DomainEventStatus.PROCESSING) {
    return {
      eligible: false,
      code: "in_flight",
      reason: "This domain event is currently processing.",
      retryable: false,
      normalizedState: "processing"
    } satisfies ReplayEligibility;
  }

  const applicableDestinations = getApplicableDestinationNamesForDomainEvent(input);
  if (applicableDestinations.length === 0) {
    return {
      eligible: false,
      code: "no_destinations",
      reason: "No configured downstream destinations currently apply to this event.",
      retryable: false,
      normalizedState: "failed_terminal"
    } satisfies ReplayEligibility;
  }

  return {
    eligible: input.status === DomainEventStatus.FAILED || input.hasFailedDelivery,
    code: "eligible",
    reason: "This domain event can be replayed safely through its managed outbound deliveries.",
    retryable: true,
    normalizedState: input.status === DomainEventStatus.PENDING ? "received" : "failed_retryable"
  } satisfies ReplayEligibility;
}

type ReplayRequestInput = {
  targetType: EventReplayTargetType;
  targetId: string;
  userId: string;
  userEmail: string;
  reason: string;
  notes?: string | null;
};

async function appendReplayTimelineEntry(input: {
  db: ReplayDbClient;
  organizationId: string | null;
  targetType: EventReplayTargetType;
  targetId: string;
  userId: string;
  userEmail: string;
  title: string;
  body: string;
  severity?: CustomerAccountTimelineSeverity;
}) {
  if (!input.organizationId) {
    return;
  }

  const customerAccount = await input.db.customerAccount.findUnique({
    where: { organizationId: input.organizationId },
    select: { id: true }
  });

  if (!customerAccount) {
    return;
  }

  await recordCustomerAccountTimelineEvent(input.db, {
    customerAccountId: customerAccount.id,
    organizationId: input.organizationId,
    actorUserId: input.userId,
    actorLabel: input.userEmail,
    entryType: CustomerAccountTimelineEntryType.SYSTEM_SYNC,
    category: CustomerAccountTimelineCategory.SUPPORT,
    title: input.title,
    body: input.body,
    eventCode: `support.event_replay.${input.targetType.toLowerCase()}`,
    severity: input.severity ?? CustomerAccountTimelineSeverity.INFO,
    visibility: CustomerAccountTimelineVisibility.INTERNAL,
    sourceSystem: CustomerAccountTimelineSourceSystem.MANUAL,
    sourceRecordType: input.targetType,
    sourceRecordId: input.targetId
  });
}

export async function requestEventReplay(
  input: ReplayRequestInput,
  db: ReplayDbClient = prisma
) {
  const correlationId = buildCorrelationId("replay");

  const createAttempt = (data: {
    organizationId?: string | null;
    billingEventId?: string | null;
    domainEventId?: string | null;
    webhookDeliveryId?: string | null;
    status?: EventReplayAttemptStatus;
    failureCode?: string | null;
    failureReason?: string | null;
    metadata?: Prisma.InputJsonValue | null;
    completedAt?: Date | null;
  }) =>
    db.eventReplayAttempt.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        organizationId: data.organizationId ?? null,
        billingEventId: data.billingEventId ?? null,
        domainEventId: data.domainEventId ?? null,
        webhookDeliveryId: data.webhookDeliveryId ?? null,
        requestedByUserId: input.userId,
        requestedByEmail: input.userEmail,
        reason: input.reason,
        notes: input.notes ?? null,
        correlationId,
        status: data.status ?? EventReplayAttemptStatus.REQUESTED,
        failureCode: data.failureCode ?? null,
        failureReason: data.failureReason ?? null,
        metadata: data.metadata ?? undefined,
        completedAt: data.completedAt ?? null
      }
    });

  if (input.targetType === EventReplayTargetType.BILLING_EVENT) {
    const event = await db.billingEvent.findUnique({
      where: { id: input.targetId }
    });

    if (!event) {
      throw new Error("Billing event was not found.");
    }

    const replayCount24h = await countRecentReplayAttempts(input.targetType, input.targetId, db);
    const eligibility = getBillingEventReplayEligibility({
      status: event.status,
      type: event.type,
      lastError: event.lastError,
      replayCount24h
    });

    if (!eligibility.eligible) {
      await createAttempt({
        status: EventReplayAttemptStatus.BLOCKED,
        billingEventId: event.id,
        failureCode: eligibility.code,
        failureReason: eligibility.reason,
        metadata: {
          eventType: event.type,
          normalizedState: eligibility.normalizedState
        },
        completedAt: new Date()
      });
      throw new Error(eligibility.reason);
    }

    const attempt = await createAttempt({
      billingEventId: event.id,
      metadata: {
        eventType: event.type,
        normalizedState: eligibility.normalizedState
      }
    });

    try {
      const result = await replayStoredStripeBillingEvent({
        billingEventId: event.id,
        actorEmail: input.userEmail,
        requestContext: {
          source: "admin.replay",
          correlationId,
          requestedBy: input.userEmail
        } satisfies Prisma.InputJsonValue
      });

      await db.eventReplayAttempt.update({
        where: { id: attempt.id },
        data: {
          status: EventReplayAttemptStatus.SUCCEEDED,
          completedAt: new Date(),
          metadata: {
            eventType: event.type,
            billingEventId: event.id,
            result
          }
        }
      });

      return {
        targetType: input.targetType,
        targetId: input.targetId,
        attemptId: attempt.id,
        correlationId,
        result
      };
    } catch (error) {
      await db.eventReplayAttempt.update({
        where: { id: attempt.id },
        data: {
          status: EventReplayAttemptStatus.FAILED,
          completedAt: new Date(),
          failureCode: "replay_failed",
          failureReason: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw error;
    }
  }

  if (input.targetType === EventReplayTargetType.WEBHOOK_DELIVERY) {
    const delivery = await db.webhookDelivery.findUnique({
      where: { id: input.targetId },
      include: { event: true }
    });

    if (!delivery) {
      throw new Error("Webhook delivery was not found.");
    }

    const destinationConfigured = getOutboundWebhookDestinations().some(
      (destination) => destination.name === delivery.destination
    );
    const replayCount24h = await countRecentReplayAttempts(input.targetType, input.targetId, db);
    const eligibility = getWebhookDeliveryReplayEligibility({
      status: delivery.status,
      lastError: delivery.lastError,
      destinationConfigured,
      replayCount24h
    });

    if (!eligibility.eligible) {
      await createAttempt({
        organizationId: delivery.event.orgId,
        domainEventId: delivery.eventId,
        webhookDeliveryId: delivery.id,
        status: EventReplayAttemptStatus.BLOCKED,
        failureCode: eligibility.code,
        failureReason: eligibility.reason,
        metadata: {
          destination: delivery.destination,
          normalizedState: eligibility.normalizedState
        },
        completedAt: new Date()
      });
      throw new Error(eligibility.reason);
    }

    const attempt = await createAttempt({
      organizationId: delivery.event.orgId,
      domainEventId: delivery.eventId,
      webhookDeliveryId: delivery.id,
      metadata: {
        destination: delivery.destination,
        normalizedState: eligibility.normalizedState
      }
    });

    try {
      const result = await replayWebhookDeliveryById(delivery.id);
      await db.eventReplayAttempt.update({
        where: { id: attempt.id },
        data: {
          status: EventReplayAttemptStatus.SUCCEEDED,
          completedAt: new Date(),
          metadata: {
            destination: delivery.destination,
            deliveryId: delivery.id,
            result
          }
        }
      });

      await appendReplayTimelineEntry({
        db,
        organizationId: delivery.event.orgId,
        targetType: input.targetType,
        targetId: delivery.id,
        userId: input.userId,
        userEmail: input.userEmail,
        title: "Outbound delivery replay requested",
        body: `${delivery.destination} was replayed by ${input.userEmail}. Reason: ${input.reason}`
      });

      return {
        targetType: input.targetType,
        targetId: input.targetId,
        attemptId: attempt.id,
        correlationId,
        result
      };
    } catch (error) {
      await db.eventReplayAttempt.update({
        where: { id: attempt.id },
        data: {
          status: EventReplayAttemptStatus.FAILED,
          completedAt: new Date(),
          failureCode: "replay_failed",
          failureReason: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw error;
    }
  }

  const event = await db.domainEvent.findUnique({
    where: { id: input.targetId },
    include: {
      deliveries: true
    }
  });

  if (!event) {
    throw new Error("Domain event was not found.");
  }

  const replayCount24h = await countRecentReplayAttempts(input.targetType, input.targetId, db);
  const eligibility = getDomainEventReplayEligibility({
    status: event.status,
    type: event.type,
    payload: event.payload,
    replayCount24h,
    hasFailedDelivery: event.deliveries.some(
      (delivery) => delivery.status === WebhookDeliveryStatus.FAILED
    )
  });

  if (!eligibility.eligible) {
    await createAttempt({
      organizationId: event.orgId,
      domainEventId: event.id,
      status: EventReplayAttemptStatus.BLOCKED,
      failureCode: eligibility.code,
      failureReason: eligibility.reason,
      metadata: {
        eventType: event.type,
        normalizedState: eligibility.normalizedState
      },
      completedAt: new Date()
    });
    throw new Error(eligibility.reason);
  }

  const attempt = await createAttempt({
    organizationId: event.orgId,
    domainEventId: event.id,
    metadata: {
      eventType: event.type,
      normalizedState: eligibility.normalizedState
    }
  });

  try {
    const result = await replayDomainEventDeliveries(event.id);
    await db.eventReplayAttempt.update({
      where: { id: attempt.id },
      data: {
        status: EventReplayAttemptStatus.SUCCEEDED,
        completedAt: new Date(),
        metadata: {
          eventType: event.type,
          domainEventId: event.id,
          result
        }
      }
    });

    await appendReplayTimelineEntry({
      db,
      organizationId: event.orgId,
      targetType: input.targetType,
      targetId: event.id,
      userId: input.userId,
      userEmail: input.userEmail,
      title: "Domain event replay requested",
      body: `${event.type} was replayed by ${input.userEmail}. Reason: ${input.reason}`
    });

    return {
      targetType: input.targetType,
      targetId: input.targetId,
      attemptId: attempt.id,
      correlationId,
      result
    };
  } catch (error) {
    await db.eventReplayAttempt.update({
      where: { id: attempt.id },
      data: {
        status: EventReplayAttemptStatus.FAILED,
        completedAt: new Date(),
        failureCode: "replay_failed",
        failureReason: error instanceof Error ? error.message : "Unknown error"
      }
    });
    throw error;
  }
}

function buildContainsFilter(q: string) {
  return q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
}

export async function getEventReplayDashboardSnapshot(
  filters: EventReplayFilters = {},
  db: ReplayDbClient = prisma
) {
  const q = filters.q?.trim() ?? "";
  const contains = buildContainsFilter(q);
  const targetType = filters.targetType ?? null;

  const [billingEvents, domainEvents, webhookDeliveries, recentAttempts] = await Promise.all([
    targetType && targetType !== EventReplayTargetType.BILLING_EVENT
      ? Promise.resolve([])
      : db.billingEvent.findMany({
          where: {
            status: BillingEventStatus.FAILED,
            ...(q
              ? {
                  OR: [
                    { stripeEventId: contains },
                    { type: contains },
                    { lastError: contains }
                  ]
                }
              : {})
          },
          orderBy: { failedAt: "desc" },
          take: 20
        }),
    targetType && targetType !== EventReplayTargetType.DOMAIN_EVENT
      ? Promise.resolve([])
      : db.domainEvent.findMany({
          where: {
            status: {
              in: [DomainEventStatus.FAILED, DomainEventStatus.PENDING]
            },
            ...(q
              ? {
                  OR: [
                    { type: contains },
                    { aggregateType: contains },
                    { aggregateId: contains },
                    { idempotencyKey: contains }
                  ]
                }
              : {})
          },
          include: {
            deliveries: true
          },
          orderBy: { occurredAt: "desc" },
          take: 20
        }),
    targetType && targetType !== EventReplayTargetType.WEBHOOK_DELIVERY
      ? Promise.resolve([])
      : db.webhookDelivery.findMany({
          where: {
            status: {
              in: [WebhookDeliveryStatus.FAILED, WebhookDeliveryStatus.RETRYING]
            },
            ...(q
              ? {
                  OR: [
                    { destination: contains },
                    { requestUrl: contains },
                    { lastError: contains },
                    { event: { type: contains } },
                    { event: { aggregateId: contains } }
                  ]
                }
              : {})
          },
          include: {
            event: true
          },
          orderBy: { updatedAt: "desc" },
          take: 20
        }),
    db.eventReplayAttempt.findMany({
      where: {
        ...(targetType ? { targetType } : {}),
        ...(q
          ? {
              OR: [
                { requestedByEmail: contains },
                { reason: contains },
                { failureReason: contains },
                { correlationId: contains }
              ]
            }
          : {})
      },
      include: {
        requestedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  const billingItems = await Promise.all(
    billingEvents.map(async (event) => {
      const replayCount24h = await countRecentReplayAttempts(
        EventReplayTargetType.BILLING_EVENT,
        event.id,
        db
      );
      const eligibility = getBillingEventReplayEligibility({
        status: event.status,
        type: event.type,
        lastError: event.lastError,
        replayCount24h
      });

      return {
        ...event,
        replayCount24h,
        eligibility
      };
    })
  );

  const domainItems = await Promise.all(
    domainEvents.map(async (event) => {
      const replayCount24h = await countRecentReplayAttempts(
        EventReplayTargetType.DOMAIN_EVENT,
        event.id,
        db
      );
      const eligibility = getDomainEventReplayEligibility({
        status: event.status,
        type: event.type,
        payload: event.payload,
        replayCount24h,
        hasFailedDelivery: event.deliveries.some(
          (delivery) => delivery.status === WebhookDeliveryStatus.FAILED
        )
      });

      return {
        ...event,
        replayCount24h,
        eligibility
      };
    })
  );

  const webhookItems = await Promise.all(
    webhookDeliveries.map(async (delivery) => {
      const replayCount24h = await countRecentReplayAttempts(
        EventReplayTargetType.WEBHOOK_DELIVERY,
        delivery.id,
        db
      );
      const eligibility = getWebhookDeliveryReplayEligibility({
        status: delivery.status,
        lastError: delivery.lastError,
        destinationConfigured: getOutboundWebhookDestinations().some(
          (destination) => destination.name === delivery.destination
        ),
        replayCount24h
      });

      return {
        ...delivery,
        replayCount24h,
        eligibility
      };
    })
  );

  const applyRetryabilityFilter = <TItem extends { eligibility: ReplayEligibility }>(items: TItem[]) =>
    filters.retryability === "retryable"
      ? items.filter((item) => item.eligibility.retryable)
      : filters.retryability === "non_retryable"
        ? items.filter((item) => !item.eligibility.retryable)
        : items;

  return {
    billingEvents: applyRetryabilityFilter(billingItems),
    domainEvents: applyRetryabilityFilter(domainItems),
    webhookDeliveries: applyRetryabilityFilter(webhookItems),
    recentAttempts,
    summary: {
      failedBillingEvents: billingItems.length,
      failedDomainEvents: domainItems.length,
      failedWebhookDeliveries: webhookItems.length,
      recentReplayAttempts: recentAttempts.length
    }
  };
}
