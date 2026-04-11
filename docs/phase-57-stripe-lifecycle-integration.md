# Phase 57 — Stripe Lifecycle Integration

## What existed before

Before this phase, Evolve Edge already had:

- Stripe checkout and customer portal flows
- a verified webhook endpoint
- idempotent `BillingEvent` claim records for Stripe webhook processing
- app-owned `Subscription` snapshots
- canonical plan and billing customer foundation from phases 54 and 55

That was a strong start, but the lifecycle still had three reliability gaps:

- Stripe plan resolution could fall back too loosely when mappings were missing
- Stripe-synced subscriptions were not consistently attaching the org `BillingCustomer`
- append-only `BillingEventLog` entries were not consistently written for Stripe lifecycle transitions

## What was implemented

This phase hardens the Stripe lifecycle path without changing who owns what:

- Stripe remains the source of truth for payment and subscription lifecycle
- the app remains the source of truth for internal access state and product behavior

### Added and tightened behavior

- explicit Stripe subscription status mapping via `resolveStripeSubscriptionStatus()`
- stricter Stripe plan resolution in `resolvePlanForStripeSubscription()`
- org-level Stripe billing customer upsert during Stripe sync
- append-only Stripe billing event log writes for:
  - subscription snapshot create/update
  - invoice paid
  - invoice payment failed
  - invoice payment action required
  - checkout async payment failed

## Why it matters

This makes billing safer in production:

- missing Stripe price mappings now fail loudly instead of defaulting to the wrong plan
- synced subscriptions are consistently linked to the canonical org billing customer
- operators now have append-only business-level Stripe lifecycle history in `BillingEventLog`
- replayed Stripe webhooks stay safe because mutable processing state and append-only business history are separated

## Architecture decisions

### Stripe plan resolution is explicit

Plan resolution order is now:

1. `stripePriceId` exact match on `Plan`
2. `metadata.planCode` fallback
3. existing subscription plan for the same Stripe subscription

It no longer falls back to “latest org subscription” or “first active plan,” because those fallbacks are unsafe for regulated billing flows.

### Mutable webhook receipts and append-only billing history stay separate

- `BillingEvent` remains the mutable webhook processing receipt
- `BillingEventLog` is the append-only internal billing history

This keeps replay safety and operator visibility cleanly separated.

### Internal access still comes from app-owned subscription state

Stripe events are synchronized into `Subscription`, and `Subscription.accessState` continues to drive internal product access decisions.

## Environment variables required

No new environment variables were added in this phase.

Existing required Stripe variables still apply:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

## Migrations required

No new schema or migration changes were required in this phase.

## Test checklist

- Stripe `trialing` maps to internal `TRIALING`
- Stripe `active` maps to internal `ACTIVE`
- Stripe `past_due` maps to internal `PAST_DUE`
- Stripe `canceled` and `unpaid` map to internal `CANCELED`
- Stripe `paused` maps to internal `PAUSED`
- Stripe `incomplete_expired` maps to internal `INCOMPLETE`
- successful invoice sync writes append-only Stripe billing event logs
- failed invoice sync writes append-only Stripe billing event logs
- Stripe plan mapping failure does not silently assign the first active plan

## Manual setup steps

1. Confirm `Plan.stripePriceId` values are populated from the current env-backed plan catalog.
2. Confirm your Stripe webhook endpoint is active at `/api/stripe/webhook`.
3. Send test Stripe events for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Verify:
   - `BillingEvent` rows are claimed and processed idempotently
   - `Subscription` is updated correctly
   - `BillingCustomer` is attached to the org
   - `BillingEventLog` receives append-only Stripe lifecycle entries

## Future expansion notes

- move more billing admin surfaces to read from `BillingEventLog`
- add explicit Stripe customer update sync for name/email changes into `BillingCustomer`
- add background reconciliation for historical Stripe subscriptions that predate the canonical billing domain
- extend replay tooling to drill directly into Stripe billing lifecycle logs alongside `BillingEvent`
