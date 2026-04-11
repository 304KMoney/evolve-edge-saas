# System Map

## Purpose

This document is the fast orientation map for engineers and operators joining
Evolve Edge.

The core rule is simple:

- the Evolve Edge app owns product state and business logic
- external systems stay in their lane

## Top-Level Repo Layout

- `apps/web`
  - Next.js app
  - customer-facing product
  - internal admin/operator surfaces
  - service-layer logic for auth, billing sync, analytics, CRM handoff, delivery,
    monitoring, and ops
- `packages/db`
  - Prisma schema
  - migrations
  - generated client exports
  - seed logic
- `docs`
  - runbooks, phase docs, and internal engineering notes

## Product Domains

### Identity And Tenant Boundary

- `apps/web/lib/auth.ts`
- `Organization`
- `OrganizationMember`
- `Session`
- `PasswordCredential`

Responsibilities:

- session auth
- onboarding gating
- tenant-scoped identity
- internal admin allowlist checks

### Billing And Revenue

- `apps/web/lib/billing.ts`
- `apps/web/lib/entitlements.ts`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/usage-metering.ts`
- `apps/web/lib/expansion-engine.ts`

Responsibilities:

- Stripe-synced billing copy
- plan mapping and entitlements
- pricing and upgrade logic
- usage metering and revenue pressure

Authority:

- Stripe is authoritative for billing lifecycle
- app database is authoritative for product access derived from Stripe sync

### Customer Lifecycle And Lead Pipeline

- `apps/web/lib/lead-pipeline.ts`
- `apps/web/lib/customer-accounts.ts`
- `apps/web/lib/customer-lifecycle.ts`
- `apps/web/lib/provisioning.ts`

Responsibilities:

- lead capture and dedupe
- prospect-to-customer control plane
- founder/operator lifecycle visibility
- CRM-safe state sync

### Assessment, Reporting, And Executive Delivery

- `apps/web/app/dashboard/assessments/*`
- `apps/web/app/dashboard/reports/*`
- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/customer-runs.ts`

Responsibilities:

- intake and assessment records
- report generation
- executive package versioning
- run-state tracking across delivery steps

### Continuous Monitoring And Programs

- `apps/web/lib/continuous-monitoring.ts`
- `apps/web/lib/engagement-programs.ts`
- `apps/web/app/dashboard/monitoring/*`
- `apps/web/app/dashboard/programs/*`

Responsibilities:

- recurring monitoring posture
- remediation continuity
- multi-service engagement history
- long-lived customer program model

### Events, Async Dispatch, And Reliability

- `apps/web/lib/domain-events.ts`
- `apps/web/lib/webhook-dispatcher.ts`
- `apps/web/lib/jobs.ts`
- `apps/web/lib/reliability.ts`

Responsibilities:

- durable domain events
- outbound delivery retries
- scheduled jobs
- retry safety and external failure normalization

### Internal Admin And Ops

- `apps/web/app/admin/*`
- `apps/web/lib/admin-console.ts`
- `apps/web/lib/operator-console.ts`
- `apps/web/lib/ops-readiness.ts`

Responsibilities:

- internal-only customer and org visibility
- queue-style operator workflows
- readiness and operational health views
- support-safe summaries and retries

## External System Boundaries

### Stripe

- subscription lifecycle authority
- invoice/payment authority
- never the source of truth for in-app workflow state

### HubSpot

- CRM visibility only
- never product truth

### n8n

- orchestration only
- never core business logic owner

### Dify

- AI execution only
- never product state owner

## Operational Entry Points

- customer app: `/dashboard/*`
- admin/operator app: `/admin/*`
- Stripe webhook: `/api/stripe/webhook`
- internal jobs: `/api/internal/jobs/run`
- internal notifications: `/api/internal/notifications/*`
- internal analysis dispatch: `/api/internal/analysis/dispatch`
- provisioning handoff: internal provisioning API routes

## Recommended Reading Order

1. `README.md`
2. `docs/how-platform-works.md`
3. `docs/how-to-operate-platform.md`
4. `docs/what-to-touch-carefully.md`
5. phase docs relevant to the area you are editing
