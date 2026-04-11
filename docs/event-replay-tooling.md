# Event Replay Tooling

## What Existed Before

Evolve Edge already had durable processing records for the most important event classes:

- `BillingEvent` for inbound Stripe webhook processing
- `DomainEvent` for app-owned domain transitions
- `WebhookDelivery` for outbound delivery attempts to n8n, HubSpot, and generic webhook destinations

The platform also already had:

- Stripe webhook claim logic with stale-processing recovery
- domain-event seeded outbound deliveries
- retry handling for outbound webhook deliveries
- internal admin access controls
- audit logging for sensitive admin actions

The gap was operator-safe replay. Internal users could see some failed events, but they did not have:

- one replay policy model
- one review surface for failed events
- durable replay attempt records
- explicit guardrails around replay eligibility
- a consistent audit trail for manual replay actions

## What Was Implemented

This phase adds a safe replay layer for idempotent event classes:

- failed Stripe billing events
- failed or review-required domain events
- failed outbound webhook deliveries

The implementation includes:

- a durable `EventReplayAttempt` model
- explicit replay target typing
- replay-attempt outcomes and failure reasons
- replay rate limiting per target
- centralized replay eligibility logic
- replay actions protected by `platform.jobs.manage`
- internal replay review UI at `/admin/replays`
- audit logging for replay success and failure
- account timeline entries for replayed domain events and deliveries
- outbound payload propagation of `idempotencyKey` for safer downstream dedupe

## Why It Matters

This lets operators recover from transient failures or fixed downstream configuration problems without:

- manually touching the database
- guessing whether replay is safe
- blindly retrying every event class
- losing a durable record of what was replayed and why

It also reduces founder memory risk by making replay review and replay history visible in-product.

## Architecture Decisions

### 1. Reuse Existing Event Records

This phase does **not** introduce a second event store.

Source records remain:

- `BillingEvent`
- `DomainEvent`
- `WebhookDelivery`

Replay attempts are stored separately in `EventReplayAttempt`.

### 2. Keep Replay Policies Explicit

Replay is allowed only when a target passes a centralized eligibility check.

Examples:

- processed billing events are blocked
- in-flight deliveries are blocked
- events with no currently applicable destinations are blocked
- repeated replay attempts are blocked after the rate limit window

### 3. Replay the Same Business Paths

Replay uses the same underlying processing logic where practical:

- Stripe billing replay uses the app’s Stripe synchronization services
- domain-event replay reuses managed outbound delivery logic
- delivery replay reuses the existing outbound delivery dispatcher path

### 4. Preserve App-Owned Truth

Replay does not let HubSpot, n8n, or Stripe mutate product truth directly.

The Evolve Edge app remains the owner of:

- replay policy
- replay authorization
- replay audit trails
- event processing state transitions

## Event Classes Covered

### Stripe Billing Events

Safe replay coverage:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `customer.subscription.trial_will_end`

These are replayed only through app-owned synchronization logic and event publication with stable idempotency keys.

### Domain Events

Replayable when:

- the event is not already fully processed
- it is not actively processing
- at least one outbound destination currently applies
- replay is still within guardrail limits

Replay here means re-seeding or re-running outbound deliveries, not re-running arbitrary app mutations.

### Webhook Deliveries

Replayable when:

- the delivery is not already delivered
- it is not actively processing
- its destination is currently configured
- replay is still within guardrail limits

## Replay Guardrails

### Eligibility Rules

Every target is evaluated for:

- current processing status
- configured downstream destination state
- known failure classification
- replay frequency in the last 24 hours

### Rate Limit

Manual replay is blocked after:

- `3` attempts
- on the same target
- within `24` hours

This is intentionally conservative for a regulated, high-trust product.

### Confirmation Requirements

Operators must provide:

- a short reason
- explicit `REPLAY` confirmation text

### Permissions

Viewing the replay console requires:

- `platform.jobs.view`

Replaying events requires:

- `platform.jobs.manage`

## Replay State Model

The platform keeps existing persisted statuses on source records and derives a normalized replay review state:

- `received`
- `processing`
- `succeeded`
- `failed_retryable`
- `failed_terminal`
- `replayed`

This normalized state is part of the replay policy layer and the UI.

## Data Model Changes

New enums:

- `EventReplayTargetType`
- `EventReplayAttemptStatus`

New model:

- `EventReplayAttempt`

Key fields:

- `targetType`
- `targetId`
- `organizationId`
- `billingEventId`
- `domainEventId`
- `webhookDeliveryId`
- `requestedByUserId`
- `requestedByEmail`
- `reason`
- `notes`
- `correlationId`
- `status`
- `failureCode`
- `failureReason`
- `metadata`

## Operator Workflow

1. Open `/admin/replays`
2. Filter by search, target type, or retryability
3. Review:
   - payload metadata
   - failure reason
   - policy classification
   - attempts in the last 24 hours
4. Enter the operator reason
5. Type `REPLAY`
6. Submit replay
7. Review audit logs and replay-attempt history

## Auditability

Every replay request records:

- who triggered it
- what target was replayed
- why it was replayed
- whether it succeeded, failed, or was blocked
- a correlation ID for traceability

Admin audit actions written:

- `admin.event_replayed`
- `admin.event_replay_failed`
- `admin.event_replay_console_viewed`

## Outbound Idempotency Improvement

This phase also adds `idempotencyKey` to outbound event envelopes, including n8n deliveries.

That gives downstream systems a stable dedupe key during replay instead of relying only on event ID or payload shape.

## Environment Variables Required

No new environment variables were added.

Replay behavior still depends on existing configuration:

- `INTERNAL_ADMIN_EMAILS`
- `STRIPE_WEBHOOK_SECRET`
- `OUTBOUND_WEBHOOK_DESTINATIONS`
- `N8N_WORKFLOW_DESTINATIONS`
- `HUBSPOT_ACCESS_TOKEN`

## Migrations Required

Run:

- `20260411033000_event_replay_tooling`

## Test Checklist

1. Create or identify a failed `BillingEvent`.
2. Open `/admin/replays`.
3. Confirm the billing event appears with payload metadata and replay eligibility.
4. Try replaying without a reason or without typing `REPLAY` and confirm the action is blocked.
5. Replay the event with a valid reason and confirmation.
6. Confirm an `EventReplayAttempt` record is written.
7. Confirm an audit log entry is written.
8. Confirm failed outbound deliveries appear with destination metadata.
9. Replay a failed outbound delivery and confirm the status updates.
10. Confirm replay attempts become blocked after the replay rate-limit threshold.

## Manual Setup Steps

1. Run the migration and regenerate Prisma.
2. Ensure the internal operator has `platform.jobs.manage` or stronger access.
3. Open `/admin/replays`.
4. Review failed billing events, failed domain events, and failed deliveries.
5. Replay only after confirming the underlying issue is fixed or the replay is idempotent and safe.

## Failure Scenarios And Handling

### Missing Destination Configuration

- delivery replay is blocked
- operator sees the reason in the UI
- no replay is attempted

### Unsupported Stripe Event Type

- billing replay is blocked
- operator sees the reason in the UI

### In-Flight Processing

- replay is blocked
- current processor remains authoritative

### Poison Event / Invalid Stored Payload

- replay fails explicitly
- attempt is recorded as failed
- original event record remains preserved

## Future Expansion Notes

- Add replay support for other external webhook families beyond Stripe if they gain durable receipt records.
- Add richer filtering by organization and source system on `/admin/replays`.
- Add replay batching only after stronger queue ownership and rate control exists.
- Consider persisting normalized replay-review state if leadership or ops reporting needs it repeatedly.
