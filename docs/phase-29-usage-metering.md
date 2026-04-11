# Phase 29: Usage Metering, Limits, and Upgrade Prompts

## Recommended Metering Strategy

The metering model in this phase is source-record-first.

Instead of inventing fragile counters for everything, the app derives usage from the product records that already represent real customer activity:

- `Assessment` for active assessments
- `Report` for reports generated
- `OrganizationMember` for seats
- `Vendor` and `AIModel` for monitored assets
- `AnalysisJob` for AI processing runs
- `EvidenceFile.sizeBytes` for storage

This keeps business truth inside the Evolve Edge app and avoids frontend-owned or webhook-owned usage state.

The plan policy stays in code through the revenue catalog, which keeps the system simple today while preserving room for:

- enterprise custom plan variants
- org-level limit overrides later
- additional metered resources without redesigning the UI

## What Is Metered

The usage layer now tracks these metrics:

- `activeAssessments`
- `reportsGenerated`
- `monitoredAssets`
- `seats`
- `aiProcessingRuns`
- `storageBytes`
- `apiCalls`

Current source mapping:

- `activeAssessments`: non-archived assessments
- `reportsGenerated`: reports created for the org
- `monitoredAssets`: vendors plus AI models
- `seats`: active org memberships
- `aiProcessingRuns`: analysis jobs created for the org
- `storageBytes`: summed `EvidenceFile.sizeBytes`
- `apiCalls`: reserved metric, currently tracked as `0` until a product API surface is introduced

## How Metering Works

Main service:

- `apps/web/lib/usage-metering.ts`

The service:

1. Resolves the current plan code.
2. Loads usage limits from the revenue catalog.
3. Derives current usage from authoritative database records.
4. Produces per-metric snapshots with:
   - used
   - limit
   - remaining
   - percent used
   - enforcement type
   - warning state
   - upgrade copy
   - CTA destination

This snapshot is then reused across:

- dashboard overview
- billing/settings page
- assessments page
- reports page
- threshold event emission in write flows

## Enforcement Model

### Hard limits

These are enforced at write time:

- `activeAssessments`
- `seats`

Behavior:

- assessment creation stops once the plan limit is reached
- member addition stops once seat capacity is exhausted

### Soft warning / upgrade pressure

These show warnings and upgrade prompts without blocking the workflow:

- `reportsGenerated`
- `monitoredAssets`
- `aiProcessingRuns`

Behavior:

- users see warning banners and plan-aware usage messages
- contextual CTAs route to pricing or billing settings
- write flows continue

### Visibility only

These are tracked now but not enforced:

- `storageBytes`
- `apiCalls`

This preserves room for future enterprise packaging without introducing unnecessary friction in the current product.

## Where Thresholds Are Configured

Thresholds are defined in:

- `apps/web/lib/usage-metering.ts`

Current warning thresholds:

- `seats`: 75%
- `activeAssessments`: 80%
- `reportsGenerated`: 80%
- `monitoredAssets`: 80%
- `aiProcessingRuns`: 80%
- `storageBytes`: 80%
- `apiCalls`: 80%

Threshold domain events are emitted through:

- `apps/web/lib/usage.ts`

Relevant event payloads are published from:

- assessment creation
- report generation
- member addition
- vendor creation
- AI model creation
- AI analysis job queueing

## How Limits Map To Plans

Plan limits are defined in:

- `apps/web/lib/revenue-catalog.ts`

Current defaults:

### Growth Monthly

- active assessments: 5
- seats: 8
- frameworks: 6
- reports generated: 24
- monitored assets: 20
- API calls: 1,000
- storage: 1 GB
- AI processing runs: 30

### Growth Annual

- active assessments: 5
- seats: 8
- frameworks: 6
- reports generated: 36
- monitored assets: 25
- API calls: 2,500
- storage: 2.5 GB
- AI processing runs: 60

### Enterprise Monthly

