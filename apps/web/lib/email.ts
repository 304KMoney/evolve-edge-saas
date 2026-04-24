import {
  EmailNotificationStatus,
  Prisma,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { shouldBlockDemoExternalSideEffects } from "./demo-mode";
import { logServerEvent } from "./monitoring";
import { getAppUrl, getOptionalEnv, requireEnv } from "./runtime-config";

type EmailDbClient = Prisma.TransactionClient | typeof prisma;

type EmailTemplateKey =
  | "welcome"
  | "invite"
  | "member-joined"
  | "report-ready"
  | "report-delivered"
  | "report-follow-up-3-day"
  | "report-follow-up-7-day"
  | "payment-failed"
  | "renewal-reminder";

type QueueEmailInput = {
  templateKey: EmailTemplateKey;
  recipientEmail: string;
  recipientName?: string | null;
  idempotencyKey: string;
  orgId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  sendAfterAt?: Date | null;
  payload: Prisma.InputJsonValue;
};

const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];

function getRetryDelayMinutes(attemptCount: number) {
  return RETRY_DELAYS_MINUTES[Math.min(attemptCount - 1, RETRY_DELAYS_MINUTES.length - 1)];
}

function getEmailProvider() {
  return getOptionalEnv("EMAIL_PROVIDER") ?? "resend";
}

function getEmailFromAddress() {
  return requireEnv("EMAIL_FROM_ADDRESS");
}

function getEmailReplyTo() {
  return getOptionalEnv("EMAIL_REPLY_TO");
}

function getNotificationDispatchSecret() {
  return requireEnv("NOTIFICATION_DISPATCH_SECRET");
}

function getResendApiKey() {
  return requireEnv("RESEND_API_KEY");
}

function getEmailTimeoutMs() {
  const raw = Number(getOptionalEnv("EMAIL_TIMEOUT_MS") ?? "10000");
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
}

