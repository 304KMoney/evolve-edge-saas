import assert from "node:assert/strict";
import {
  BillingInterval,
  CustomerLifecycleStage,
  EngagementProgramType
} from "@evolve-edge/db";
import {
  averageDurationHours,
  calculatePercent,
  createTimeBuckets,
  formatCurrencyDollarsFromCents,
  getDateRangeForPreset,
  intersectStringValues,
  normalizeMonthlyRecurringRevenueCents,
  parseKpiDashboardFilters,
  serializeKpiSnapshotToCsv,
  type KpiDashboardSnapshot
} from "../lib/kpi-dashboard";

function runKpiDashboardTests() {
  {
    assert.equal(calculatePercent(6, 8), 75);
    assert.equal(calculatePercent(4, 0), 0);
  }

  {
    assert.equal(averageDurationHours([3_600_000, 7_200_000]), 1.5);
    assert.equal(averageDurationHours([]), null);
  }

  {
    assert.equal(
      normalizeMonthlyRecurringRevenueCents({
        priceCents: 24_000,
        billingInterval: BillingInterval.ANNUAL
      }),
      2_000
    );
  }

  {
    assert.deepEqual(intersectStringValues(["a", "b"], ["b", "c"]), ["b"]);
    assert.deepEqual(intersectStringValues(null, ["x", "y"]), ["x", "y"]);
  }

  {
    const range = getDateRangeForPreset("30d", new Date("2026-04-10T15:00:00.000Z"));
    assert.equal(range.from.toISOString().slice(0, 10), "2026-03-12");
    assert.equal(range.to.toISOString().slice(0, 10), "2026-04-10");
  }

  {
    const buckets = createTimeBuckets({
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2026-04-20T23:59:59.999Z"),
      grain: "week"
    });

    assert.equal(buckets.length >= 3, true);
    assert.equal(buckets[0]?.start.toISOString().slice(0, 10), "2026-03-30");
  }

  {
    const filters = parseKpiDashboardFilters(
      {
        preset: "180d",
        from: "2026-01-01",
        to: "2026-03-31",
        stage: CustomerLifecycleStage.WON,
        engagementType: EngagementProgramType.ONE_TIME_AUDIT,
        trendGrain: "month",
        organizationId: "org_123"
      },
      new Date("2026-04-10T15:00:00.000Z")
    );

    assert.equal(filters.preset, "180d");
    assert.equal(filters.trendGrain, "month");
    assert.equal(filters.stage, CustomerLifecycleStage.WON);
    assert.equal(filters.engagementType, EngagementProgramType.ONE_TIME_AUDIT);
    assert.equal(filters.organizationId, "org_123");
    assert.equal(filters.from?.toISOString().slice(0, 10), "2026-01-01");
  }

  {
    const snapshot: KpiDashboardSnapshot = {
      filters: {
        preset: "90d",
        trendGrain: "week",
        from: "2026-01-01",
        to: "2026-03-31",
        organizationId: null,
        stage: null,
        engagementType: null
      },
      summary: {
        totalLeads: { label: "Total leads", value: 12, helperText: "Leads in range." },
        qualifiedLeads: { label: "Qualified leads", value: 7, helperText: "Qualified in range." },
        paidCustomers: { label: "Paid customers", value: 4, helperText: "Won in range." },
        activeEngagements: { label: "Active engagements", value: 3, helperText: "Active." },
        paidAudits: { label: "Paid audits", value: 2, helperText: "Audits." },
        activeMonitoringSubscriptions: { label: "Monitoring subscriptions", value: 1, helperText: "Monitoring." },
        failedRuns: { label: "Failed runs", value: 2, helperText: "Failed." },
        recoveredRuns: { label: "Recovered runs", value: 1, helperText: "Recovered." },
        estimatedNormalizedMrrCents: { label: "Estimated normalized MRR", value: 25000, helperText: "MRR." },
        reportPackagesSent: { label: "Report packages sent", value: 3, helperText: "Sent." },
        briefingsCompleted: { label: "Briefings completed", value: 1, helperText: "Completed." }
      },
      rates: {
        intakeCompletion: { label: "Intake", numerator: 3, denominator: 4, percent: 75, helperText: "Intake." },
        reportCompletion: { label: "Report", numerator: 2, denominator: 3, percent: 67, helperText: "Reports." },
        briefingBooking: { label: "Briefing", numerator: 2, denominator: 2, percent: 100, helperText: "Briefings." },
        monitoringConversion: { label: "Monitoring", numerator: 1, denominator: 1, percent: 100, helperText: "Monitoring." },
        runRecovery: { label: "Run recovery", numerator: 1, denominator: 2, percent: 50, helperText: "Recovery." }
      },
      durations: {
        paymentToDelivery: { label: "Payment to delivery", averageHours: 48, helperText: "Cycle." },
        processing: { label: "Processing", averageHours: 12, helperText: "Processing." },
        review: { label: "Review", averageHours: 4, helperText: "Review." },
        delivery: { label: "Delivery", averageHours: 6, helperText: "Delivery." }
      },
      trends: {
        funnel: [
          {
            key: "2026-W01",
            label: "Jan 1",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-01-07T23:59:59.999Z",
            leads: 4,
            paidCustomers: 2,
            intakeCompleted: 2,
            reportsGenerated: 1,
            briefingsBooked: 1,
            monitoringConversions: 0
          }
        ],
        reportsGenerated: [
          {
            key: "2026-W01",
            label: "Jan 1",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-01-07T23:59:59.999Z",
            value: 1
          }
        ],
        activeVsClosedEngagements: [
          {
            key: "2026-W01",
            label: "Jan 1",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-01-07T23:59:59.999Z",
            value: 2,
            closedValue: 1
          }
        ],
        customerStageMovement: [
          {
            key: "2026-W01",
            label: "Jan 1",
            periodStart: "2026-01-01T00:00:00.000Z",
            periodEnd: "2026-01-07T23:59:59.999Z",
            transitions: {
              LEAD: 1,
              QUALIFIED: 1,
              PROPOSAL_SENT: 0,
              WON: 1,
              ONBOARDING: 0,
              INTAKE_PENDING: 0,
              INTAKE_COMPLETE: 0,
              AUDIT_PROCESSING: 0,
              REPORT_READY: 0,
              BRIEFING_SCHEDULED: 0,
              MONITORING_ACTIVE: 0
            }
          }
        ]
      },
      snapshots: {
        customerStages: [{ stage: CustomerLifecycleStage.WON, count: 4 }],
        workflowFailures: [{ step: "DELIVERY", totalRuns: 2, failedRuns: 1, failureRatePercent: 50 }],
        dropOff: [{ label: "Reports without booked briefing", count: 1 }],
        expansionOpportunities: [
          { organizationId: "org_123", organizationName: "Northwind", openOpportunities: 2 }
        ]
      }
    };

    const csv = serializeKpiSnapshotToCsv(snapshot);
    assert.match(csv, /Total leads/);
    assert.match(csv, /Northwind/);
  }

  {
    assert.equal(formatCurrencyDollarsFromCents(25000), "$250");
  }

  console.log("kpi-dashboard tests passed");
}

runKpiDashboardTests();
