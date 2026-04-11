import {
  DomainEventStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import {
  buildCorrelationId,
  clampTimeoutMs,
  isProcessingClaimStale,
  normalizeExternalError
} from "./reliability";
import { markCustomerRunCrmSyncResult } from "./customer-runs";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { getOptionalEnv, getOptionalJsonEnv, requireEnv } from "./runtime-config";
import {
  buildN8nEnvelope,
  buildN8nSignedHeaders,
  N8nWorkflowName,
  getN8nWorkflowDestinations,
  shouldDispatchEventToN8nWorkflow
} from "./n8n";
import { createHmac } from "node:crypto";
import {
  getHubSpotDestinations,
  shouldSyncHubSpotEvent,
  syncDomainEventToHubSpot
} from "./hubspot";
import { shouldBlockDemoExternalSideEffects } from "./demo-mode";

type OutboundWebhookDestination = {
  name: string;
  url: string;
  secret?: string | null;
  provider?: "generic" | "n8n" | "hubspot";
  timeoutMs?: number;
};

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];
const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_DELIVERY_MINUTES = 15;

function getRetryDelayMinutes(attemptCount: number) {
  return RETRY_DELAYS_MINUTES[Math.min(attemptCount - 1, RETRY_DELAYS_MINUTES.length - 1)];
}

function getWebhookDeliveryTimeoutMs(value: number | null | undefined) {
  return clampTimeoutMs(value ?? DEFAULT_DELIVERY_TIMEOUT_MS, DEFAULT_DELIVERY_TIMEOUT_MS);
}

function getStaleDeliveryMinutes() {
  const parsed = Number(
    getOptionalEnv("WEBHOOK_DELIVERY_STALE_MINUTES") ?? DEFAULT_STALE_DELIVERY_MINUTES
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_DELIVERY_MINUTES;
}

function buildSignedHeaders(body: string, secret?: string | null) {
  if (!secret) {
    return {} as Record<string, string>;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    "x-evolve-edge-timestamp": timestamp,
    "x-evolve-edge-signature": signature
  } as Record<string, string>;
}

export function getOutboundWebhookDestinations(): OutboundWebhookDestination[] {
  if (shouldBlockDemoExternalSideEffects()) {
    return [];
  }

  const n8nDestinations = getN8nWorkflowDestinations();
  const hubSpotDestinations = getHubSpotDestinations();
  const destinations =
    getOptionalJsonEnv<OutboundWebhookDestination[]>("OUTBOUND_WEBHOOK_DESTINATIONS");

  const genericDestinations =
    Array.isArray(destinations) && destinations.length > 0
      ? destinations
          .filter(
            (destination) =>
              Boolean(destination?.name?.trim()) && Boolean(destination?.url?.trim())
          )
          .map((destination) => ({
            ...destination,
            provider: "generic" as const,
            timeoutMs: getWebhookDeliveryTimeoutMs(destination.timeoutMs)
          }))
      : [];

  if (
    n8nDestinations.length > 0 ||
    hubSpotDestinations.length > 0 ||
    genericDestinations.length > 0
  ) {
    return [...n8nDestinations, ...hubSpotDestinations, ...genericDestinations].filter(
      (destination) =>
        Boolean(destination?.name?.trim()) && Boolean(destination?.url?.trim())
    );
  }

  const n8nUrl = getOptionalEnv("N8N_WEBHOOK_URL");
  if (!n8nUrl) {
    return [];
  }

  return [
    {
      name: "n8n-primary",
      url: n8nUrl,
      secret: getOptionalEnv("N8N_WEBHOOK_SECRET"),
      provider: "generic",
      timeoutMs: DEFAULT_DELIVERY_TIMEOUT_MS
    }
  ];
}

async function seedPendingDeliveries(limit: number) {
  const destinations = getOutboundWebhookDestinations();
  if (destinations.length === 0) {
    return 0;
  }

  const events = await prisma.domainEvent.findMany({
    where: {
      status: {
        in: [DomainEventStatus.PENDING, DomainEventStatus.PROCESSING]
      }
    },
    orderBy: { occurredAt: "asc" },
    take: limit
  });

  let createdCount = 0;

  for (const event of events) {
    for (const destination of destinations) {
      if (
        destination.provider === "hubspot" &&
        !shouldSyncHubSpotEvent(event.type)
      ) {
        continue;
      }

      if (
        destination.provider === "n8n" &&
        !shouldDispatchEventToN8nWorkflow({
          workflow: destination.name as N8nWorkflowName,
          eventType: event.type,
          payload: event.payload
        })
      ) {
        continue;
      }

      const existing = await prisma.webhookDelivery.findUnique({
        where: {
          eventId_destination: {
            eventId: event.id,
            destination: destination.name
          }
        }
      });

      if (existing) {
        continue;
      }

      await prisma.webhookDelivery.create({
        data: {
          eventId: event.id,
          destination: destination.name,
          requestUrl:
            destination.provider === "hubspot" ? "hubspot://crm-sync" : destination.url
        }
      });
      createdCount += 1;
    }
  }

  return createdCount;
}

async function recoverStaleWebhookDeliveries(limit: number) {
  const staleBefore = new Date(
    Date.now() - getStaleDeliveryMinutes() * 60 * 1000
  );
  const staleDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PROCESSING,
      OR: [
        { lastAttemptAt: { lt: staleBefore } },
        { updatedAt: { lt: staleBefore } }
      ]
    },
    orderBy: { updatedAt: "asc" },
    take: limit
  });

  let recovered = 0;

  for (const delivery of staleDeliveries) {
    if (
      !isProcessingClaimStale({
        processingStartedAt: delivery.updatedAt,
        lastAttemptAt: delivery.lastAttemptAt,
        staleAfterMs: getStaleDeliveryMinutes() * 60 * 1000
      })
    ) {
      continue;
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status:
          delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS
            ? WebhookDeliveryStatus.FAILED
            : WebhookDeliveryStatus.RETRYING,
        nextRetryAt:
          delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS ? null : new Date(),
        lastError:
          delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS
            ? "Webhook delivery exhausted retries after becoming stale in processing."
            : "Webhook delivery was recovered after exceeding the processing timeout."
      }
    });

    await reconcileEventStatus(delivery.eventId);
    recovered += 1;
  }

  return recovered;
}

