import {
  Prisma,
  ScheduledJobStatus,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { publishDomainEvent } from "./domain-events";
import { cleanupExpiredComplianceData } from "./data-retention";
import { dispatchQueuedAssessmentAnalysisJobs } from "./ai-execution";
import {
  dispatchPendingEmailNotifications,
  queueRenewalReminderNotifications
} from "./email";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { getOptionalEnv, requireEnv } from "./runtime-config";
import { getOrganizationUsageSnapshot } from "./usage";
import { dispatchPendingWebhookDeliveries } from "./webhook-dispatcher";

type JobName =
  | "dispatch-email-notifications"
  | "retry-webhook-deliveries"
  | "retry-ai-analysis"
  | "retry-dify-analysis"
  | "data-retention-cleanup"
  | "renewal-reminders"
  | "stale-onboarding-check"
  | "low-activity-check";

type JobResult = {
  jobName: JobName;
  status: "SUCCEEDED" | "FAILED";
  summary: Prisma.InputJsonValue;
  errorMessage?: string;
};

const JOB_NAMES: JobName[] = [
  "dispatch-email-notifications",
  "retry-webhook-deliveries",
  "retry-ai-analysis",
  "data-retention-cleanup",
  "renewal-reminders",
  "stale-onboarding-check",
  "low-activity-check"
];

function getDateBucket() {
  return new Date().toISOString().slice(0, 10);
}

function getCronSecret() {
  return requireEnv("CRON_SECRET");
}

function getWebhookJobLimit() {
  const value = Number(getOptionalEnv("SCHEDULED_JOBS_WEBHOOK_LIMIT") ?? "50");
  return Number.isFinite(value) && value > 0 ? value : 50;
}

function getAnalysisJobLimit() {
  const value = Number(getOptionalEnv("SCHEDULED_JOBS_ANALYSIS_LIMIT") ?? "10");
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function getRenewalJobLimit() {
  const value = Number(getOptionalEnv("SCHEDULED_JOBS_RENEWAL_LIMIT") ?? "25");
  return Number.isFinite(value) && value > 0 ? value : 25;
}

function getStaleOnboardingDays() {
  const value = Number(getOptionalEnv("STALE_ONBOARDING_DAYS") ?? "3");
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function getLowActivityDays() {
  const value = Number(getOptionalEnv("LOW_ACTIVITY_DAYS") ?? "21");
  return Number.isFinite(value) && value > 0 ? value : 21;
}

export function requireCronSecret() {
  return getCronSecret();
}

async function recordJobRun(input: {
  jobName: JobName;
  triggerSource: string;
  execute: () => Promise<Prisma.InputJsonValue>;
}): Promise<JobResult> {
  const startedAt = new Date();
  const run = await prisma.scheduledJobRun.create({
    data: {
      jobName: input.jobName,
      triggerSource: input.triggerSource,
      status: ScheduledJobStatus.RUNNING,
      startedAt
    }
  });

  try {
    const summary = await input.execute();
    const completedAt = new Date();

    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        status: ScheduledJobStatus.SUCCEEDED,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        summaryJson: summary,
        errorMessage: null
      }
    });

    logServerEvent("info", "scheduled.job.succeeded", {
      jobName: input.jobName,
      triggerSource: input.triggerSource
    });

    return {
      jobName: input.jobName,
      status: "SUCCEEDED",
      summary
    };
  } catch (error) {
    const completedAt = new Date();
    const errorMessage =
      error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";

    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        status: ScheduledJobStatus.FAILED,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage
      }
    });

    logServerEvent("error", "scheduled.job.failed", {
      jobName: input.jobName,
      triggerSource: input.triggerSource,
      message: errorMessage
    });
    await sendOperationalAlert({
      source: "scheduled.jobs",
      title: "Scheduled job failed",
      metadata: {
        jobName: input.jobName,
        triggerSource: input.triggerSource,
        message: errorMessage
      }
    });

    return {
      jobName: input.jobName,
      status: "FAILED",
      summary: {},
      errorMessage
    };
  }
}

async function runWebhookRetryJob() {
  return dispatchPendingWebhookDeliveries({
    limit: getWebhookJobLimit()
  }) as Promise<Prisma.InputJsonValue>;
}

async function runEmailDispatchJob() {
  return dispatchPendingEmailNotifications({
    limit: getRenewalJobLimit()
  }) as Promise<Prisma.InputJsonValue>;
}

