# Phase 26: Revenue Architecture Hardening

## Executive Summary

Phase 26 hardens the Evolve Edge revenue model from a basic Stripe sync plus numeric limits into a typed SaaS revenue architecture with:

- a canonical revenue plan catalog
- backward-compatible Prisma schema expansion
- explicit billing access-state classification
- stronger entitlement resolution
- admin-safe plan mapping metadata
- safer upgrade, downgrade, cancel, reactivate, and trial handling

The implementation preserves the current checkout, portal, onboarding, and webhook flows while making the underlying billing logic far less fragile.

## What Existed Before

Before this phase, monetization behavior was spread across a few places:

- `packages/db/prisma/schema.prisma`
  - `Plan` stored price, interval, a single Stripe price ID, three numeric limits, and a JSON `features` blob.
  - `Subscription` stored Stripe IDs, status, trial end, period dates, cancel-at-period-end, and invoice/payment failure metadata.
- `apps/web/lib/billing.ts`
  - owned hardcoded default plans
  - seeded plans directly from service code
  - created trials with a fixed 14-day duration
  - created checkout and portal sessions
  - upserted subscriptions from Stripe events
- `apps/web/lib/entitlements.ts`
  - derived access from latest subscription only
  - treated only `ACTIVE` and `TRIALING` as live access
  - mixed workspace mode, plan features, and usage checks into one lightweight snapshot
- `apps/web/app/dashboard/*`
  - gated assessments and reports with entitlement booleans
  - rendered plan options directly from database rows
- `apps/web/app/api/stripe/webhook/route.ts`
  - handled Stripe webhook verification and sync
  - updated subscription status but did not model lifecycle semantics beyond status

### Gaps and Fragility

The previous model was functional, but too fragile for scale because:

- plan definitions lived partly in code and partly in the database
- Stripe mapping depended on a single `stripePriceId` field with no admin-safe metadata layer
- the system had no explicit billing access state separate from raw subscription status
- cancel/reactivate/plan-change lifecycle timestamps were not tracked
- read-only billing states were not modeled cleanly
- trial policy was fixed and implicit instead of plan-aware
- report access and report generation were effectively the same entitlement
- Stripe conversion from a locally created trial could create lifecycle ambiguity unless carefully matched
- admin visibility into plan mapping and upgrade paths was minimal

## Target Architecture

The target architecture for Phase 26 is:

1. Product revenue catalog as source of truth
   - A typed catalog defines plan family, public/private status, trial policy, price, usage limits, features, Stripe env mapping, and admin-safe metadata.

2. Database as synchronized operational copy
   - Prisma `Plan` rows persist the catalog into the application database.
   - Prisma `Subscription` rows persist the current operational billing state for tenant-scoped runtime checks.

3. Billing access state separated from raw provider status
   - `SubscriptionStatus` remains the synced provider-facing status.
   - `BillingAccessState` becomes the product-facing access classification used by entitlements and UI.

4. Entitlements as a single service-layer contract
   - Feature flags, usage limits, read-only behavior, and workspace capabilities resolve from one shared entitlement snapshot.

5. Stripe still authoritative for billing lifecycle
   - Stripe remains the billing authority.
   - Evolve Edge stores synchronized copies and derived access state without becoming the billing source of truth.

6. UI remains thin
   - Dashboard routes and actions consume billing/entitlement services instead of owning monetization rules.

## What Changed

### 1. Schema Updates

`Plan` now includes:

- `family`
- `version`
- `description`
- `currency`
- `billingIntervalMode`
- `trialDays`
- `sortOrder`
- `isActive`
- `isPublic`
- `billingProvider`
- `billingLookupKey`
- `entitlementConfig`
- `adminMetadata`

`Subscription` now includes:

- `accessState`
- `billingProvider`
- `externalStatus`
- `planCodeSnapshot`
- `stripePriceIdSnapshot`
- `accessEndsAt`
- `gracePeriodEndsAt`
- `trialStartedAt`
- `cancelScheduledAt`
- `canceledAt`
- `endedAt`
- `reactivatedAt`
- `statusUpdatedAt`
- `billingMetadata`

New enums:

- `BillingInterval`
- `BillingProvider`
- `BillingAccessState`

New migration:

- `packages/db/prisma/migrations/20260410210000_revenue_architecture_hardening/migration.sql`

### 2. Canonical Revenue Catalog

Added:

- `apps/web/lib/revenue-catalog.ts`

This file now defines:

- canonical plan metadata
- feature keys
- usage limits
- Stripe env variable bindings
- admin-safe plan metadata
- upgrade and downgrade relationships

Current public plans remain:

