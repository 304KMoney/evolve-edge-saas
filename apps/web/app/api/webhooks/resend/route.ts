import {
  EmailNotificationStatus,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { logAndCaptureServerError } from "../../../../lib/observability";
import { sendOperationalAlert } from "../../../../lib/monitoring";
import { recordOperationalFinding } from "../../../../lib/operations-queues";
import {
  buildResendNotificationStatusUpdate,
  getResendFailureMessage,
  isResendFailureEvent,
  shouldSkipResendNotificationSideEffects
} from "../../../../lib/resend-webhook";
import { requireEnv } from "../../../../lib/runtime-config";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { verifySvixWebhookSignature } from "../../../../lib/security-webhooks";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const route = "api.webhooks.resend";
  const rateLimited = applyRouteRateLimit(request, {
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
    const providerMessageId = event.data?.email_id ?? null;
    const failureMessage = isResendFailureEvent(event.type)
      ? getResendFailureMessage({
          eventType: event.type,
          bounceMessage: event.data?.bounce?.message ?? null
        })
      : null;
    const notification = providerMessageId
      ? await prisma.emailNotification.findFirst({
          where: { providerMessageId },
          orderBy: { createdAt: "desc" }
        })
      : null;
    const deduped = shouldSkipResendNotificationSideEffects({
      eventType: event.type,
      notification,
      failureMessage
    });

    if (deduped) {
      return NextResponse.json({
        ok: true,
        deduped: true,
        eventType: event.type,
        messageId,
        providerMessageId
      });
    }

    if (event.type === "email.delivered" && notification) {
      const updateData = buildResendNotificationStatusUpdate({
        eventType: event.type,
        notification
      });

      if (notification.status !== EmailNotificationStatus.SENT && updateData) {
        await prisma.emailNotification.update({
          where: { id: notification.id },
          data: updateData
        });
      }

      return NextResponse.json({ ok: true, eventType: event.type, messageId });
    }

    if (isResendFailureEvent(event.type)) {
      const updateData = buildResendNotificationStatusUpdate({
        eventType: event.type,
        notification,
        failureMessage
      });

      if (notification && updateData) {
        await prisma.emailNotification.update({
          where: { id: notification.id },
          data: updateData
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
          sourceRecordId: providerMessageId ?? messageId,
          title: "Transactional email delivery failed",
          summary:
            "Resend reported a bounced/failed customer notification. Review recipient validity and provider event details.",
          recommendedAction:
            "Inspect email notification logs and provider event payload, then retry or contact the customer through an alternate channel.",
          metadata: {
            eventType: event.type,
            providerMessageId,
            recipient: event.data?.to?.[0] ?? null,
            subject: event.data?.subject ?? null,
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
          recipient: event.data?.to?.[0] ?? null,
          organizationId: notification?.orgId ?? null
        }
      });

      return NextResponse.json({ ok: true, eventType: event.type, messageId });
    }

    return NextResponse.json({ ok: true, ignored: true, eventType: event.type, messageId });
  } catch (error) {
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
