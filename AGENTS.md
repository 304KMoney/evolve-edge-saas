# Evolve Edge Repo Instructions

This repository builds Evolve Edge as an app-owned control plane for AI security, compliance, audit delivery, and customer operations.

These instructions are repo-local and should be followed for all future work in this workspace.

## Architecture Boundaries

Treat these boundaries as non-negotiable unless a user explicitly asks for an architecture change and the change is implemented safely end to end.

- The Next.js app is the canonical system of record for product logic and customer-visible state.
- Neon/Postgres is the canonical persistence layer.
- Stripe is billing authority and payment-event source only.
- n8n is orchestration and async execution only.
- Dify is AI execution only.
- HubSpot is CRM projection only.
- Hostinger is brochure and top-of-funnel presentation only.

This means:

- Pricing, plans, entitlements, workflow routing, audit lifecycle state, delivery state, report metadata, and customer-visible status must be owned by the app and stored in Neon.
- n8n must never become the pricing engine, entitlement engine, or routing policy engine.
- Dify outputs must be validated and normalized by the backend before they affect platform state.
- HubSpot must not become the source of truth for billing, entitlements, workflow routing, or audit status.
- Hostinger must not own checkout logic, dashboard logic, intake logic, or canonical pricing rules.

## Core Commercial Rules

- Use the canonical public commercial model unless the code already has a safer compatibility layer that maps to it:
  - `starter`
  - `scale`
  - `enterprise`
- Canonical workflow codes:
  - `audit_starter`
  - `audit_scale`
  - `audit_enterprise`
  - `briefing_only`
  - `intake_review`
- Stripe identifiers must map to internal plans through an explicit backend mapping layer.
- No raw Stripe product-name or price-name inference in downstream systems.

## Implementation Priorities

When making changes:

1. Preserve working flows unless replacement is clearly justified and implemented safely.
2. Prefer additive, production-safe refactors over broad rewrites.
3. Centralize business logic in backend services and shared domain modules.
4. Keep integration contracts typed, normalized, and documented.
5. Preserve idempotency, auditability, and replay safety.
6. Keep tenant scoping explicit.

## High-Risk Areas

Touch these carefully and read surrounding code first:

- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/dify.ts`
- `apps/web/lib/hubspot.ts`
- `packages/db/prisma/schema.prisma`

## Engineering Rules

- Use strong typing.
- Prefer backend validation over trust in third-party payloads.
- Fail closed when commercial mappings or required identifiers are missing.
- Keep n8n payloads normalized and execution-oriented.
- Keep Dify inputs bounded and Dify outputs normalized through a dedicated backend-owned contract.
- Keep HubSpot sync scoped to projection/update behavior only.
- Avoid scattering state transitions across many layers when a service module can own them centrally.

## Schema And Migration Discipline

- Neon is the system of record, so schema changes must be migration-safe.
- Do not rename or delete production-facing fields casually; prefer additive migrations with compatibility paths.
- If you add a lifecycle or integration model, make it auditable and operator-readable.

## Tests And Verification

For critical flows, add or update tests around:

- Stripe mapping and webhook behavior
- entitlement and routing computation
- n8n payload normalization
- Dify validation/normalization
- HubSpot bounded sync behavior
- reconciliation and delivery-state progression

At minimum, run targeted tests for the slice you changed and document what you ran.

## Documentation Expectations

For each meaningful architectural or integration change:

- update or add docs in `docs/`
- document source-of-truth boundaries
- document env/config expectations
- document operator setup and troubleshooting notes
- document known deferred items instead of hiding them

## Delivery Bias

Do not get stuck in scanning loops.

After initial inspection:

- summarize the current state briefly
- identify the smallest safe implementation sequence
- start implementation

If the requested work is too large for one pass, complete the highest-priority safe slice fully and clearly mark what remains.
