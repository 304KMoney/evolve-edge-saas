# Customer KPI Dashboard

## What existed before

Before this phase, Evolve Edge had:

- app-owned lifecycle records through `LeadSubmission`, `CustomerAccount`, `Subscription`, `Assessment`, `Report`, `ReportPackage`, `MonitoringSubscription`, `EngagementProgram`, and `CustomerRun`
- product analytics events for funnel instrumentation
- an internal operations console at `/admin`

What was missing was a leadership-facing KPI view that normalized those records into trusted funnel, delivery, and recurring-revenue metrics.

## What was implemented

This phase adds:

- a shared KPI analytics service in `apps/web/lib/kpi-dashboard.ts`
- a protected internal dashboard at `/admin/kpis`
- CSV export at `/admin/kpis/export`
- a link from `/admin` to the KPI dashboard
- pure tests for KPI filter parsing, bucketing, rate calculations, and CSV export

## Why it matters

The dashboard gives founders, operators, and future leadership a truthful view of:

- lead volume
- qualified pipeline
- won customers
- intake completion
- report throughput
- briefing conversion
- monitoring conversion
- active engagements
- workflow failure and recovery
- estimated recurring revenue support

The implementation is built from app-owned records, not vendor dashboards or placeholder analytics.

## Architecture decisions

### Source of truth

Metrics are built from authoritative application records first:

- leads: `LeadSubmission`
- paid customers: `CustomerAccount.wonAt`
- intake completion: `Assessment.submittedAt`
- reports generated: `Report.publishedAt` with `createdAt` fallback
- briefings booked and completed: `ReportPackage.briefingBookedAt` and `ReportPackage.briefingCompletedAt`
- monitoring conversion: `MonitoringSubscription.activatedAt`
- active engagements: `EngagementProgram.status`
- failed and recovered runs: `CustomerRun`
- estimated recurring revenue: active/trialing/past-due `Subscription` rows plus linked `Plan`

### Why not use only `ProductAnalyticsEvent`

`ProductAnalyticsEvent` remains valuable for product instrumentation and future BI, but this dashboard prefers durable domain records wherever possible so metrics can be regenerated consistently even if a client-side event is blocked or a vendor is swapped later.

### Time windows

The dashboard supports:

- presets: `30d`, `90d`, `180d`, `365d`
- explicit `from` and `to` dates
- trend grain: `week` or `month`

Date parsing is normalized in the KPI service so the page and CSV export stay aligned.

### Filters

Supported filters:

- organization
- customer lifecycle stage
- engagement program type
- time window
- trend grain

When stage or engagement filters are applied, the KPI service narrows organization scope before calculating downstream metrics.

## KPI definitions

### Summary metrics

- `Total leads`: `LeadSubmission.submittedAt` within range
- `Qualified leads`: leads within range whose current stage is `QUALIFIED` or `CONVERTED`
- `Paid customers`: `CustomerAccount.wonAt` within range
- `Active engagements`: current `EngagementProgram` rows in `ACTIVE` or `PAUSED`
- `Paid audits`: `EngagementProgram` rows of type `ONE_TIME_AUDIT` that are not `DRAFT`
- `Monitoring subscriptions`: current `MonitoringSubscription` rows with status `ACTIVE`
- `Failed runs`: `CustomerRun` rows in `FAILED` or `ACTION_REQUIRED`
- `Recovered runs`: failed or action-required runs with `lastRecoveredAt`
- `Estimated normalized MRR`: monthly equivalent of active, trialing, and past-due subscriptions
- `Report packages sent`: `ReportPackage.sentAt` within range
- `Briefings completed`: `ReportPackage.briefingCompletedAt` within range

### Rates

- `Intake completion rate`: completed intake submissions / won customers
- `Report completion rate`: generated reports / completed intake submissions
- `Briefing booking rate`: booked briefings / generated reports
- `Monitoring conversion rate`: active monitoring subscriptions / completed briefings
- `Run recovery rate`: recovered runs / failed or action-required runs

### Operational duration metrics

- `Payment to delivery`: earliest paid marker on the organization to first executive package sent
- `Processing time`: `CustomerRun.startedAt` to `completedAt`
- `QA review time`: `ReportPackage.createdAt` to `reviewedAt`
- `Delivery time`: `ReportPackage.reviewedAt` or `createdAt` to `sentAt`

## Important assumptions

- `Paid customer` is modeled as a customer account reaching `WON`, not only a Stripe subscription event.
- `Estimated normalized MRR` is a monthly-equivalent support metric, not a finance-grade revenue recognition model.
- `Payment to delivery` falls back to `CustomerAccount.wonAt` when a subscription payment timestamp is unavailable.
- `Qualified leads` uses the current lead stage because there is not yet a dedicated `qualifiedAt` timestamp on `LeadSubmission`.

## Environment variables required

No new environment variables were added for this phase.

The route remains protected by the existing internal admin allowlist:

- `INTERNAL_ADMIN_EMAILS`

## Migrations required

None.

## Test checklist

Run:

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

Manual checks:

1. Open `/admin` as an internal admin and confirm the KPI dashboard link appears.
2. Open `/admin/kpis` and confirm summary cards render.
3. Change date filters and confirm the cards and trend sections update.
4. Filter by organization and confirm the snapshot scopes down.
5. Filter by lifecycle stage and confirm stage-specific data narrows.
6. Export CSV and confirm the file downloads with the same filter window.

## Manual setup steps

1. Ensure the viewing account email is present in `INTERNAL_ADMIN_EMAILS`.
2. No external dashboard setup is required.
3. If production has sparse historical `wonAt`, `briefingCompletedAt`, or `activatedAt` data, backfill those timestamps before using the dashboard for board-level reporting.

## Future expansion notes

- Add a persisted analytics snapshot table if dashboard query cost grows materially.
- Add `qualifiedAt` on leads for stage-accurate lead qualification trends.
- Add BI warehouse forwarding once the internal KPI model stabilizes.
- Add cohort views for activation and retention once leadership reporting needs go deeper.
- Add MRR bridge and churn reporting if finance operations move beyond support modeling.
