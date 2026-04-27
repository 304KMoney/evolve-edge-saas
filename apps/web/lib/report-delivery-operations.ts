import {
  BillingAccessState,
  EmailNotificationStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { formatBillingAccessState, getCurrentSubscription } from "./billing";
import { isPaidReportDeliveryAccessState } from "./report-delivery-automation";
import { getOptionalEnv } from "./runtime-config";

type ReportDeliveryOperationsDbClient = Prisma.TransactionClient | typeof prisma;

type DeliveryNotificationRecord = {
  id: string;
  templateKey: string;
  status: EmailNotificationStatus;
  createdAt: Date;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  idempotencyKey: string;
};

const DELIVERY_EMAIL_TEMPLATE_KEYS = [
  "report-delivered",
  "report-follow-up-3-day",
  "report-follow-up-7-day"
] as const;

const DELIVERY_EMAIL_REQUIRED_ENV_KEYS = [
  "EMAIL_FROM_ADDRESS",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SIGNING_SECRET",
  "NOTIFICATION_DISPATCH_SECRET",
  "CRON_SECRET"
] as const;

export function getReportDeliveryEmailIdempotencyKeys(reportId: string) {
  return [
    `email:report-delivered:${reportId}`,
    `email:report-follow-up-3-day:${reportId}`,
    `email:report-follow-up-7-day:${reportId}`
  ];
}

function hasConfiguredEnv(key: string) {
  return Boolean(getOptionalEnv(key));
}

function getLatestActivityAt(notification: DeliveryNotificationRecord) {
  return (
    notification.sentAt ??
    notification.failedAt ??
    notification.lastAttemptAt ??
    notification.createdAt
  );
}

export function summarizeDeliveryNotifications(
  notifications: DeliveryNotificationRecord[],
  now: Date = new Date()
) {
  const counts = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0
  };
  let dueCount = 0;
  let scheduledCount = 0;
  let latestActivityAt: Date | null = null;

  for (const notification of notifications) {
    if (notification.status === EmailNotificationStatus.PENDING) {
      counts.pending += 1;
    } else if (notification.status === EmailNotificationStatus.PROCESSING) {
      counts.processing += 1;
    } else if (notification.status === EmailNotificationStatus.SENT) {
      counts.sent += 1;
    } else if (notification.status === EmailNotificationStatus.FAILED) {
      counts.failed += 1;
    }

    const nextRetryAt = notification.nextRetryAt?.getTime() ?? null;
    if (notification.status !== EmailNotificationStatus.SENT) {
      if (nextRetryAt !== null && nextRetryAt > now.getTime()) {
        scheduledCount += 1;
      } else {
        dueCount += 1;
      }
    }

    const latestForNotification = getLatestActivityAt(notification);
    if (
      !latestActivityAt ||
      latestForNotification.getTime() > latestActivityAt.getTime()
    ) {
      latestActivityAt = latestForNotification;
    }
  }

  return {
    counts,
    dueCount,
    scheduledCount,
    latestActivityAt,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      templateKey: notification.templateKey,
      status: notification.status,
      createdAt: notification.createdAt,
      scheduledFor: notification.nextRetryAt,
      lastAttemptAt: notification.lastAttemptAt,
      sentAt: notification.sentAt,
      failedAt: notification.failedAt,
      lastError: notification.lastError
    }))
  };
}

function getDeliveryBillingMessage(accessState: BillingAccessState | null) {
  if (isPaidReportDeliveryAccessState(accessState)) {
    return "Delivery can proceed because the workspace has an active paid access state.";
  }

  if (!accessState) {
    return "No active subscription record is available yet, so delivery remains blocked.";
  }

  return "Delivery is blocked until billing returns to an active paid access state in the app-owned subscription record.";
}

function getDispatchEnvironmentSummary() {
  const requiredEnv = DELIVERY_EMAIL_REQUIRED_ENV_KEYS.map((key) => ({
    key,
    configured: hasConfiguredEnv(key)
  }));
  const configured = requiredEnv.every((entry) => entry.configured);

  return {
    configured,
    requiredEnv
  };
}

async function resolveSubscriptionAccessState(
  organizationId: string,
  subscriptionAccessState?: BillingAccessState | null
) {
  if (subscriptionAccessState !== undefined) {
    return subscriptionAccessState;
  }

  const subscription = await getCurrentSubscription(organizationId);
  return subscription?.accessState ?? null;
}

export async function getReportDeliveryOperationsSnapshot(input: {
  organizationId: string;
  reportId: string;
  subscriptionAccessState?: BillingAccessState | null;
  db?: ReportDeliveryOperationsDbClient;
}) {
  const db = input.db ?? prisma;
  const dispatch = getDispatchEnvironmentSummary();
  const [notifications, accessState] = await Promise.all([
    db.emailNotification.findMany({
      where: {
        orgId: input.organizationId,
        idempotencyKey: {
          in: getReportDeliveryEmailIdempotencyKeys(input.reportId)
        }
      },
      select: {
        id: true,
        templateKey: true,
        status: true,
        createdAt: true,
        nextRetryAt: true,
        lastAttemptAt: true,
        sentAt: true,
        failedAt: true,
        lastError: true,
        idempotencyKey: true
      },
      orderBy: { createdAt: "desc" }
    }),
    resolveSubscriptionAccessState(
      input.organizationId,
      input.subscriptionAccessState
    )
  ]);

  return {
    billing: {
      accessState,
      accessStateLabel: formatBillingAccessState(accessState),
      eligible: isPaidReportDeliveryAccessState(accessState),
      message: getDeliveryBillingMessage(accessState)
    },
    dispatch: {
      ...dispatch,
      message: dispatch.configured
        ? "Queued delivery and follow-up emails have the required environment secrets to drain."
        : "Email dispatch is not fully configured yet. Fix the missing environment entries before relying on automated delivery."
    },
    emailQueue: summarizeDeliveryNotifications(notifications)
  };
}

export async function getOrganizationDeliveryOperationsSnapshot(input: {
  organizationId: string;
  subscriptionAccessState?: BillingAccessState | null;
  limit?: number;
  db?: ReportDeliveryOperationsDbClient;
}) {
  const db = input.db ?? prisma;
  const dispatch = getDispatchEnvironmentSummary();
  const [notifications, accessState] = await Promise.all([
    db.emailNotification.findMany({
      where: {
        orgId: input.organizationId,
        templateKey: {
          in: [...DELIVERY_EMAIL_TEMPLATE_KEYS]
        }
      },
      select: {
        id: true,
        templateKey: true,
        status: true,
        createdAt: true,
        nextRetryAt: true,
        lastAttemptAt: true,
        sentAt: true,
        failedAt: true,
        lastError: true,
        idempotencyKey: true
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 12
    }),
    resolveSubscriptionAccessState(
      input.organizationId,
      input.subscriptionAccessState
    )
  ]);

  return {
    billing: {
      accessState,
      accessStateLabel: formatBillingAccessState(accessState),
      eligible: isPaidReportDeliveryAccessState(accessState),
      message: getDeliveryBillingMessage(accessState)
    },
    dispatch: {
      ...dispatch,
      message: dispatch.configured
        ? "Delivery automation secrets are configured for this deployment."
        : "Delivery automation is missing one or more required environment entries."
    },
    emailQueue: summarizeDeliveryNotifications(notifications)
  };
}
