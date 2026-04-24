import {
  BillingEventStatus,
  JobStatus,
  Prisma,
  DeliveryStateStatus,
  WebhookDeliveryStatus,
  WorkflowDispatchStatus,
  prisma
} from "@evolve-edge/db";

type OpsReadinessDbClient = Prisma.TransactionClient | typeof prisma;

const STALE_DOMAIN_EVENT_MINUTES = 15;
const STALE_WORKFLOW_DISPATCH_MINUTES = 30;
const STALE_DELIVERY_STATE_MINUTES = 120;
const STALE_ONBOARDING_DAYS = 3;

export async function getOpsReadinessSnapshot(
  db: OpsReadinessDbClient = prisma
) {
  const staleDomainEventBefore = new Date(
    Date.now() - STALE_DOMAIN_EVENT_MINUTES * 60 * 1000
  );
  const staleWorkflowDispatchBefore = new Date(
    Date.now() - STALE_WORKFLOW_DISPATCH_MINUTES * 60 * 1000
  );
  const staleDeliveryStateBefore = new Date(
    Date.now() - STALE_DELIVERY_STATE_MINUTES * 60 * 1000
  );
  const staleOnboardingBefore = new Date(
    Date.now() - STALE_ONBOARDING_DAYS * 24 * 60 * 60 * 1000
  );

  const [
    failedBillingEvents,
    failedWebhookDeliveries,
    retryingWebhookDeliveries,
    failedAnalysisJobs,
    failedEmailNotifications,
    failedScheduledJobRuns,
    failedWorkflowDispatches,
    staleWorkflowDispatches,
    attentionRequiredDeliveryStates,
    staleDomainEvents,
    staleOnboardingOrganizations
  ] = await Promise.all([
    db.billingEvent.count({
      where: { status: BillingEventStatus.FAILED }
    }),
    db.webhookDelivery.count({
      where: { status: WebhookDeliveryStatus.FAILED }
    }),
    db.webhookDelivery.count({
      where: { status: WebhookDeliveryStatus.RETRYING }
    }),
    db.analysisJob.count({
      where: { status: JobStatus.FAILED }
    }),
    db.emailNotification.count({
      where: { status: "FAILED" }
    }),
    db.scheduledJobRun.count({
      where: { status: "FAILED" }
    }),
    db.workflowDispatch.count({
      where: { status: WorkflowDispatchStatus.FAILED }
    }),
    db.workflowDispatch.count({
      where: {
        status: {
          in: [
            WorkflowDispatchStatus.PENDING,
            WorkflowDispatchStatus.DISPATCHING,
            WorkflowDispatchStatus.DISPATCHED,
            WorkflowDispatchStatus.ACKNOWLEDGED
          ]
        },
        updatedAt: {
          lte: staleWorkflowDispatchBefore
        }
      }
    }),
    db.deliveryStateRecord.count({
      where: {
        OR: [
          {
            status: DeliveryStateStatus.FAILED
          },
          {
            status: {
              in: [
                DeliveryStateStatus.PROCESSING,
                DeliveryStateStatus.AWAITING_REVIEW
              ]
            },
            updatedAt: {
              lte: staleDeliveryStateBefore
            }
          }
        ]
      }
    }),
    db.domainEvent.count({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        occurredAt: {
          lte: staleDomainEventBefore
        }
      }
    }),
    db.organization.count({
      where: {
        onboardingCompletedAt: null,
        createdAt: {
          lte: staleOnboardingBefore
        }
      }
    })
  ]);

  const totalFailures =
    failedBillingEvents +
    failedWebhookDeliveries +
    retryingWebhookDeliveries +
    failedAnalysisJobs +
    failedEmailNotifications +
    failedScheduledJobRuns +
    failedWorkflowDispatches +
    staleWorkflowDispatches +
    attentionRequiredDeliveryStates;

  return {
    status: totalFailures > 0 || staleDomainEvents > 0 ? "degraded" : "healthy",
    failedBillingEvents,
    failedWebhookDeliveries,
    retryingWebhookDeliveries,
    failedAnalysisJobs,
    failedEmailNotifications,
    failedScheduledJobRuns,
    failedWorkflowDispatches,
    staleWorkflowDispatches,
    attentionRequiredDeliveryStates,
    staleDomainEvents,
    staleOnboardingOrganizations,
    checkedAt: new Date().toISOString()
  };
}