async function reconcileEventStatus(eventId: string) {
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { eventId },
    select: { status: true }
  });

  if (deliveries.length === 0) {
    return;
  }

  const nextStatus = deliveries.every(
    (delivery) => delivery.status === WebhookDeliveryStatus.DELIVERED
  )
    ? DomainEventStatus.PROCESSED
    : deliveries.some(
          (delivery) => delivery.status === WebhookDeliveryStatus.PROCESSING
        )
      ? DomainEventStatus.PROCESSING
      : deliveries.every(
            (delivery) => delivery.status === WebhookDeliveryStatus.FAILED
          )
        ? DomainEventStatus.FAILED
        : DomainEventStatus.PENDING;

  await prisma.domainEvent.update({
    where: { id: eventId },
    data: { status: nextStatus }
  });
}

async function deliverWebhook(deliveryId: string, destination: OutboundWebhookDestination) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      event: true
    }
  });

  if (!delivery) {
    return { delivered: false, skipped: true as const };
  }

  const claimedAt = new Date();
  const claim = await prisma.webhookDelivery.updateMany({
    where: {
      id: delivery.id,
      status: {
        in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRYING]
      },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: claimedAt } }]
    },
    data: {
      status: WebhookDeliveryStatus.PROCESSING,
      attemptCount: {
        increment: 1
      },
      lastAttemptAt: claimedAt
    }
  });

  if (claim.count === 0) {
    return { delivered: false, skipped: true as const };
  }

  const refreshed = await prisma.webhookDelivery.findUnique({
    where: { id: delivery.id },
    include: { event: true }
  });

  if (!refreshed) {
    return { delivered: false, skipped: true as const };
  }

  const correlationId = buildCorrelationId("webhook");
  const envelope =
    destination.provider === "n8n"
      ? buildN8nEnvelope({
          delivery: refreshed,
          event: refreshed.event,
          workflow: destination.name,
          correlationId
        })
      : {
          id: refreshed.event.id,
          idempotencyKey: refreshed.event.idempotencyKey,
          type: refreshed.event.type,
          aggregateType: refreshed.event.aggregateType,
          aggregateId: refreshed.event.aggregateId,
          orgId: refreshed.event.orgId,
          userId: refreshed.event.userId,
          occurredAt: refreshed.event.occurredAt.toISOString(),
          payload: refreshed.event.payload
        };
  const body = JSON.stringify(envelope);
  const headers =
    destination.provider === "n8n"
      ? buildN8nSignedHeaders(body, destination.secret)
      : buildSignedHeaders(body, destination.secret);

  try {
    const timeoutMs = getWebhookDeliveryTimeoutMs(destination.timeoutMs);

    if (destination.provider === "hubspot") {
      await syncDomainEventToHubSpot({
        event: refreshed.event,
        timeoutMs
      });

      await prisma.webhookDelivery.update({
        where: { id: refreshed.id },
        data: {
          status: WebhookDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          responseStatus: 200,
          nextRetryAt: null,
          lastError: null
        }
      });

      await reconcileEventStatus(refreshed.eventId);
      if (refreshed.event.aggregateType === "report") {
        await markCustomerRunCrmSyncResult({
          reportId: refreshed.event.aggregateId,
          delivered: true
        });
      }

      logServerEvent("info", "outbound.webhook.delivered", {
        correlationId,
        eventId: refreshed.eventId,
        deliveryId: refreshed.id,
        destination: destination.name,
        provider: destination.provider ?? "generic"
      });

      return { delivered: true, skipped: false as const };
    }

    const response = await fetch(destination.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-evolve-edge-correlation-id": correlationId,
        "x-evolve-edge-event-id": refreshed.eventId,
        "x-evolve-edge-delivery-id": refreshed.id,
        "x-evolve-edge-idempotency-key": `webhook-delivery:${refreshed.id}`,
        ...headers
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Destination returned ${response.status}`);
    }

    await prisma.webhookDelivery.update({
      where: { id: refreshed.id },
      data: {
        status: WebhookDeliveryStatus.DELIVERED,
        deliveredAt: new Date(),
        responseStatus: response.status,
        nextRetryAt: null,
        lastError: null
      }
    });

    await reconcileEventStatus(refreshed.eventId);

    logServerEvent("info", "outbound.webhook.delivered", {
      correlationId,
      eventId: refreshed.eventId,
      deliveryId: refreshed.id,
      destination: destination.name,
      provider: destination.provider ?? "generic",
      responseStatus: response.status
    });

    return { delivered: true, skipped: false as const };
  } catch (error) {
    const normalizedError = normalizeExternalError(
      error,
      "Outbound webhook delivery failed."
    );
    const shouldRetry =
      refreshed.attemptCount < MAX_DELIVERY_ATTEMPTS && normalizedError.retryable;
    const nextRetryAt = shouldRetry
      ? new Date(Date.now() + getRetryDelayMinutes(refreshed.attemptCount) * 60 * 1000)
      : null;

    await prisma.webhookDelivery.update({
      where: { id: refreshed.id },
      data: {
        status: shouldRetry
          ? WebhookDeliveryStatus.RETRYING
          : WebhookDeliveryStatus.FAILED,
        nextRetryAt,
        lastError: normalizedError.message
      }
    });

    await reconcileEventStatus(refreshed.eventId);
    if (
      destination.provider === "hubspot" &&
      refreshed.event.aggregateType === "report"
    ) {
      await markCustomerRunCrmSyncResult({
        reportId: refreshed.event.aggregateId,
        delivered: false,
        errorMessage: normalizedError.message
      });
    }
    logServerEvent("warn", "outbound.webhook.delivery_failed", {
      correlationId,
      eventId: refreshed.eventId,
      deliveryId: refreshed.id,
      destination: destination.name,
      provider: destination.provider ?? "generic",
      attemptCount: refreshed.attemptCount,
      retryable: normalizedError.retryable,
      category: normalizedError.category,
      statusCode: normalizedError.statusCode,
      message: normalizedError.message
    });
    await sendOperationalAlert({
      source: "outbound.webhook",
      title: "Outbound delivery failed",
      severity: shouldRetry ? "warn" : "error",
      metadata: {
        correlationId,
        eventId: refreshed.eventId,
        deliveryId: refreshed.id,
        destination: destination.name,
        provider: destination.provider ?? "generic",
        attemptCount: refreshed.attemptCount,
        retryable: normalizedError.retryable,
        category: normalizedError.category,
        statusCode: normalizedError.statusCode,
        message: normalizedError.message
      }
    });

    return { delivered: false, skipped: false as const };
  }
}

export async function dispatchPendingWebhookDeliveries(options?: { limit?: number }) {
  const destinations = getOutboundWebhookDestinations();
  if (destinations.length === 0) {
    return {
      destinationsConfigured: 0,
      deliveriesSeeded: 0,
      processed: 0,
      delivered: 0,
      failed: 0
    };
  }

  const limit = options?.limit ?? 25;
  const deliveriesSeeded = await seedPendingDeliveries(limit);
  const recoveredStale = await recoverStaleWebhookDeliveries(limit);
  const dueDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: {
        in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRYING]
      },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let delivered = 0;
  let failed = 0;
  let reviewRequired = 0;

  for (const delivery of dueDeliveries) {
    const destination = destinations.find(
      (item) => item.name === delivery.destination
    );

    if (!destination) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          lastError: `Missing destination configuration: ${delivery.destination}`
        }
      });
      await prisma.domainEvent.update({
        where: { id: delivery.eventId },
        data: { status: DomainEventStatus.FAILED }
      });
      await sendOperationalAlert({
        source: "outbound.webhook",
        title: "Outbound delivery destination missing",
        severity: "error",
        metadata: {
          eventId: delivery.eventId,
          deliveryId: delivery.id,
          destination: delivery.destination
        }
      });
      failed += 1;
      reviewRequired += 1;
      continue;
    }

    const result = await deliverWebhook(delivery.id, destination);
    if (result.skipped) {
      continue;
    }

    if (result.delivered) {
      delivered += 1;
    } else {
      failed += 1;
      const latestDelivery = await prisma.webhookDelivery.findUnique({
        where: { id: delivery.id },
        select: { status: true }
      });
      if (latestDelivery?.status === WebhookDeliveryStatus.FAILED) {
        reviewRequired += 1;
      }
    }
  }

  return {
    destinationsConfigured: destinations.length,
    deliveriesSeeded,
    recoveredStale,
    processed: dueDeliveries.length,
    delivered,
    failed,
    reviewRequired
  };
}

export async function ensureWebhookDeliveriesForEvent(eventId: string) {
  const event = await prisma.domainEvent.findUnique({
    where: { id: eventId }
  });

  if (!event) {
    throw new Error("Domain event was not found.");
  }

  const destinations = getOutboundWebhookDestinations();
  let created = 0;

  for (const destination of destinations) {
    if (
      destination.provider === "hubspot" &&
      !shouldSyncHubSpotEvent(event.type)
    ) {
      continue;
    }

    if (
      destination.provider === "n8n" &&
      !shouldDispatchEventToN8nWorkflow({
        workflow: destination.name as N8nWorkflowName,
        eventType: event.type,
        payload: event.payload
      })
    ) {
      continue;
    }

    const existing = await prisma.webhookDelivery.findUnique({
      where: {
        eventId_destination: {
          eventId,
          destination: destination.name
        }
      }
    });

    if (existing) {
      continue;
    }

    await prisma.webhookDelivery.create({
      data: {
        eventId,
        destination: destination.name,
        requestUrl:
          destination.provider === "hubspot" ? "hubspot://crm-sync" : destination.url
      }
    });
    created += 1;
  }

  return created;
}

export async function replayWebhookDeliveryById(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId }
  });

  if (!delivery) {
    throw new Error("Webhook delivery was not found.");
  }

  const destination = getOutboundWebhookDestinations().find(
    (item) => item.name === delivery.destination
  );

  if (!destination) {
    throw new Error(`Missing destination configuration: ${delivery.destination}`);
  }

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: WebhookDeliveryStatus.RETRYING,
      nextRetryAt: new Date(),
      lastError: null
    }
  });

  await prisma.domainEvent.update({
    where: { id: delivery.eventId },
    data: { status: DomainEventStatus.PENDING }
  });

  const result = await deliverWebhook(deliveryId, destination);
  const refreshed = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { event: true }
  });

  return {
    delivery: refreshed,
    delivered: result.delivered,
    skipped: result.skipped
  };
}

export async function replayDomainEventDeliveries(eventId: string) {
  await ensureWebhookDeliveriesForEvent(eventId);

  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      eventId,
      status: {
        in: [
          WebhookDeliveryStatus.FAILED,
          WebhookDeliveryStatus.RETRYING,
          WebhookDeliveryStatus.PENDING
        ]
      }
    },
    orderBy: { createdAt: "asc" }
  });

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const result = await replayWebhookDeliveryById(delivery.id);
    if (result.skipped) {
      skipped += 1;
      continue;
    }

    if (result.delivered) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  return {
    eventId,
    deliveriesConsidered: deliveries.length,
    delivered,
    failed,
    skipped
  };
}

export async function getFailedWebhookDeliveries(options?: {
  limit?: number;
  orgId?: string;
}) {
  return prisma.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.FAILED,
      event: options?.orgId
        ? {
            orgId: options.orgId
          }
        : undefined
    },
    include: {
      event: true
    },
    orderBy: [{ updatedAt: "desc" }],
    take: options?.limit ?? 10
  });
}

export function requireOutboundDispatchSecret() {
  return requireEnv("OUTBOUND_DISPATCH_SECRET");
}
