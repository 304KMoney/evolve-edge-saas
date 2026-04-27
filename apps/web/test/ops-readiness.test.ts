import assert from "node:assert/strict";
import {
  BillingEventStatus,
  DeliveryStateStatus,
  JobStatus,
  WebhookDeliveryStatus,
  WorkflowDispatchStatus
} from "@evolve-edge/db";
import { getOpsReadinessSnapshot } from "../lib/ops-readiness";

async function runOpsReadinessTests() {
  const db = {
    billingEvent: {
      count: async ({ where }: { where: { status: BillingEventStatus } }) =>
        where.status === BillingEventStatus.FAILED ? 1 : 0
    },
    webhookDelivery: {
      count: async ({ where }: { where: { status: WebhookDeliveryStatus } }) => {
        if (where.status === WebhookDeliveryStatus.FAILED) {
          return 2;
        }

        if (where.status === WebhookDeliveryStatus.RETRYING) {
          return 3;
        }

        return 0;
      }
    },
    analysisJob: {
      count: async ({ where }: { where: { status: JobStatus } }) =>
        where.status === JobStatus.FAILED ? 4 : 0
    },
    emailNotification: {
      count: async () => 5
    },
    scheduledJobRun: {
      count: async () => 6
    },
    workflowDispatch: {
      count: async ({
        where
      }: {
        where: { status: WorkflowDispatchStatus | { in: WorkflowDispatchStatus[] } };
      }) => {
        if (where.status === WorkflowDispatchStatus.FAILED) {
          return 7;
        }

        return 8;
      }
    },
    deliveryStateRecord: {
      count: async ({
        where
      }: {
        where: {
          OR: Array<{
            status:
              | DeliveryStateStatus
              | {
                  in: DeliveryStateStatus[];
                };
          }>;
        };
      }) => {
        assert.equal(where.OR.length, 2);
        return 9;
      }
    },
    domainEvent: {
      count: async () => 10
    },
    organization: {
      count: async () => 11
    }
  } as any;

  const snapshot = await getOpsReadinessSnapshot(db);

  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.failedBillingEvents, 1);
  assert.equal(snapshot.failedWebhookDeliveries, 2);
  assert.equal(snapshot.retryingWebhookDeliveries, 3);
  assert.equal(snapshot.failedAnalysisJobs, 4);
  assert.equal(snapshot.failedEmailNotifications, 5);
  assert.equal(snapshot.failedScheduledJobRuns, 6);
  assert.equal(snapshot.failedWorkflowDispatches, 7);
  assert.equal(snapshot.staleWorkflowDispatches, 8);
  assert.equal(snapshot.attentionRequiredDeliveryStates, 9);
  assert.equal(snapshot.staleDomainEvents, 10);
  assert.equal(snapshot.staleOnboardingOrganizations, 11);

  console.log("ops-readiness tests passed");
}

void runOpsReadinessTests();
