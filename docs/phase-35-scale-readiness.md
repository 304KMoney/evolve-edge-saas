# Phase 35: Scale Readiness

## What Scale Risks Were Identified

The repo already had a real internal admin console, scheduled jobs, webhook retry handling, audit logs, billing sync, and ops-readiness checks. The highest-leverage gaps were not missing infrastructure from scratch. They were visibility and operator efficiency gaps:

- the admin console had broad read-only visibility, but not enough support-safe account summaries for fast customer lookup
- billing debugging existed in fragments, but Stripe event visibility was not surfaced in the main operator console
- growth and lead pipeline visibility existed in the database, but was not summarized for operators
- environment and integration readiness were spread across env vars and helper functions rather than shown in one place
- there was no centralized feature-flag hook layer for ops/admin-facing rollout decisions

## What Was Implemented

### Centralized Feature Flags

Added `apps/web/lib/feature-flags.ts` to centralize app-owned feature flags.

Current flags:

- `advancedAdminConsole`
- `growthPipelineVisibility`
- `supportAccountSummaries`
- `opsConfigVisibility`

Flags are sourced from `APP_FEATURE_FLAGS` and default safely inside the app.

### Admin Scale Snapshot Service

Added `apps/web/lib/admin-console.ts` as a shared data layer for admin/operator views.

It now consolidates:

- support-safe account summaries
- billing event visibility
- lead pipeline visibility
- environment/config readiness
- growth summary metrics

### Admin Console Improvements

Updated `apps/web/app/admin/page.tsx` to add:

- environment and flags section
- support-safe account summaries
- billing event inspection
- growth and lead pipeline visibility

This makes the console more useful for support, growth ops, and billing/debug workflows without adding mutation-heavy admin powers.

### Unified Account Lifecycle Drill-Down

Added `apps/web/lib/customer-lifecycle.ts` as a shared lifecycle snapshot service that joins:

- latest lead context
- billing and Stripe-linked subscription state
- entitlement-derived access posture
- usage and metering
- activation progress
- retention posture
- product analytics counts

Added `apps/web/app/admin/accounts/[organizationId]/page.tsx` as a protected org detail route and linked the main admin console to it.

This gives operators one account-level view instead of forcing support and growth teams to mentally join multiple systems and tables.

### Config Centralization Improvement

Added `APP_FEATURE_FLAGS` to `.env.example` so operator-facing flags are configured in one explicit place.

## Why These Changes Matter Before Growth

As customer count and plan complexity increase, the biggest early ops failure is not usually missing infrastructure. It is slow diagnosis.

These changes matter because they reduce the time to answer:

- which account is this user tied to
- who owns the account
- what plan and billing state is the account in
- whether payment or Stripe webhook issues are involved
- whether lead capture and revenue pipeline data is flowing
- whether the environment is configured for the intended ops behavior
- which admin-only features are supposed to be active

That is exactly the kind of leverage needed before support volume, event volume, and billing edge cases rise.

## Security Considerations

- All new visibility remains read-only.
- No new customer-facing admin routes were introduced.
- No sensitive mutation tooling was added.
- The existing `requireAdminSession()` guard remains the gate for the admin console.
- Support-safe summaries intentionally focus on operator-useful state and avoid exposing raw sensitive payloads unnecessarily.
- Feature flags remain app-owned and server-side readable, rather than hidden in client UI logic.

## Access Control Notes

Admin access still requires:

- authenticated app session
- email allowlisting through `INTERNAL_ADMIN_EMAILS`

Normal users do not gain access to:

- account lookup
- billing event visibility
- lead pipeline summaries
- integration readiness data
- feature flag state

## Future Ops Roadmap

Recommended next steps after this phase:

1. Expand org-level admin drill-down pages into a fuller account timeline and support workspace.
2. Add read-only customer timeline views that unify lead, billing, activation, usage, and retention events.
3. Add explicit support ticket notes or internal account annotations.
4. Add searchable product analytics views in admin for funnel debugging.
5. Add per-destination retry controls for failed webhooks and email notifications.
6. Add safe replay tools for selected idempotent domain events.
7. Add org-level success/risk cohorts in admin based on retention and activation snapshots.
8. Add environment validation checks for required secrets and external integrations at startup.
9. Add admin-safe impersonation-free support links for guided customer troubleshooting.
10. Add structured admin permissions beyond email allowlists if operator headcount grows.

## Prioritized Next 10 Scale Upgrades

1. Expand org drill-down admin pages into a single account timeline
2. Searchable analytics explorer for funnel and churn debugging
3. Domain event replay tooling for safe idempotent retries
4. Email notification failure console with resend visibility
5. Billing anomaly queue for `past_due`, duplicate subscriptions, and webhook lag
6. Success-risk queue driven by activation and retention signals
7. Fine-grained admin roles beyond email allowlists
8. Config validation dashboard with secret/integration health checks
9. Support annotations and internal notes on organizations
10. Background job concurrency and backlog visibility

## Exact Files Changed

- `apps/web/lib/feature-flags.ts`
- `apps/web/lib/admin-console.ts`
- `apps/web/lib/customer-lifecycle.ts`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/accounts/[organizationId]/page.tsx`
- `.env.example`
- `docs/phase-35-scale-readiness.md`

## Exact Migrations

None for this phase.

## Exact Commands To Run

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

## Env Vars

Newly documented for this phase:

```env
APP_FEATURE_FLAGS='{"advancedAdminConsole":true,"growthPipelineVisibility":true,"supportAccountSummaries":true,"opsConfigVisibility":true}'
```

Still required for secure admin and ops behavior:

- `INTERNAL_ADMIN_EMAILS`
- `CRON_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`
- Stripe billing env vars if billing flows are enabled