function getRenewalReminderDays() {
  const raw = Number(getOptionalEnv("RENEWAL_REMINDER_DAYS") ?? "14");
  return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function renderLayout(input: {
  preview: string;
  heading: string;
  body: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const bodyHtml = input.body.map((line) => `<p style="margin:0 0 16px;">${line}</p>`).join("");
  const ctaHtml =
    input.ctaLabel && input.ctaUrl
      ? `<p style="margin:24px 0 0;"><a href="${input.ctaUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600;">${input.ctaLabel}</a></p>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charSet="utf-8" />
    <title>${input.preview}</title>
  </head>
  <body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;color:#16202a;">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #e7ddd0;border-radius:24px;padding:32px;">
        <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Evolve Edge</p>
        <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;">${input.heading}</h1>
        ${bodyHtml}
        ${ctaHtml}
      </div>
    </div>
  </body>
</html>`;
}

function renderEmailTemplate(
  templateKey: EmailTemplateKey,
  payload: Record<string, unknown>
): RenderedEmail {
  switch (templateKey) {
    case "welcome": {
      const organizationName = String(payload.organizationName ?? "your workspace");
      const firstAssessmentName = payload.firstAssessmentName
        ? String(payload.firstAssessmentName)
        : null;
      const dashboardUrl = String(payload.dashboardUrl ?? `${getAppUrl()}/dashboard`);
      const subject = `Welcome to Evolve Edge, ${organizationName}`;
      const body = firstAssessmentName
        ? [
            `${organizationName} is now live in Evolve Edge.`,
            `Your first assessment, "${firstAssessmentName}", is ready for intake so you can begin building your governance baseline today.`
          ]
        : [
            `${organizationName} is now live in Evolve Edge.`,
            "Your workspace is ready. You can start by creating your first assessment and inviting collaborators."
          ];

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Your workspace is ready",
          body,
          ctaLabel: "Open dashboard",
          ctaUrl: dashboardUrl
        }),
        text: [...body, `Open dashboard: ${dashboardUrl}`].join("\n\n")
      };
    }
    case "invite": {
      const organizationName = String(payload.organizationName ?? "Evolve Edge");
      const inviteUrl = String(payload.inviteUrl ?? getAppUrl());
      const inviterName = String(payload.inviterName ?? "Your workspace admin");
      const subject = `You're invited to join ${organizationName} on Evolve Edge`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "You've been invited",
          body: [
            `${inviterName} invited you to join ${organizationName} on Evolve Edge.`,
            "Use the secure link below to accept the invite and access the workspace."
          ],
          ctaLabel: "Accept invite",
          ctaUrl: inviteUrl
        }),
        text: [
          `${inviterName} invited you to join ${organizationName} on Evolve Edge.`,
          `Accept invite: ${inviteUrl}`
        ].join("\n\n")
      };
    }
    case "member-joined": {
      const organizationName = String(payload.organizationName ?? "your workspace");
      const dashboardUrl = String(payload.dashboardUrl ?? `${getAppUrl()}/dashboard`);
      const subject = `You've joined ${organizationName}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "You're in",
          body: [
            `You've successfully joined ${organizationName} on Evolve Edge.`,
            "Open the workspace to review assessments, reports, and assigned governance work."
          ],
          ctaLabel: "Open workspace",
          ctaUrl: dashboardUrl
        }),
        text: [
          `You've successfully joined ${organizationName} on Evolve Edge.`,
          `Open workspace: ${dashboardUrl}`
        ].join("\n\n")
      };
    }
    case "report-ready": {
      const reportTitle = String(payload.reportTitle ?? "Your executive report");
      const organizationName = String(payload.organizationName ?? "your workspace");
      const reportUrl = String(payload.reportUrl ?? `${getAppUrl()}/dashboard/reports`);
      const subject = `Report ready: ${reportTitle}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Your report is ready",
          body: [
            `${reportTitle} is ready for ${organizationName}.`,
            "You can now review the executive summary, findings, and roadmap recommendations."
          ],
          ctaLabel: "View report",
          ctaUrl: reportUrl
        }),
        text: [
          `${reportTitle} is ready for ${organizationName}.`,
          `View report: ${reportUrl}`
        ].join("\n\n")
      };
    }
    case "payment-failed": {
      const organizationName = String(payload.organizationName ?? "your workspace");
      const billingUrl = String(payload.billingUrl ?? `${getAppUrl()}/dashboard/settings`);
      const failureMessage = String(
        payload.failureMessage ?? "Stripe reported a payment problem for the current billing cycle."
      );
      const subject = `Payment issue for ${organizationName}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Billing action required",
          body: [
            `We could not process the latest payment for ${organizationName}.`,
            failureMessage,
            "Update your billing method or review the invoice details to avoid service interruption."
          ],
          ctaLabel: "Open billing",
          ctaUrl: billingUrl
        }),
        text: [
          `We could not process the latest payment for ${organizationName}.`,
          failureMessage,
          `Open billing: ${billingUrl}`
        ].join("\n\n")
      };
    }
    case "report-delivered": {
      const reportTitle = String(payload.reportTitle ?? "Your executive report");
      const organizationName = String(payload.organizationName ?? "your workspace");
      const reportUrl = String(payload.reportUrl ?? `${getAppUrl()}/dashboard/reports`);
      const briefingUrl = String(payload.briefingUrl ?? getAppUrl());
      const executiveSummary = String(
        payload.executiveSummary ??
          "Your report is ready to review, with priority findings and a recommended remediation roadmap."
      ).trim();
      const subject = `Executive report delivered: ${reportTitle}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Your executive audit report is ready",
          body: [
            `${reportTitle} has now been delivered for ${organizationName}.`,
            executiveSummary,
            "Use the report link below to review the findings, roadmap, and executive briefing materials. If you want a working session with leadership, use the briefing link to book it."
          ],
          ctaLabel: "Open report",
          ctaUrl: reportUrl
        }),
        text: [
          `${reportTitle} has now been delivered for ${organizationName}.`,
          executiveSummary,
          `Open report: ${reportUrl}`,
          `Book executive briefing: ${briefingUrl}`
        ].join("\n\n")
      };
    }
    case "report-follow-up-3-day": {
      const reportTitle = String(payload.reportTitle ?? "your executive report");
      const organizationName = String(payload.organizationName ?? "your workspace");
      const reportUrl = String(payload.reportUrl ?? `${getAppUrl()}/dashboard/reports`);
      const briefingUrl = String(payload.briefingUrl ?? getAppUrl());
      const subject = `3-day follow-up: ${reportTitle}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Checking in on your report",
          body: [
            `It has been a few days since ${reportTitle} was delivered for ${organizationName}.`,
            "If you have not reviewed the priority findings yet, this is a good moment to align on the top risks and near-term remediation actions.",
            "If it would help, you can book an executive briefing to walk through the report live."
          ],
          ctaLabel: "Book briefing",
          ctaUrl: briefingUrl
        }),
        text: [
          `It has been a few days since ${reportTitle} was delivered for ${organizationName}.`,
          `Open report: ${reportUrl}`,
          `Book briefing: ${briefingUrl}`
        ].join("\n\n")
      };
    }
    case "report-follow-up-7-day": {
      const reportTitle = String(payload.reportTitle ?? "your executive report");
      const organizationName = String(payload.organizationName ?? "your workspace");
      const reportUrl = String(payload.reportUrl ?? `${getAppUrl()}/dashboard/reports`);
      const subject = `7-day follow-up: ${reportTitle}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Next steps after your audit",
          body: [
            `${organizationName} now has a delivered audit baseline for ${reportTitle}.`,
            "The strongest next move is usually to convert the top findings into owned remediation work and decide whether you want ongoing monitoring, remediation support, or a deeper advisory follow-on."
          ],
          ctaLabel: "Review report",
          ctaUrl: reportUrl
        }),
        text: [
          `${organizationName} now has a delivered audit baseline for ${reportTitle}.`,
          `Review report: ${reportUrl}`
        ].join("\n\n")
      };
    }
    case "renewal-reminder": {
      const organizationName = String(payload.organizationName ?? "your workspace");
      const billingUrl = String(payload.billingUrl ?? `${getAppUrl()}/dashboard/settings`);
      const planName = String(payload.planName ?? "current plan");
      const renewalDate = String(payload.renewalDate ?? "soon");
      const subject = `Renewal reminder for ${organizationName}`;

      return {
        subject,
        html: renderLayout({
          preview: subject,
          heading: "Upcoming renewal",
          body: [
            `${organizationName} is scheduled to renew on ${renewalDate}.`,
            `Your current plan is ${planName}. Review billing details now if you need to make changes before renewal.`
          ],
          ctaLabel: "Review billing",
          ctaUrl: billingUrl
        }),
        text: [
          `${organizationName} is scheduled to renew on ${renewalDate}.`,
          `Current plan: ${planName}`,
          `Review billing: ${billingUrl}`
        ].join("\n\n")
      };
    }
    default:
      throw new Error(`Unsupported email template: ${templateKey}`);
  }
}

function normalizePayload(payload: Prisma.InputJsonValue) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Prisma.InputJsonValue)
    : ({} as Prisma.InputJsonValue);
}

export async function queueEmailNotification(
  db: EmailDbClient,
  input: QueueEmailInput
) {
  const provider = getEmailProvider();
  const payloadObject = normalizePayload(input.payload);
  const rendered = renderEmailTemplate(
    input.templateKey,
    payloadObject as Record<string, unknown>
  );

  return db.emailNotification.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      payload: payloadObject,
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      eventId: input.eventId ?? null,
      nextRetryAt: input.sendAfterAt ?? null,
      provider
    },
    create: {
      templateKey: input.templateKey,
      provider,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      idempotencyKey: input.idempotencyKey,
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      eventId: input.eventId ?? null,
      nextRetryAt: input.sendAfterAt ?? null,
      payload: payloadObject
    }
  });
}

async function sendWithResend(notification: {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  htmlBody: string;
  textBody: string;
  idempotencyKey: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": notification.idempotencyKey
    },
    body: JSON.stringify({
      from: getEmailFromAddress(),
      to: notification.recipientName
        ? [`${notification.recipientName} <${notification.recipientEmail}>`]
        : [notification.recipientEmail],
      reply_to: getEmailReplyTo() ?? undefined,
      subject: notification.subject,
      html: notification.htmlBody,
      text: notification.textBody
    }),
    signal: AbortSignal.timeout(getEmailTimeoutMs())
  });

  const body = response.status === 204 ? null : await response.text();

  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${body ?? ""}`.trim());
  }

  const parsed = body ? (JSON.parse(body) as { id?: string }) : {};
  return {
    messageId: parsed.id ?? null,
    responseStatus: response.status
  };
}

