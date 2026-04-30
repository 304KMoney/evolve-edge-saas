import {
  EmailNotificationStatus,
  InboundWebhookReceiptStatus,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { maskEmail } from "../../../../lib/intake-observability";
import { logAndCaptureServerError } from "../../../../lib/observability";
import { sendOperationalAlert } from "../../../../lib/monitoring";
import { recordOperationalFinding } from "../../../../lib/operations-queues";
import { requireEnv } from "../../../../lib/runtime-config";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { verifySvixWebhookSignature } from "../../../../lib/security-webhooks";

export const runtime = "nodejs";

const RESEND_PROVIDER = "resend";
const STALE_PROCESSING_WINDOW_MS = 10 * 60 * 1000;

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    bounce?: {
      type?: string;
      message?: string;
    };
  };
};

function parseResendEvent(payload: string) {
  const parsed = JSON.parse(payload) as ResendWebhookEvent;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Invalid Resend webhook payload.");
  }

  return parsed;
}

function readHeader(headers: Headers, key: string) {
  const value = headers.get(key);
  if (!value) {
    throw new Error(`Missing webhook header: ${key}`);
  }

  return value;
}

function isFailureEvent(eventType: string) {
  return ["email.bounced", "email.complained", "email.delivery_delayed"].includes(eventType);
}

async function claimResendWebhookReceipt(input: {
  messageId: string;
  event: ResendWebhookEvent;
}) {
  const receipt = await prisma.inboundWebhookReceipt.upsert({
    where: {
      provider_messageId: {
        provider: RESEND_PROVIDER,
        messageId: input.messageId
      }
    },
    update: {},
    create: {
      provider: RESEND_PROVIDER,
      messageId: input.messageId,
      eventType: input.event.type,
      status: InboundWebhookReceiptStatus.PENDING,
      payload: input.event as unknown as Prisma.InputJsonValue
    },
    select: {
      id: true,
      status: true,
      processedAt: true
    }
  });

  if (receipt.status === InboundWebhookReceiptStatus.PROCESSED && receipt.processedAt) {
    return { claimed: false as const, reason: "processed" as const, receipt };
  }

  const staleBefore = new Date(Date.now() - STALE_PROCESSING_WINDOW_MS);
  const claimed = await prisma.inboundWebhookReceipt.updateMany({
    where: {
      id: receipt.id,
      OR: [
        { status: InboundWebhookReceiptStatus.PENDING },
        { status: InboundWebhookReceiptStatus.FAILED },
        {
          status: InboundWebhookReceiptStatus.PROCESSING,
          OR: [
            { processingStartedAt: null },
            { processingStartedAt: { lt: staleBefore } }
          ]
        }
      ]
    },
    data: {
      eventType: input.event.type,
      status: InboundWebhookReceiptStatus.PROCESSING,
      processingStartedAt: new Date(),
      failedAt: null,
      lastError: null,
      payload: input.event as unknown as Prisma.InputJsonValue
    }
  });

  return {
    claimed: claimed.count > 0,
    reason: claimed.count > 0 ? ("claimed" as const) : ("in-flight" as const),
    receipt
  };
}

async function markResendWebhookReceiptProcessed(messageId: string) {
  await prisma.inboundWebhookReceipt.updateMany({
    where: {
      provider: RESEND_PROVIDER,
      messageId,
      status: InboundWebhookReceiptStatus.PROCESSING
    },
    data: {
      status: InboundWebhookReceiptStatus.PROCESSED,
      processingStartedAt: null,
      processedAt: new Date(),
      failedAt: null,
      lastError: null
    }
  });
}

async function markResendWebhookReceiptFailed(messageId: string, error: unknown) {
  await prisma.inboundWebhookReceipt.updateMany({
    where: {
      provider: RESEND_PROVIDER,
      messageId,
      status: InboundWebhookReceiptStatus.PROCESSING
    },
    data: {
      status: InboundWebhookReceiptStatus.FAILED,
      processingStartedAt: null,
      failedAt: new Date(),
      lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error"
    }
  });
}

