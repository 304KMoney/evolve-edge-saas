import assert from "node:assert/strict";
import {
  CustomerLifecycleStage,
  FindingSeverity,
  MonitoringFindingStatus,
  MonitoringSubscriptionStatus,
  OperationsQueueType,
  ProvisioningStatus,
  ReportPackageDeliveryStatus,
  SubscriptionStatus
} from "@evolve-edge/db";
import {
  buildOperationsQueueDedupeKey,
  evaluateOperationsQueueRules
} from "../lib/operations-queues";

function baseContext() {
  return {
    organizationId: "org_1",
    customerAccountId: "acct_1",
    companyName: "Acme Risk",
    primaryContactEmail: "ops@example.com",
    lifecycleStage: CustomerLifecycleStage.WON,
    wonAt: new Date("2026-03-20T00:00:00.000Z"),
    onboardingCompletedAt: null,
    lastSystemSyncedAt: new Date("2026-04-01T00:00:00.000Z"),
    latestSubscription: {
      id: "sub_1",
      status: SubscriptionStatus.ACTIVE,
      accessState: "ACTIVE",
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-04-20T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
      lastInvoicePaidAt: new Date("2026-03-20T00:00:00.000Z"),
      lastPaymentFailedAt: null,
      lastPaymentFailureMessage: null
    },
    provisioningRequest: {
      id: "prov_1",
      status: ProvisioningStatus.PROVISIONED,
      createdAt: new Date("2026-03-20T00:00:00.000Z"),
      failedAt: null,
      lastError: null
    },
    latestAssessment: null,
    latestReport: null,
    latestReportPackage: null,
    monitoringSubscription: null,
    oldestStalledHighRiskFinding: null,
    actionRequiredRunCount: 0,
    latestActionRequiredRun: null,
    lastActivityAt: new Date("2026-04-01T00:00:00.000Z")
  } as const;
}

function runOperationsQueueTests() {
  {
    const context = baseContext();
    const candidates = evaluateOperationsQueueRules(
      context,
      new Date("2026-04-10T00:00:00.000Z")
    );

    assert.equal(
      candidates.some((candidate) => candidate.ruleCode === "success.paid_intake_stalled"),
      true
    );
  }

  {
    const context = {
      ...baseContext(),
      latestReportPackage: {
        id: "pkg_1",
        deliveryStatus: ReportPackageDeliveryStatus.SENT,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        sentAt: new Date("2026-04-01T00:00:00.000Z"),
        briefingBookedAt: null,
        briefingCompletedAt: null
      },
      monitoringSubscription: {
        id: "mon_1",
        status: MonitoringSubscriptionStatus.ACTIVE,
        activatedAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z")
      },
      latestSubscription: {
        ...baseContext().latestSubscription,
        status: SubscriptionStatus.CANCELED,
        accessState: "GRACE_PERIOD"
      }
    };
    const candidates = evaluateOperationsQueueRules(
      context,
      new Date("2026-04-10T00:00:00.000Z")
    );

    assert.equal(
      candidates.some(
        (candidate) =>
          candidate.queueType === OperationsQueueType.BILLING_ANOMALY &&
          candidate.ruleCode === "billing.monitoring_active_without_live_billing"
      ),
      true
    );
  }

  {
    const context = {
      ...baseContext(),
      oldestStalledHighRiskFinding: {
        id: "finding_1",
        title: "MFA coverage gap",
        severity: FindingSeverity.CRITICAL,
        status: MonitoringFindingStatus.OPEN,
        lastStatusChangedAt: new Date("2026-03-15T00:00:00.000Z")
      }
    };
    const candidates = evaluateOperationsQueueRules(
      context,
      new Date("2026-04-10T00:00:00.000Z")
    );
    const findingCandidate = candidates.find(
      (candidate) => candidate.ruleCode === "success.high_risk_finding_stalled"
    );

    assert.equal(findingCandidate?.severity, "CRITICAL");
  }

  {
    const dedupeKey = buildOperationsQueueDedupeKey({
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.paid_intake_stalled",
      organizationId: "org_1",
      customerAccountId: "acct_1",
      sourceRecordType: "subscription",
      sourceRecordId: "sub_1"
    });

    assert.equal(
      dedupeKey,
      "SUCCESS_RISK:success.paid_intake_stalled:org_1:acct_1:subscription:sub_1"
    );
  }

  console.log("operations-queues tests passed");
}

runOperationsQueueTests();