export async function dispatchPendingEmailNotifications(options?: { limit?: number }) {
  if (shouldBlockDemoExternalSideEffects()) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: true
    };
  }

  const limit = options?.limit ?? 25;
  const dueNotifications = await prisma.emailNotification.findMany({
    where: {
      status: {
        in: [EmailNotificationStatus.PENDING, EmailNotificationStatus.FAILED]
      },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let sent = 0;
  let failed = 0;

  for (const notification of dueNotifications) {
    const claim = await prisma.emailNotification.updateMany({
      where: {
        id: notification.id,
        status: {
          in: [EmailNotificationStatus.PENDING, EmailNotificationStatus.FAILED]
        }
      },
      data: {
        status: EmailNotificationStatus.PROCESSING,
        attemptCount: {
          increment: 1
        },
        lastAttemptAt: new Date(),
        failedAt: null,
        lastError: null
      }
    });

    if (claim.count === 0) {
      continue;
    }

    const refreshed = await prisma.emailNotification.findUnique({
      where: { id: notification.id }
    });

    if (!refreshed) {
      continue;
    }

    try {
      const result = await sendWithResend(refreshed);

      await prisma.emailNotification.update({
        where: { id: refreshed.id },
        data: {
          status: EmailNotificationStatus.SENT,
          providerMessageId: result.messageId,
          responseStatus: result.responseStatus,
          sentAt: new Date(),
          nextRetryAt: null,
          lastError: null
        }
      });

      logServerEvent("info", "email.notification.sent", {
        notificationId: refreshed.id,
        templateKey: refreshed.templateKey,
        recipientEmail: refreshed.recipientEmail,
        provider: refreshed.provider
      });
      sent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
      const shouldRetry = refreshed.attemptCount < MAX_EMAIL_ATTEMPTS;
      const nextRetryAt = shouldRetry
        ? new Date(Date.now() + getRetryDelayMinutes(refreshed.attemptCount) * 60 * 1000)
        : null;

      await prisma.emailNotification.update({
        where: { id: refreshed.id },
        data: {
          status: EmailNotificationStatus.FAILED,
          failedAt: new Date(),
          nextRetryAt,
          lastError: message
        }
      });

      logServerEvent("warn", "email.notification.failed", {
        notificationId: refreshed.id,
        templateKey: refreshed.templateKey,
        recipientEmail: refreshed.recipientEmail,
        message
      });
      failed += 1;
    }
  }

  return {
    processed: dueNotifications.length,
    sent,
    failed
  };
}

export async function queueRenewalReminderNotifications(options?: { limit?: number }) {
  const limit = options?.limit ?? 25;
  const now = new Date();
  const renewalWindow = new Date(
    now.getTime() + getRenewalReminderDays() * 24 * 60 * 60 * 1000
  );

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: {
        gt: now,
        lte: renewalWindow
      }
    },
    include: {
      organization: {
        include: {
          members: {
            where: { role: "OWNER" },
            include: { user: true },
            orderBy: { createdAt: "asc" },
            take: 1
          }
        }
      },
      plan: true
    },
    orderBy: { currentPeriodEnd: "asc" },
    take: limit
  });

  let queued = 0;

  for (const subscription of subscriptions) {
    const owner = subscription.organization.members[0]?.user;
    if (!owner?.email || !subscription.currentPeriodEnd) {
      continue;
    }

    await queueEmailNotification(prisma, {
      templateKey: "renewal-reminder",
      recipientEmail: owner.email,
      recipientName: owner.firstName ?? null,
      orgId: subscription.organizationId,
      userId: owner.id,
      idempotencyKey: `email:renewal-reminder:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`,
      payload: {
        organizationName: subscription.organization.name,
        planName: subscription.plan.name,
        renewalDate: subscription.currentPeriodEnd.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }),
        billingUrl: `${getAppUrl()}/dashboard/settings`
      }
    });

    queued += 1;
  }

  return {
    queued
  };
}

export async function getRecentEmailNotifications(options?: {
  orgId?: string;
  limit?: number;
}) {
  return prisma.emailNotification.findMany({
    where: {
      orgId: options?.orgId
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 10
  });
}

export function requireNotificationDispatchSecret() {
  return getNotificationDispatchSecret();
}
