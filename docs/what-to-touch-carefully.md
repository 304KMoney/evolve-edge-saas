# What To Touch Carefully

## Why This Exists

Evolve Edge has a few areas where a seemingly small code change can create
customer-facing breakage, billing drift, or operator confusion.

This document flags those areas for future engineers.

## Highest-Risk Areas

### Auth And Tenant Resolution

Files:

- `apps/web/lib/auth.ts`

Why it is sensitive:

- controls session validation
- controls onboarding redirects
- controls admin allowlist gating
- mistakes here can create tenant access bugs

### Billing And Entitlements

Files:

- `apps/web/lib/billing.ts`
- `apps/web/lib/entitlements.ts`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/usage-metering.ts`

Why it is sensitive:

- access decisions ultimately affect paying customers
- Stripe is authoritative, but the app decides user-facing access mode
- duplicated plan logic will drift quickly

### Report Generation Flow

Files:

- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/continuous-monitoring.ts`
- `apps/web/lib/engagement-programs.ts`

Why it is sensitive:

- one report action currently fans out into many app-owned systems
- delivery, monitoring, lifecycle, and engagement history are all linked here
- changing call order without understanding side effects can create partial state

### Domain Events And Outbound Dispatch

Files:

- `apps/web/lib/domain-events.ts`
- `apps/web/lib/webhook-dispatcher.ts`
- `apps/web/lib/reliability.ts`

Why it is sensitive:

- retry behavior and idempotency matter here
- external systems must stay downstream of app truth
- duplicate or skipped events are hard to debug later

### Customer And Operator Control Plane

Files:

- `apps/web/lib/customer-accounts.ts`
- `apps/web/lib/customer-runs.ts`
- `apps/web/lib/operator-console.ts`
- `apps/web/app/admin/*`

Why it is sensitive:

- internal notes must never leak into customer views
- retries and escalation actions must stay auditable
- operator logic should stay read-safe and action-safe

## Guardrails For Future Changes

Before editing any of the areas above:

1. identify the source-of-truth owner
2. search for downstream side effects
3. search for audit log and domain event behavior
4. check admin surfaces that rely on the same state
5. add tests if the change affects access, retries, or customer lifecycle

## Deferred Technical Debt To Watch

- some pages still compute labels locally instead of using one shared formatter
- root repo contains business collateral that does not belong in the deploy repo
- customer lifecycle, retention, and engagement history still deserve one
  consolidated internal handbook over time
