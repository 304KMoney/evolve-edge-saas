# Subscription Domain and Canonical Plan Model

## What existed before

Evolve Edge already had working billing primitives:

- `Plan` for public Stripe-backed plan variants such as `growth-annual`
- `Subscription` as the app-owned synced subscription snapshot
- `BillingEvent` for Stripe webhook processing state
- centralized variant catalog in [revenue-catalog.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/revenue-catalog.ts)

That foundation was useful, but it mixed two concerns:

- internal product plan identity
- external billing variant identity

It also did not yet provide:

- canonical plan keys like `starter` or `enterprise`
- an org-owned billing customer record
- an append-only internal billing ledger

## What this phase implements

This phase adds an internal billing domain foundation without replacing the current lifecycle wiring:

- canonical plan keys: `starter`, `growth`, `scale`, `enterprise`
- `BillingCustomer` for org-level billing ownership and external customer identity
- `BillingEventLog` as an append-only internal billing log
- canonical plan mapping on `Plan`
- canonical plan snapshot fields on `Subscription`
- `Organization.billingOwnerUserId` for explicit org billing ownership
- `subscription-domain.ts` as the shared service layer for plan retrieval, customer ownership, subscription snapshots, and billing log appends

## Why it matters

This creates a stable product-side billing language that can survive pricing changes.

- Marketing and Stripe can change plan variants later.
- The app can keep stable internal plan semantics.
- Org billing ownership is now explicit instead of implied.
- Billing history can be appended and audited without mutating past records.

## Architecture decisions

### Canonical plan keys sit above variant plan codes

`Plan.code` remains backward-compatible because it is already used across:

- entitlement resolution
- seeds
- pricing
- analytics
- Stripe sync

Instead of redefining `Plan.code`, the schema now adds `Plan.canonicalKey`.

Examples:

- `growth-monthly` -> `GROWTH`
- `growth-annual` -> `GROWTH`
- `enterprise-monthly` -> `ENTERPRISE`
- `enterprise-annual` -> `ENTERPRISE`

`STARTER` and `SCALE` now exist as canonical internal keys even though they do not yet have public Stripe-backed variants.

### Billing customer is org-scoped

`BillingCustomer` is unique per `(organizationId, billingProvider)`.

This lets the app keep billing ownership at the org level instead of scattering provider customer IDs across subscriptions only.

### Billing event log is append-only

`BillingEventLog` is separate from `BillingEvent`.

- `BillingEvent` remains the mutable processing record for incoming Stripe webhook work.
- `BillingEventLog` is an append-only business ledger for billing-domain history.

### Service layer is intentionally narrow

[subscription-domain.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/subscription-domain.ts) provides:

- `listCanonicalPlans`
- `retrieveCanonicalPlan`
- `retrieveCanonicalPlanForRevenueCode`
- `getOrganizationBillingCustomer`
- `ensureOrganizationBillingCustomer`
- `getOrganizationSubscriptionSnapshot`
- `setOrganizationSubscriptionSnapshot`
- `appendBillingEventLog`

This phase does not replace existing Stripe lifecycle sync. It creates the stable internal foundation that later phases can build on.

## Schema changes

- Added enum `CanonicalPlanKey`
- Added enum `BillingEventLogSource`
- Added `Plan.canonicalKey`
- Added `Organization.billingOwnerUserId`
- Added `Subscription.billingCustomerId`
- Added `Subscription.canonicalPlanKeySnapshot`
- Added model `BillingCustomer`
- Added model `BillingEventLog`

## Environment variables required

No new environment variables are required in this phase.

Existing Stripe configuration still applies where already used:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

## Migrations required

Apply the Prisma migration added for this phase before running the app against a shared database.

## Manual setup steps

1. Run the Prisma migration.
2. Regenerate Prisma client.
3. Reseed local/demo data if you rely on seed billing fixtures.
4. Confirm seeded organizations now have:
   - a `BillingCustomer`
   - a `billingOwnerUserId`
   - a `Subscription` with `canonicalPlanKeySnapshot`

## Test checklist

1. Verify canonical plan helpers return the expected mappings.
2. Verify `starter` and `scale` exist as canonical plans without public revenue variants.
3. Verify seed data still creates a valid active subscription.
4. Verify `ensureDefaultPlans()` writes `canonicalKey` to seeded `Plan` rows.
5. Verify `setOrganizationSubscriptionSnapshot()` can create or update a snapshot safely.
6. Verify duplicate `BillingEventLog` writes with the same `(eventSource, idempotencyKey)` are deduplicated.

## Future expansion notes

- Wire `BillingCustomer` into the Stripe checkout and reconciliation layer as the primary provider customer owner.
- Expand `BillingEventLog` usage so all important billing-domain transitions write append-only records.
- Add explicit plan-version support if pricing packages change materially.
- Add internal admin surfaces for billing customer inspection and plan snapshot history.
