import {
  BillingEventStatus,
  JobStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";

export async function getOpsReadinessSnapshot() {
  const [
    failedBillingEvents,
    failedWebhookDeliveries,
    failedAnalysisJobs,
    failedEmailNotifications,
    failedScheduledJobRuns,
    staleDomainEvents,
    staleOnboardingOrganizations
  ] = await Promise.all([
    prisma.billingEvent.count({
      where: { status: BillingEventStatus.FAILED }
    }),
    prisma.webhookDelivery.count({
      where: { status: WebhookDeliveryStatus.FAILED }
    }),
    prisma.analysisJob.count({
      where: { status: JobStatus.FAILED }
    }),
    prisma.emailNotification.count({
      where: { status: "FAILED" }
    }),
    prisma.scheduledJobRun.count({
      where: { status: "FAILED" }
    }),
    prisma.domainEvent.count({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        occurredAt: {
          lte: new Date(Date.now() - 15 * 60 * 1000)
        }
      }
    }),
    prisma.organization.count({
      where: {
        onboardingCompletedAt: null,
        createdAt: {
          lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        }
      }
    })
  ]);

  const totalFailures =
    failedBillingEvents +
    failedWebhookDeliveries +
    failedAnalysisJobs +
    failedEmailNotifications +
    failedScheduledJobRuns;

  return {
    status: totalFailures > 0 || staleDomainEvents > 0 ? "degraded" : "healthy",
    failedBillingEvents,
    failedWebhookDeliveries,
    failedAnalysisJobs,
    failedEmailNotifications,
    failedScheduledJobRuns,
    staleDomainEvents,
    staleOnboardingOrganizations,
    checkedAt: new Date().toISOString()
  };
}