- `growth-annual`
- `enterprise-annual`

### 3. Billing Service Hardening

Refactored:

- `apps/web/lib/billing.ts`

Key changes:

- plan sync now comes from the typed catalog
- plan rows are upserted with richer metadata
- current subscription selection prefers the strongest current access state instead of blindly taking the newest row
- trial creation is plan-aware and records lifecycle timestamps
- Stripe sync now updates an existing trial placeholder when possible instead of behaving like a blind new-row sync
- subscription access state is derived explicitly
- plan-change direction is tracked for upgrade/downgrade semantics
- billing metadata is stored with the subscription record

### 4. Entitlement Model Hardening

Refactored:

- `apps/web/lib/entitlements.ts`

Added:

- `workspaceMode = READ_ONLY`
- `billingAccessState`
- `isReadOnly`
- `canAccessWorkspace`
- `canGenerateReports`
- `availablePlanMappings`

Behavior changes:

- `ACTIVE` and `GRACE_PERIOD` map to live subscription mode
- `PAST_DUE`, `PAUSED`, and `CANCELED` can preserve read-only workspace access
- report archive visibility can remain available while new report generation is gated
- assessment creation remains blocked in read-only states

### 5. Middleware / Guards

Added:

- `apps/web/lib/entitlement-guards.ts`

This centralizes server-side guards for:

- feature requirements
- assessment creation permission

### 6. Dashboard and Admin Updates

Updated:

- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/admin/page.tsx`
- `apps/web/lib/dashboard.ts`

Important effects:

- assessments now use a dedicated entitlement guard
- reports distinguish access from generation
- settings now render clearer lifecycle labels and upgrade/downgrade button states
- admin now shows canonical admin-safe plan mappings
- dashboard summary text understands read-only workspaces

### 7. Seed Data

Updated:

- `packages/db/prisma/seed.ts`

Seeded plan and subscription records now include the new revenue metadata and access state fields.

## Why It Matters

This phase moves Evolve Edge closer to an investor-grade SaaS monetization foundation because it:

- reduces plan-definition drift between code and database
- makes billing rules easier to reason about and audit
- supports better product expansion paths
- protects customer data access while still enforcing write-path restrictions
- makes Stripe synchronization safer
- improves admin observability without exposing unsafe provider assumptions in product UI
- separates product entitlements from presentation logic

## Subscription / Plan Model Improvements

### Plan Model

The plan model now supports:

- public vs internal plan visibility
- sort order for pricing/upgrade UX
- plan family and versioning
- plan-scoped trial defaults
- typed feature entitlements
- admin-safe mapping metadata
- Stripe lookup binding through `billingLookupKey` and env-backed price IDs

### Subscription Model

The subscription model now supports:

- raw provider status plus product-facing access state
- lifecycle timestamps for cancel/reactivate/end events
- plan code and Stripe price snapshots
- explicit read-only access windows
- richer billing metadata storage

## Feature Entitlement Model

The entitlement snapshot now resolves:

- workspace mode
- billing access state
- feature flags
- usage limits
- seat and assessment capacity
- read-only vs write-capable access
- billing portal availability
- admin-safe plan mapping visibility

Current modeled feature keys:

- `assessments`
- `reportCenter`
- `roadmap`
- `teamManagement`
- `billingPortal`
- `executiveReviews`
- `customFrameworks`
- `prioritySupport`
- `apiAccess`

## Billing State Handling

Raw `SubscriptionStatus` is no longer the only signal used by the app.

The app now derives:

- `TRIALING`
- `ACTIVE`
- `GRACE_PERIOD`
- `PAST_DUE`
- `PAUSED`
- `CANCELED`
- `INCOMPLETE`
- `INACTIVE`

### Access Behavior by State

- `TRIALING`
  - full product access within the trial policy
- `ACTIVE`
  - full product access
- `GRACE_PERIOD`
  - active access until the scheduled end of term
- `PAST_DUE`
  - read-only workspace access preserved
- `PAUSED`
  - read-only workspace access preserved
- `CANCELED`
  - read-only handling while data remains accessible, then inactive once access window ends
- `INCOMPLETE`
  - no paid write access
- `INACTIVE`
  - no live billing-backed access

## Upgrade / Downgrade / Cancel / Reactivate Logic

### Upgrade / Downgrade

The system now:

- compares current and target plan sort order
- labels checkout actions as upgrade, downgrade, current, or choose plan
- records plan code snapshots on subscriptions
- emits subscription update events with plan transition metadata

### Cancel

The system now records:

- `cancelAtPeriodEnd`
- `cancelScheduledAt`
- `gracePeriodEndsAt`
- `canceledAt`
- `endedAt`

This makes scheduled cancellation and end-of-term access easier to reason about.

### Reactivate

The system now records:

- `reactivatedAt`
- `statusUpdatedAt`

This improves traceability when a subscription returns to `ACTIVE` or `TRIALING`.

## Trial Logic

Trial behavior is now stronger because:

- trial duration is plan-aware through `trialDays`
- trial lifecycle timestamps are recorded
- the app prefers updating the existing org subscription record instead of leaving trial-to-paid state ambiguous

## Admin-Safe Plan Mapping Structure

Admin-safe plan mapping is now defined in:

- `apps/web/lib/revenue-catalog.ts`

And surfaced in:

- `apps/web/app/admin/page.tsx`

The mapping includes:

- plan code
- family
- version
- lookup key
- Stripe env var name
- price
- trial days
- usage limits
- features
- support tier
- target buyer metadata
- upgrade and downgrade path metadata

This is safe to show internally because it references env var names, not secret values.

## Env Vars Required

No brand-new env vars were required for this phase. The hardened implementation continues using the existing billing envs:

```env
DEFAULT_PLAN_CODE="growth-annual"
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_PRICE_GROWTH_ANNUAL=""
STRIPE_PRICE_ENTERPRISE_ANNUAL=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Copy-Paste `.env` Snippet

