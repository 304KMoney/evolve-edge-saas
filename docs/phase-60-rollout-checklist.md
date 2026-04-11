# Phase 60 Rollout Checklist

Phase 60 hardens commercial launch readiness for billing, entitlements, usage enforcement, and operator debugging.

## Pre-deploy

1. Confirm Stripe configuration is correct:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - active Stripe price IDs match seeded/internal plan mappings
2. Confirm internal admin access is configured:
   - `INTERNAL_ADMIN_EMAILS`
   - persisted platform roles for support/operators where possible
3. Confirm billing and entitlement migrations from prior phases are already applied.
4. Review [phase-57-stripe-lifecycle-integration.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-57-stripe-lifecycle-integration.md), [phase-58-billing-admin-enterprise-overrides.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-58-billing-admin-enterprise-overrides.md), and [phase-59-product-surface-integration.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-59-product-surface-integration.md).

## Deploy validation

1. Run `pnpm db:generate`.
2. Run `apps/web -> tsc --noEmit`.
3. Run `apps/web -> pnpm test`.
4. Deploy the web application.
5. Confirm `/api/stripe/webhook` is still registered in Stripe.

## Post-deploy QA

1. Trial to active:
   - create or use a test subscription in trial
   - confirm first successful invoice moves internal subscription to active access
   - confirm the account timeline shows `subscription started`
2. Failure to recovery:
   - trigger `invoice.payment_failed`
   - confirm internal subscription state, billing event receipt, and account timeline update
   - confirm `/admin/accounts/[organizationId]` shows retryable billing health
   - run manual billing resync and confirm state stabilizes
3. Cancellation:
   - trigger cancel-at-period-end and then end-state cancellation
   - confirm retention timeline entries and admin billing snapshot
4. Quota enforcement:
   - exhaust a monthly audit or evidence quota
   - confirm safe failure response and `quota exceeded` timeline event

## Launch sign-off

Commercial launch is ready when:

1. Stripe receipts are processing successfully or remaining failures are understood.
2. Operators can inspect an org’s billing snapshot, entitlement debug, and usage logs without database access.
3. Manual Stripe resync is tested and auditable.
4. Support has the runbook and incident guide linked below.

References:

- [phase-60-support-runbook.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-60-support-runbook.md)
- [phase-60-incident-handling-guide.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-60-incident-handling-guide.md)
