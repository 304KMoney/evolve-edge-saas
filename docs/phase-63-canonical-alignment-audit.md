# Phase 63: Canonical Alignment Audit

## Scope

This audit captures the current cross-system drift before deeper pricing, routing,
and integration refactors. The goal is to define the safest path toward one
backend-owned commercial source of truth for Evolve Edge.

## Canonical Model To Preserve

- Plan codes: `starter`, `scale`, `enterprise`
- Display names: `Starter`, `Scale`, `Enterprise`
- Public pricing:
  - Starter: `$2,500 one-time`
  - Scale: `$7,500 one-time`
  - Enterprise: custom / sales-led
- Workflow codes:
  - `audit_starter`
  - `audit_scale`
  - `audit_enterprise`
  - `briefing_only`
  - `intake_review`

The current best candidate for the source of truth is
[`apps/web/lib/canonical-domain.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/canonical-domain.ts).

## What Already Exists

- Canonical plan codes, workflow codes, Dify field keys, public pricing, and
  Hostinger CTA rules already exist in the canonical domain layer.
- The dashboard and seeded Neon-backed data are currently working.
- Commercial routing already leans on canonical plan resolution and routing snapshots.
- Hostinger site sync helpers already consume the canonical commercial catalog.

## Detected Inconsistencies

### Pricing and Plan Drift

- [`apps/web/lib/revenue-catalog.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/revenue-catalog.ts)
  still models recurring legacy plans, including `growth`, monthly/annual billing,
  and revenue plan codes such as `growth-annual`.
- [`apps/web/lib/billing.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/billing.ts)
  still seeds and resolves plans through the revenue catalog instead of the
  canonical commercial catalog.
- [`.env.example`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/.env.example)
  still exposes legacy Stripe price env vars for monthly/annual and `growth`.

### Routing and Workflow Drift

- [`apps/web/lib/workflow-routing.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/workflow-routing.ts)
  still preserves internal route distinctions such as `scale_standard`.
- The backend currently stores both canonical commercial plan semantics and
  legacy revenue-plan semantics, which makes workflow dispatch harder to reason about.

### Integration Contract Drift

- [`apps/web/lib/integration-contracts.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/integration-contracts.ts)
  duplicates Stripe metadata in both snake_case and camelCase forms.
- [`apps/web/lib/n8n.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/n8n.ts)
  still mixes canonical audit workflow semantics with older operational workflow names.
- [`apps/web/lib/dify.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/dify.ts)
  is closer to the target field naming but still carries extra route-specific
  shapes that are not yet canonicalized.
- [`apps/web/lib/hubspot.ts`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/hubspot.ts)
  has strong mapping helpers, but the mapping strategy is not yet clearly isolated
  as the single CRM translation layer.

### Schema Drift

- [`packages/db/prisma/schema.prisma`](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/packages/db/prisma/schema.prisma)
  already contains canonical enums such as `CommercialPlanCode` and
  `CanonicalWorkflowCode`.
- The schema still also carries legacy concepts such as `CanonicalPlanKey.GROWTH`
  and recurring billing interval assumptions that do not fully match the public
  one-time commercial model.

## Safest Implementation Order

1. Keep the canonical domain and runtime config layer stable and typed.
2. Migrate backend billing and routing to resolve through the canonical layer.
3. Isolate Stripe mapping into explicit plan-code and price-id mapping helpers.
4. Normalize n8n, Dify, and HubSpot contracts behind translation layers.
5. Update schema and migrations only after business logic is already consuming
   the canonical layer cleanly.
6. Finish frontend, Hostinger, docs, and test cleanup after backend ownership is stable.

## Current Stage Outcome

This phase does not change business behavior. It exists to:

- document where drift still exists
- define the canonical model clearly
- create a safer base for the next refactor stages