async function runAiRetryJob() {
  return dispatchQueuedAssessmentAnalysisJobs({
    limit: getAnalysisJobLimit()
  }) as Promise<Prisma.InputJsonValue>;
}

async function runDataRetentionCleanupJob() {
  return cleanupExpiredComplianceData() as Promise<Prisma.InputJsonValue>;
}

async function runRenewalReminderJob() {
  return queueRenewalReminderNotifications({
    limit: getRenewalJobLimit()
  }) as Promise<Prisma.InputJsonValue>;
}

async function runStaleOnboardingCheck() {
  const cutoff = new Date(
    Date.now() - getStaleOnboardingDays() * 24 * 60 * 60 * 1000
  );
  const dateBucket = getDateBucket();
  const organizations = await prisma.organization.findMany({
    where: {
      onboardingCompletedAt: null,
      createdAt: { lte: cutoff }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      createdByUserId: true
    },
    take: 50
  });

  let flagged = 0;

  for (const organization of organizations) {
    await publishDomainEvent(prisma, {
      type: "onboarding.stale_detected",
      aggregateType: "organization",
      aggregateId: organization.id,
      orgId: organization.id,
      userId: organization.createdByUserId ?? null,
      idempotencyKey: `onboarding.stale_detected:${organization.id}:${dateBucket}`,
      payload: {
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        createdAt: organization.createdAt.toISOString(),
        staleDays: getStaleOnboardingDays()
      }
    });
    flagged += 1;
  }

  return {
    flagged,
    cutoff: cutoff.toISOString()
  } satisfies Prisma.InputJsonValue;
}

async function runLowActivityCheck() {
  const cutoff = new Date(
    Date.now() - getLowActivityDays() * 24 * 60 * 60 * 1000
  );
  const dateBucket = getDateBucket();
  const organizations = await prisma.organization.findMany({
    where: {
      onboardingCompletedAt: { not: null },
      subscriptions: {
        some: {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]
          }
        }
      }
    },
    select: {
      id: true,
      name: true
    },
    take: 100
  });

  let flagged = 0;

  for (const organization of organizations) {
    const usage = await getOrganizationUsageSnapshot(organization.id);
    if (usage.lastActivityAt && usage.lastActivityAt > cutoff) {
      continue;
    }

    await publishDomainEvent(prisma, {
      type: "customer.low_activity_detected",
      aggregateType: "organization",
      aggregateId: organization.id,
      orgId: organization.id,
      idempotencyKey: `customer.low_activity_detected:${organization.id}:${dateBucket}`,
      payload: {
        organizationId: organization.id,
        organizationName: organization.name,
        lastActivityAt: usage.lastActivityAt?.toISOString() ?? null,
        assessmentsCount: usage.assessmentsCount,
        reportsCount: usage.reportsCount,
        activeMembersCount: usage.activeMembersCount,
        lowActivityDays: getLowActivityDays()
      }
    });
    flagged += 1;
  }

  return {
    flagged,
    cutoff: cutoff.toISOString()
  } satisfies Prisma.InputJsonValue;
}

async function executeNamedJob(jobName: JobName) {
  switch (jobName) {
    case "dispatch-email-notifications":
      return runEmailDispatchJob();
    case "retry-webhook-deliveries":
      return runWebhookRetryJob();
    case "retry-ai-analysis":
    case "retry-dify-analysis":
      return runAiRetryJob();
    case "data-retention-cleanup":
      return runDataRetentionCleanupJob();
    case "renewal-reminders":
      return runRenewalReminderJob();
    case "stale-onboarding-check":
      return runStaleOnboardingCheck();
    case "low-activity-check":
      return runLowActivityCheck();
  }
}

export async function runScheduledJobs(options?: {
  job?: string | null;
  triggerSource?: string;
}) {
  const triggerSource = options?.triggerSource ?? "manual";
  const jobsToRun = options?.job
    ? JOB_NAMES.filter((jobName) => jobName === options.job)
    : JOB_NAMES;

  const results: JobResult[] = [];

  for (const jobName of jobsToRun) {
    results.push(
      await recordJobRun({
        jobName,
        triggerSource,
        execute: () => executeNamedJob(jobName)
      })
    );
  }

  return {
    triggerSource,
    ranAll: !options?.job,
    results
  };
}

export async function getRecentScheduledJobRuns(options?: { limit?: number }) {
  return prisma.scheduledJobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: options?.limit ?? 10
  });
}
