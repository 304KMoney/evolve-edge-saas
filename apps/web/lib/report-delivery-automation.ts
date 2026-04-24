import {
  BillingAccessState,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { getCurrentSubscription } from "./billing";
import { publishDomainEvent } from "./domain-events";
import { queueEmailNotification } from "./email";
import { syncOrganizationEngagementPrograms } from "./engagement-programs";
import { getAppUrl, getFoundingRiskAuditCallUrl } from "./runtime-config";

type ReportDeliveryAutomationDbClient = Prisma.TransactionClient | typeof prisma;

type ReportDeliveryAutomationReport = {
  id: string;
  organizationId: string;
  assessmentId: string;
  customerAccountId: string | null;
  title: string;
  executiveSummary: string | null;
  customerEmailSnapshot: string | null;
  organization: {
    id: string;
    name: string;
  };
  customerAccount?: {
    id: string;
    primaryContactEmail: string;
    companyName: string | null;
  } | null;
};

export function isPaidReportDeliveryAccessState(
  accessState: BillingAccessState | null | undefined
) {
  return (
    accessState === BillingAccessState.ACTIVE ||
    accessState === BillingAccessState.GRACE_PERIOD
  );
}

export async function assertPaidReportDeliveryEligibility(organizationId: string) {
  const subscription = await getCurrentSubscription(organizationId);

  if (!subscription || !isPaidReportDeliveryAccessState(subscription.accessState)) {
    throw new Error(
      "Report delivery is restricted to organizations with an active paid subscription."
    );
  }

  return subscription;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function truncateSentence(value: string | null | undefined, maxLength = 420) {
  const normalized = value?.trim();
  if (!normalized) {
    return "Your report is ready to review, with priority findings and a recommended remediation roadmap.";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

function resolveDeliveryRecipient(report: ReportDeliveryAutomationReport) {
  const email =
    report.customerEmailSnapshot?.trim() ||
    report.customerAccount?.primaryContactEmail?.trim() ||
    null;
  const recipientName =
    report.customerAccount?.companyName?.trim() ||
    report.organization.name;

  return {
    email,
    recipientName
  };
}

export async function queuePostReportDeliveryAutomation(input: {
  db: ReportDeliveryAutomationDbClient;
  report: ReportDeliveryAutomationReport;
  deliveryPackageId: string;
  actorUserId: string;
  deliveredAt?: Date;
  syncEngagementPrograms?: (
    organizationId: string,
    options: { db: ReportDeliveryAutomationDbClient }
  ) => Promise<unknown>;
}) {
  const deliveredAt = input.deliveredAt ?? new Date();
  const recipient = resolveDeliveryRecipient(input.report);
  const reportUrl = `${getAppUrl()}/dashboard/reports/${input.report.id}`;
  const briefingUrl = getFoundingRiskAuditCallUrl();
  const executiveSummary = truncateSentence(input.report.executiveSummary);

  if (recipient.email) {
    await queueEmailNotification(input.db, {
      templateKey: "report-delivered",
      recipientEmail: recipient.email,
      recipientName: recipient.recipientName,
      idempotencyKey: `email:report-delivered:${input.report.id}`,
      orgId: input.report.organizationId,
      userId: input.actorUserId,
      payload: {
        organizationName: input.report.organization.name,
        reportTitle: input.report.title,
        executiveSummary,
        reportUrl,
        briefingUrl
      }
    });

    await queueEmailNotification(input.db, {
      templateKey: "report-follow-up-3-day",
      recipientEmail: recipient.email,
      recipientName: recipient.recipientName,
      idempotencyKey: `email:report-follow-up-3-day:${input.report.id}`,
      orgId: input.report.organizationId,
      userId: input.actorUserId,
      sendAfterAt: addDays(deliveredAt, 3),
      payload: {
        organizationName: input.report.organization.name,
        reportTitle: input.report.title,
        reportUrl,
        briefingUrl
      }
    });

    await queueEmailNotification(input.db, {
      templateKey: "report-follow-up-7-day",
      recipientEmail: recipient.email,
      recipientName: recipient.recipientName,
      idempotencyKey: `email:report-follow-up-7-day:${input.report.id}`,
      orgId: input.report.organizationId,
      userId: input.actorUserId,
      sendAfterAt: addDays(deliveredAt, 7),
      payload: {
        organizationName: input.report.organization.name,
        reportTitle: input.report.title,
        reportUrl
      }
    });
  }

  await publishDomainEvent(input.db, {
    type: "report.follow_up_scheduled",
    aggregateType: "report",
    aggregateId: input.report.id,
    orgId: input.report.organizationId,
    userId: input.actorUserId,
    idempotencyKey: `report.follow_up_scheduled:${input.report.id}`,
    occurredAt: deliveredAt,
    payload: {
      reportId: input.report.id,
      assessmentId: input.report.assessmentId,
      organizationId: input.report.organizationId,
      reportPackageId: input.deliveryPackageId,
      followUps: [
        {
          dayOffset: 3,
          templateKey: "report-follow-up-3-day",
          scheduledFor: addDays(deliveredAt, 3).toISOString()
        },
        {
          dayOffset: 7,
          templateKey: "report-follow-up-7-day",
          scheduledFor: addDays(deliveredAt, 7).toISOString()
        }
      ]
    } satisfies Prisma.InputJsonValue
  });

  await (input.syncEngagementPrograms ?? syncOrganizationEngagementPrograms)(
    input.report.organizationId,
    {
      db: input.db
    }
  );

  await publishDomainEvent(input.db, {
    type: "report.upsell_opportunity_refreshed",
    aggregateType: "report",
    aggregateId: input.report.id,
    orgId: input.report.organizationId,
    userId: input.actorUserId,
    idempotencyKey: `report.upsell_opportunity_refreshed:${input.report.id}`,
    occurredAt: deliveredAt,
    payload: {
      reportId: input.report.id,
      assessmentId: input.report.assessmentId,
      organizationId: input.report.organizationId,
      reportPackageId: input.deliveryPackageId,
      source: "report_delivery"
    } satisfies Prisma.InputJsonValue
  });

  return {
    recipientEmail: recipient.email,
    reportUrl,
    briefingUrl
  };
}
