# Proactive Operations Queues

## What existed before

Before this phase, Evolve Edge already had:

- customer lifecycle records
- billing sync and billing anomaly visibility in the admin console
- customer workflow runs with recovery hints
- retention and activation snapshots
- account timelines and operator notes

Those pieces made investigation possible, but operators still had to notice problems manually. There was no durable queue model that:

- normalized the highest-value proactive risks
- tracked assignment and workflow state
- avoided duplicate queue spam
- recorded queue-specific history

## What this phase implements

This phase adds two internal-only queue systems:

1. Success-risk queue
2. Billing anomaly queue

The implementation is deterministic and rule-based. It does not use opaque health scoring or vendor-owned analytics as a hidden source of truth.

Core components:

- `OperationsQueueItem`
- `OperationsQueueHistoryEntry`
- centralized rule evaluation in `apps/web/lib/operations-queues.ts`
- internal admin overview at `/admin/queues`
- internal queue detail view at `/admin/queues/[queueItemId]`
- audited assignment, status, note, and refresh actions

## Architecture decisions

### Durable queue model

Queue items are stored durably in the app database instead of being stitched together in UI-only queries.

Why:

- supports assignment and notes
- supports workflow status
- supports aging and SLA-style handling
- allows future analytics and automation

### Deterministic dedupe

Each queue item uses a stable dedupe key composed from:

- queue type
- rule code
- organization
- customer account
- source record type
- source record id

This keeps the queue stable across recomputes and prevents duplicate spam.

### Rules live in the app service layer

All rule logic is centralized in `apps/web/lib/operations-queues.ts`.

Why:

- easier to audit
- easier to test
- avoids scattering risk logic across routes or UI components
- preserves Evolve Edge as the owner of product and ops state

### Automatic resolution, conservative dismissal behavior

When a condition clears, the app auto-resolves active queue items.

When an operator dismisses a queue item, the app preserves that dismissal instead of aggressively reopening it on every recompute. This is a safer v1 for operator trust and queue noise reduction.

## Queue model

### Queue types

- `SUCCESS_RISK`
- `BILLING_ANOMALY`

### Severity levels

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

### Workflow statuses

- `NEW`
- `INVESTIGATING`
- `ACTION_TAKEN`
- `RESOLVED`
- `DISMISSED`

### History entry types

- `SYSTEM_DETECTED`
- `SYSTEM_REOPENED`
- `SYSTEM_RESOLVED`
- `STATUS_CHANGED`
- `ASSIGNED`
- `NOTE_ADDED`

## Current queue rules

### Success-risk rules

#### `success.paid_intake_stalled`

Triggers when:

- the account has live billing
- enough time has passed since payment or win state
- intake still is not complete

Why it matters:

- payment happened
- value delivery has not started cleanly
- churn risk increases quickly at this stage

#### `success.report_delivery_stalled`

Triggers when:

- a report package exists
- it has not progressed to sent
- it has been stuck longer than the allowed window

Why it matters:

- delivery delays erode trust after the customer has already done the work

#### `success.briefing_not_booked`

Triggers when:

- the executive package has been sent
- no briefing has been booked after the follow-up window

Why it matters:

- value may not be landing with leadership

#### `success.monitoring_not_activated`

Triggers when:

- the account reached a delivery milestone
- monitoring is still not active after the expected conversion window

Why it matters:

- this is a likely expansion and retention opportunity

#### `success.high_risk_finding_stalled`

Triggers when:

- a high or critical monitoring finding is still unresolved
- there has been no recent progress

Why it matters:

- elevated risk without motion can become customer dissatisfaction or operational exposure

#### `success.repeated_failed_workflows`

Triggers when:

- the account has multiple recent `ACTION_REQUIRED` customer runs

Why it matters:

- repeated fulfillment failures damage trust and slow delivery

#### `success.renewal_low_engagement`

Triggers when:

- renewal is approaching
- activity has been quiet for a meaningful period

Why it matters:

- this gives operators time to reinforce value before renewal risk hardens

### Billing anomaly rules

#### `billing.failed_charge`

Triggers when:

- subscription state is `PAST_DUE`
- or the latest payment failed

#### `billing.payment_without_provisioning`

Triggers when:

- payment succeeded
- provisioning is still incomplete after a short delay

#### `billing.provisioning_failed_after_payment`

Triggers when:

- payment succeeded
- the provisioning request is explicitly failed

#### `billing.monitoring_active_without_live_billing`

Triggers when:

- monitoring remains active
- billing is no longer in a live state

#### `billing.subscription_state_mismatch`

Triggers when:

- the synced subscription status and app-side access state appear inconsistent

## Operator workflow

### Overview page

Route:

- `/admin/queues`

Operators can:

- see queue counts
- filter by queue type, status, severity, assignment, and search
- open item detail pages
- manually recompute all queue rules

### Detail page

Route:

- `/admin/queues/[queueItemId]`

Operators can:

- review the summary and source record references
- change queue status
- assign ownership
- add queue notes
- drill into linked customer account and organization records

### Auditability

The app writes audit logs for:

- queue page views
- manual queue recompute
- status changes
- assignment changes
- note creation

Queue history is also stored in queue-specific history tables.

## Permissions

Read access:

- `platform.accounts.view`

Mutation access:

- `platform.accounts.manage`

The queues are internal-only. They are not exposed to customer-facing views.

## Migrations required

- `packages/db/prisma/migrations/20260411040000_proactive_operations_queues/migration.sql`

## Environment variables required

No new environment variables are required for this phase.

## Manual setup

1. Apply the Prisma migration.
2. Regenerate the Prisma client.
3. Ensure internal operators have platform roles that include `platform.accounts.view` or `platform.accounts.manage`.
4. Open `/admin/queues`.
5. Trigger a recompute and confirm queue items appear for known test scenarios.

## Test checklist

1. Create or seed an org with active billing but no completed intake and confirm a success-risk item appears.
2. Seed a report package stuck in generated state and confirm a delivery-stalled item appears.
3. Seed an active monitoring subscription on a canceled subscription and confirm a billing anomaly appears.
4. Change a queue item to `INVESTIGATING`, `ACTION_TAKEN`, `RESOLVED`, and `DISMISSED` and confirm history entries are recorded.
5. Assign a queue item to an internal user and confirm the assignment appears in the overview and detail page.
6. Add a note and confirm it appears in queue history.
7. Resolve the underlying issue and recompute queues to confirm the item auto-resolves.

## Manual setup steps for operators

1. Go to `Internal Admin -> View proactive queues`.
2. Filter for `Critical` first.
3. Open the item.
4. Assign an owner immediately if it is unassigned.
5. Move it to `Investigating` once active work starts.
6. Use `Action taken` when outreach, billing follow-up, or workflow recovery has occurred but the issue is not yet fully clear.
7. Use `Resolved` only when the condition is actually cleared.
8. Use `Dismissed` only with an explicit note.

## Future expansion notes

Good next steps:

- support-ticket ingestion as another queue signal source
- org-specific queue drilldowns from the main admin page
- queue analytics and SLA reporting
- background scheduled recompute jobs instead of page-triggered recompute
- configurable thresholds per rule
- bulk actions for queue triage

Intentionally deferred in this phase:

- ML-based prioritization
- customer-visible queue surfaces
- billing-event duplicate pattern detection without stronger org-linked billing event ownership
