# System Map

## Purpose

This document is the fast orientation map for engineers and operators joining
Evolve Edge.

The core rule is simple:

- the Evolve Edge app owns product state and business logic
- external systems stay in their lane

Current AI execution lane:

- n8n triggers `POST /api/internal/ai/execute`
- the Next.js backend validates and queues the request
- the app-owned provider layer runs the LangGraph audit workflow
- OpenAI handles model execution inside named workflow nodes
- validated structured output is persisted by the backend
- n8n does not own prompt logic, scoring, framework mapping, or report persistence
- Dify is deprecated and retained only as a rollback reference

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
- service-layer mutations should prove tenant ownership when a caller provides a
  global record id
- current narrow adoption: executive delivery package mutations now resolve
  `ReportPackage` inside the expected `organizationId` before update

### Billing And Revenue

- `apps/web/lib/billing.ts`
- `apps/web/lib/entitlements.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/delivery-state.ts`
- `apps/web/lib/delivery-reconciliation.ts`
- `apps/web/lib/delivery-mismatch-detection.ts`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/usage-metering.ts`
- `apps/web/lib/expansion-engine.ts`

Responsibilities:

- Stripe-synced billing copy
- plan mapping and entitlements
- checkout/billing-originated routing snapshots
- in-app workflow-family routing decisions
- pricing and upgrade logic
- paid-request lifecycle tracking
- billing reconciliation and mismatch detection
- usage metering and revenue pressure

Authority:

- Stripe is authoritative for billing lifecycle
- app database is authoritative for product access derived from Stripe sync
- `commercial-routing.ts` is authoritative for paid-request routing snapshots
- `workflow-routing.ts` is authoritative for dashboard assessment/report routing
  decisions
- routing snapshots now carry plan-aware capability policy for AI/report execution
  including report depth, findings cap, roadmap detail, and executive/monitoring
  eligibility flags

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
- `apps/web/lib/dify-adapter.ts`
- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/customer-runs.ts`

Responsibilities:

- intake and assessment records
- typed Dify input/output normalization
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

### LangGraph and OpenAI

- app-owned AI execution only
- LangGraph sequences typed workflow nodes
- OpenAI performs model execution
- neither system owns product state

### Dify

- deprecated rollback path only
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
6. `docs/billing-reconciliation-and-delivery-operations.md`
7. `docs/first-customer-launch-checks.md`
8. `docs/workflows/n8n-ai-execution.md`