- active assessments: 20
- seats: 25
- frameworks: 20
- reports generated: 120
- monitored assets: 100
- API calls: 25,000
- storage: 10 GB
- AI processing runs: 240

### Enterprise Annual

- active assessments: 20
- seats: 25
- frameworks: 20
- reports generated: 180
- monitored assets: 150
- API calls: 50,000
- storage: 25 GB
- AI processing runs: 480

## Plan-Aware UX Added

### Dashboard

- surfaces a plan utilization section for core recurring metrics
- shifts recommended focus toward upgrade/capacity pressure when a meaningful warning exists

### Billing & Settings

- shows a full usage and limits grid
- includes contextual upgrade CTAs only when helpful

### Assessments

- shows a contextual upgrade banner for assessment capacity
- keeps the existing hard stop on creation

### Reports

- shows contextual report usage messaging and soft-pressure upgrade prompts
- does not hard block report generation based on report-count packaging

## Upgrade Prompt Components

Reusable UI components:

- `apps/web/components/usage-meter-grid.tsx`
- `apps/web/components/usage-upgrade-banner.tsx`

These components are designed to stay contextual:

- warning only when needed
- no modal spam
- no global banner across every page
- CTA copy tied to the actual pressured metric

## Schema Changes

Added:

- `EvidenceFile.sizeBytes Int?`

Reason:

- storage metering needs a real field owned by the application database
- this preserves room for future upload limits and enterprise storage policies

Migration:

- `packages/db/prisma/migrations/20260410233000_usage_metering/migration.sql`

## How To Change Limits Later

### Change plan packaging

Edit:

- `apps/web/lib/revenue-catalog.ts`

Update the relevant `usageLimits` block for the plan.

### Change warning behavior

Edit:

- `apps/web/lib/usage-metering.ts`

Update:

- `warningThresholdPercent`
- `enforcement`
- CTA copy
- helper text behavior

### Add a new metered metric

1. Add the metric key to `USAGE_METRIC_KEYS`
2. Add config to `METRIC_CONFIG`
3. Add the plan limit to `RevenuePlanDefinition.usageLimits`
4. Add source-of-truth query logic in `getOrganizationUsageMeteringSnapshot`
5. Decide whether enforcement is `hard`, `soft`, or `visibility`
6. Surface it in the relevant UI

## Test Cases

### Hard limit tests

- create assessments until the active assessment limit is reached
- confirm the next create attempt redirects with `error=limit`
- add members until the seat limit is reached
- confirm the next member addition redirects with `error=seat-limit`

### Soft warning tests

- generate reports until usage crosses 80%
- confirm warning banner appears on reports page
- add vendors/models until monitored assets cross 80%
- confirm settings page shows warning state
- queue enough analysis jobs to cross the AI processing threshold
- confirm settings page reflects the warning state

### Dashboard tests

- confirm usage cards render with correct used and remaining values
- confirm recommended focus switches to upgrade pressure when a metric is near or above limit

### Storage tests

- create evidence files with `sizeBytes` populated
- confirm storage total is summed correctly
- confirm thresholds update from those values

### Threshold event tests

- confirm `usage.threshold.crossed` events are emitted for:
  - seats
  - active assessments
  - reports generated
  - monitored assets
  - AI processing runs

## Future Expansion Notes

Recommended next evolutions when enterprise sales motion deepens:

- add org-level custom usage overrides for contracted enterprise plans
- add time-windowed metering for monthly API and AI usage
- add true token or provider-cost metering for AI workload
- add storage enforcement once upload infrastructure is fully live
- add admin visibility for overage risk across all tenants
- add billing-linked expansion signals into CRM and customer success workflows

## Files Changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260410233000_usage_metering/migration.sql`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/usage.ts`
- `apps/web/lib/usage-metering.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/components/usage-meter-grid.tsx`
- `apps/web/components/usage-upgrade-banner.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/reports/actions.ts`

## Commands

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```