export async function POST(request: Request) {
  const route = "api.webhooks.resend";
  const rateLimited = await applyRouteRateLimit(request, {
    key: "webhooks-resend",
    category: "webhook"
  });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const payload = await request.text();
    const messageId = readHeader(request.headers, "svix-id");
    const timestamp = readHeader(request.headers, "svix-timestamp");
    const signature = readHeader(request.headers, "svix-signature");

    verifySvixWebhookSignature({
      payload,
      messageId,
      timestamp,
      signatureHeader: signature,
      webhookSecret: requireEnv("RESEND_WEBHOOK_SIGNING_SECRET")
    });

    const event = parseResendEvent(payload);
    const claimedReceipt = await claimResendWebhookReceipt({ messageId, event });
    if (!claimedReceipt.claimed) {
      return NextResponse.json({
        ok: true,
        deduped: claimedReceipt.reason === "processed",
        processing: claimedReceipt.reason === "in-flight",
        messageId
      });
    }

    const providerMessageId = event.data?.email_id ?? null;
    const notification = providerMessageId
      ? await prisma.emailNotification.findFirst({
          where: { providerMessageId },
          orderBy: { createdAt: "desc" }
        })
      : null;

    if (event.type === "email.delivered" && notification) {
      if (notification.status !== EmailNotificationStatus.SENT) {
        await prisma.emailNotification.update({
          where: { id: notification.id },
          data: {
            status: EmailNotificationStatus.SENT,
            sentAt: notification.sentAt ?? new Date(),
            failedAt: null,
            lastError: null
          }
        });
      }

      await markResendWebhookReceiptProcessed(messageId);
      return NextResponse.json({ ok: true, eventType: event.type, messageId });
    }

    if (isFailureEvent(event.type)) {
      if (notification) {
        await prisma.emailNotification.update({
          where: { id: notification.id },
          data: {
            status: EmailNotificationStatus.FAILED,
            failedAt: new Date(),
            lastError:
              event.data?.bounce?.message?.slice(0, 1000) ??
              `Resend reported ${event.type}`
          }
        });
      }

      if (notification?.orgId) {
        await recordOperationalFinding({
          organizationId: notification.orgId,
          queueType: OperationsQueueType.BILLING_ANOMALY,
          ruleCode: "operations.email_delivery_failed",
          severity: OperationsQueueSeverity.HIGH,
          sourceSystem: OperationsQueueSourceSystem.APP,
          sourceRecordType: "emailWebhook",
          sourceRecordId: messageId,
          title: "Transactional email delivery failed",
          summary:
            "Resend reported a bounced/failed customer notification. Review recipient validity and provider event details.",
          recommendedAction:
            "Inspect email notification logs and provider event payload, then retry or contact the customer through an alternate channel.",
          metadata: {
            eventType: event.type,
            providerMessageId,
            recipientMasked: maskEmail(event.data?.to?.[0]),
            bounceType: event.data?.bounce?.type ?? null,
            occurredAt: event.created_at ?? null
          }
        });
      }

      await sendOperationalAlert({
        source: route,
        title: "Resend email delivery failure received",
        severity: "warn",
        metadata: {
          eventType: event.type,
          messageId,
          providerMessageId,
          recipientMasked: maskEmail(event.data?.to?.[0]),
          organizationId: notification?.orgId ?? null
        }
      });

      await markResendWebhookReceiptProcessed(messageId);
      return NextResponse.json({ ok: true, eventType: event.type, messageId });
    }

    await markResendWebhookReceiptProcessed(messageId);
    return NextResponse.json({ ok: true, ignored: true, eventType: event.type, messageId });
  } catch (error) {
    const messageId = request.headers.get("svix-id");
    if (messageId) {
      await markResendWebhookReceiptFailed(messageId, error);
    }

    await logAndCaptureServerError({
      route,
      event: "webhooks.resend.failed",
      error,
      context: {
        message: error instanceof Error ? error.message : "Unknown error"
      },
      request
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