```env
DEFAULT_PLAN_CODE="growth-annual"
STRIPE_SECRET_KEY="sk_live_replace_me"
STRIPE_WEBHOOK_SECRET="whsec_replace_me"
STRIPE_PRICE_GROWTH_ANNUAL="price_growth_annual_replace_me"
STRIPE_PRICE_ENTERPRISE_ANNUAL="price_enterprise_annual_replace_me"
NEXT_PUBLIC_APP_URL="https://app.evolveedge.ai"
```

## Migration Notes

1. Run the new Prisma migration.
2. Regenerate the Prisma client.
3. Restart the app.
4. Verify Stripe price env mappings exist before running checkout.
5. Review any legacy subscription rows for plan-code or Stripe-price mapping anomalies if production data already contains unusual manual states.

### Backward Compatibility Notes

- Existing `Plan` and `Subscription` tables were preserved.
- Legacy columns like `features`, `activeAssessmentsLimit`, `seatsLimit`, and `frameworksLimit` remain in place.
- Existing webhook routes and onboarding entry points still work.
- Existing plan codes remain stable.

## Test Checklist

- Prisma migration applies cleanly.
- Prisma client generates cleanly.
- Dashboard TypeScript compiles.
- Onboarding still creates a trial subscription for a new org.
- Existing org with Stripe checkout still reaches Stripe checkout.
- Stripe webhook sync updates an existing org subscription instead of drifting into an ambiguous current state.
- Settings page shows current lifecycle and correct upgrade/downgrade labels.
- Assessment creation blocks when plan or limit requires blocking.
- Report archive remains visible when a workspace is read-only.
- New report generation blocks when a workspace is read-only.
- Admin console shows canonical plan mappings and subscription access state.

## Manual Setup Steps

### 1. Apply migration and generate client

```powershell
pnpm db:migrate
pnpm db:generate
```

### 2. Re-seed local development data if needed

```powershell
pnpm db:seed
```

### 3. Run the app type check used during this phase

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

### 4. Optional local Stripe webhook forwarding

```powershell
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

## External Tool Configuration Snippets

### Stripe Product / Price Mapping Reference

Use this mapping when creating or verifying Stripe prices:

```text
growth-annual -> STRIPE_PRICE_GROWTH_ANNUAL
enterprise-annual -> STRIPE_PRICE_ENTERPRISE_ANNUAL
```

### Stripe Webhook Endpoint

Configure Stripe to send these event types to:

```text
POST https://your-app-domain.example/api/stripe/webhook
```

Recommended event set:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

## Exact Files Changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260410210000_revenue_architecture_hardening/migration.sql`
- `packages/db/prisma/seed.ts`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/entitlements.ts`
- `apps/web/lib/entitlement-guards.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/admin/page.tsx`
- `docs/phase-26-revenue-architecture.md`

## Assumptions

- Stripe remains the only live billing provider in the current phase.
- Only annual public plans are currently productized.
- Plan changes are still executed through Stripe Checkout / Billing Portal rather than a custom in-app subscription management UI.
- One organization should have one logical current subscription, even if historical rows exist.
- Read-only access is preferable to hard lockout for past-due, paused, or recently canceled customer workspaces.
- Existing demo mode must remain explorable without Stripe enforcement.
- No new metered billing dimension was introduced in this phase.
