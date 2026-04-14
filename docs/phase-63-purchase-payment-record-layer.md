# Phase 63: Purchase / Payment Record Layer

This phase introduces a normalized backend-owned purchase/payment record layer
without changing delivery-state or mismatch-detection behavior.

## Why

The platform already persisted Stripe receipts in `BillingEvent` and commercial
activity in `BillingEventLog`, but it did not expose a compact, queryable set of
payment identifiers for reconciliation and idempotent lookup.

## Canonical persistence choice

The safest choice was to extend `BillingEventLog` instead of introducing a
parallel purchase ledger. The model now stores:

- `planCodeSnapshot`
- `stripeEventId`
- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `amountCents`
- `currency`

This keeps Neon and backend as the source of truth while preserving current
Stripe behavior.

## Stripe events covered

The webhook now persists normalized purchase fields for:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `checkout.session.async_payment_failed`

## Migration

Run:

```powershell
pnpm db:migrate:deploy
```

Then redeploy the app so the webhook handlers and Prisma schema stay aligned.

## Not included in this phase

- delivery-state lifecycle normalization
- mismatch detection
- reconciliation operators UI
- retry/replay handling
