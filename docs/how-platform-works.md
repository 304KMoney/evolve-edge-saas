# How The Platform Works

## Short Version

Evolve Edge is an app-owned control plane for compliance, risk, and executive
delivery.

The high-level customer path is:

1. lead captured
2. workspace provisioned
3. onboarding completed
4. assessment intake captured
5. analysis executed
6. report generated
7. executive package reviewed and delivered
8. monitoring and remediation continue

## Core Principles

- product logic lives in the app
- tenant scoping is mandatory
- Stripe owns billing truth
- HubSpot owns CRM visibility, not access
- n8n orchestrates, but does not own business rules
- Dify executes AI workflows, but does not persist product state

## Primary Data Flow

### 1. Lead And Sales Handoff

- lead forms land in `LeadSubmission`
- provisioning and customer-account logic create or sync the customer control plane
- CRM updates are downstream-only

### 2. Workspace And Billing

- users sign in through app-owned auth/session logic
- org membership determines tenant access
- Stripe sync updates local subscription copies
- entitlements and usage determine feature access in the app
- Stripe payment events are persisted as `BillingEvent`
- paid requests get linked to routing, execution, and delivery records in Neon
- service-layer mutations should resolve tenant-owned records inside the expected
  `organizationId` boundary when a global record id is supplied
- the first shared scoped-access helper adoption now protects executive delivery
  package mutations from cross-tenant id misuse

### 2a. Routing Source Of Truth

Evolve Edge currently has two backend-owned routing layers, and they do not serve
the same trigger path:

- `apps/web/lib/commercial-routing.ts`
  - source of truth for checkout and billing-originated paid-request routing
  - computes durable `RoutingSnapshot` records
  - inputs:
    - canonical commercial plan resolution
    - org entitlements
    - workspace access
    - active-assessment capacity
    - billing/checkout source metadata
    - environment label
- `apps/web/lib/workflow-routing.ts`
  - source of truth for in-app workflow-family routing used by dashboard
    assessment and report actions
  - computes `WorkflowRoutingDecision` records
  - inputs:
    - canonical plan compatibility state
    - org entitlements
    - usage-metering quota posture
    - workflow family
    - environment label

Important rule:

- `commercial-routing.ts` decides whether a paid request is admitted into
  orchestration and what canonical routing snapshot downstream systems should use
- `workflow-routing.ts` decides how in-app assessment/report workflows should be
  handled for a given org state

These layers intentionally share commercial inputs, but they are not
interchangeable.

### 3. Assessment To Report

- assessment sections store intake
- analysis jobs record Dify execution metadata and outputs
- `apps/web/lib/dify-adapter.ts` validates and normalizes Dify input/output contracts
- report generation creates findings, recommendations, report records, events,
  notifications, and executive delivery packages

### 4. Delivery And Ongoing Value

- report packages track QA, founder review, send state, and briefing state
- delivery-state tracking records `paid -> routed -> processing -> awaiting_review -> report_generated -> delivered|failed`
- monitoring sync turns point-in-time findings into ongoing posture and
  remediation state
- engagement programs turn one-off work into a long-lived customer service
  history

For the detailed implemented operator flow, see `docs/billing-reconciliation-and-delivery-operations.md`.

For the shortest first-customer-safe deployment and validation checklist, see
`docs/first-customer-launch-checks.md`.

## Service Ownership

Use these files as the primary source of truth when editing:

- auth/session: `apps/web/lib/auth.ts`
- billing lifecycle: `apps/web/lib/billing.ts`
- entitlements: `apps/web/lib/entitlements.ts`
- lead + customer lifecycle: `apps/web/lib/lead-pipeline.ts`, `apps/web/lib/customer-accounts.ts`
- reporting: `apps/web/app/dashboard/reports/actions.ts`
- executive delivery: `apps/web/lib/executive-delivery.ts`
- monitoring: `apps/web/lib/continuous-monitoring.ts`
- engagement history: `apps/web/lib/engagement-programs.ts`
- async delivery + reliability: `apps/web/lib/webhook-dispatcher.ts`, `apps/web/lib/reliability.ts`

## Event Model

The app emits durable domain events for meaningful business transitions.

Use domain events when:

- an important business transition should be visible downstream
- the action must be replay-safe
- an external automation may depend on it

Do not use domain events as a replacement for audit logs.

## Admin Versus Customer Surfaces

- `/dashboard/*` is customer-facing
- `/admin/*` is internal-only

Rules:

- internal notes and operator context stay in admin
- customer-facing pages must never leak admin-only commentary or operational-only
  metadata
- allowlist + service-layer checks protect admin tooling

## How To Extend Safely

When adding a new product capability:

1. decide which app service owns the business rule
2. decide whether the state belongs in an existing model or a new model
3. add tenant scoping first
4. add audit/event behavior if the transition is important
5. keep external systems downstream of app-owned truth
6. prefer small shared scoped-access primitives over ad hoc id checks
