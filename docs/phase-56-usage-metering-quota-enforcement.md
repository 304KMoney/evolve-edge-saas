# Phase 56 — Usage Metering and Quota Enforcement

## What existed before

Before this phase, Evolve Edge had:

- entitlement limits resolved from the canonical plan model
- usage visibility snapshots for dashboards and warning banners
- no durable monthly usage event ledger
- no idempotent meter records for backend quota enforcement
- no authoritative quota checks at the write boundary for assessments or evidence workflows

That meant the product could describe plan limits, but it could not safely enforce monthly usage quotas from authoritative records.

## What was implemented

This phase adds a durable monthly usage model and a centralized quota service.

### New models

- `UsageEvent`
  - append-only, idempotent usage ledger row
  - stores org, optional subscription, meter key, quantity, source, source record reference, period window, and metadata
- `UsageMeter`
  - monthly aggregate for one org + one meter key
  - stores used quantity, resolved limit snapshot, and the current period window

### Meter keys

Current v1 meters:

- `audits`
- `evidence_uploads`
- `documents_processed`

### New service

`apps/web/lib/usage-quotas.ts`

Exports:

- `recordUsageEvent()`
- `getUsageRemaining()`
- `requireQuota()`
- `QuotaExceededError`

### Enforcement points

Backend enforcement is now active in:

- assessment creation
- evidence upload
- evidence version replacement
- evidence processing transition to `PARSED`

## Why it matters

This creates the first safe quota foundation for pricing control:

- monthly limits are enforced from the backend
- usage writes are idempotent
- duplicate side effects are avoided with stable idempotency keys
- customer-facing flows fail safely with upgrade-oriented messaging
- future usage reporting, alerts, and overage billing can build on a durable ledger instead of UI-only counts

## Architecture decisions

### Limit authority

Limits come from the entitlement system, not from scattered Stripe IDs or UI checks.

Current mapping:

- `audits` -> `entitlements.limits.audits`
- `evidence_uploads` -> `entitlements.limits.uploads`
- `documents_processed` -> `entitlements.limits.ai_processing_runs`

`documents_processed` uses the existing AI/document processing capacity limit as the closest current authoritative limit. This keeps the model stable without inventing a second pricing axis before billing phases are ready.

### Reset model

Monthly reset logic uses UTC calendar-month windows:

- `periodStart` = first day of current month at `00:00:00.000Z`
- `periodEnd` = first day of next month at `00:00:00.000Z`

This is deterministic, easy to recompute, and does not depend on fragile cron resets.

### Idempotency

Every recorded usage event requires a stable `idempotencyKey`.

Examples:

- `usage:audits:{assessmentId}`
- `usage:evidence_uploads:{evidenceId}:v1`
- `usage:evidence_uploads:{evidenceId}:v{versionNumber}`
- `usage:documents_processed:{evidenceId}:{parsedAtIso}`

### Service boundary

Quota decisions live in one service layer and are enforced at the same write boundaries where product state changes happen. UI should read backend outcomes instead of making its own quota decisions.

## Environment variables required

No new environment variables were added in this phase.

## Migrations required

Apply:

- `packages/db/prisma/migrations/20260411053000_usage_metering_quota_enforcement/migration.sql`

## Test checklist

- assessment creation records one `UsageEvent` for `audits`
- repeated assessment recording with the same idempotency key does not duplicate usage
- evidence upload records one `UsageEvent` for `evidence_uploads`
- replacing an evidence version records another upload event with a different idempotency key
- marking evidence as `PARSED` records one `documents_processed` event
- quota failures return safe upgrade-oriented error messages
- usage periods roll up into the correct UTC calendar month window

## Manual setup steps

1. Run `pnpm db:migrate`
2. Run `pnpm db:generate`
3. Start the app
4. Create assessments until the current plan reaches its audit quota
5. Verify the next attempt returns a safe quota error
6. Upload evidence until the current plan reaches its upload quota
7. Verify the next attempt returns a safe quota error
8. Mark evidence processing to `PARSED` and confirm document processing usage is recorded

## Future expansion notes

- add operator/admin visibility for `UsageMeter` and `UsageEvent`
- add scheduled usage summaries and threshold alerting from durable meters
- backfill existing org activity into usage events if historical quota analysis becomes necessary
- add per-feature override UI on top of the existing entitlement override scaffolding
- add finance-aware overage billing only after billing lifecycle and invoice behavior are explicitly designed
