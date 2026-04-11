# Architecture Decisions

## ADR-001: The App Owns Product State

Decision:

- business logic and product state stay inside the Evolve Edge app

Implications:

- Stripe owns billing authority, not product workflow state
- HubSpot owns CRM visibility, not access or delivery rules
- n8n orchestrates, but does not own core business behavior
- Dify executes AI workflows, but does not persist product truth

## ADR-002: Tenant Scope First

Decision:

- org scoping is the default for product records

Implications:

- auth and service layers must enforce org boundaries
- admin tooling is a deliberate exception and must remain internal-only

## ADR-003: Service Layer Over Route Logic

Decision:

- recurring business rules should live in shared service modules, not be
  duplicated in pages, routes, or server actions

Recent examples:

- `engagement-programs.ts`
- `continuous-monitoring.ts`
- `customer-accounts.ts`
- `billing.ts`

## ADR-004: Roles Are Shared Semantics

Decision:

- role semantics now live in `apps/web/lib/roles.ts`

Why:

- owner/admin/analyst checks were starting to drift across product and operator
  surfaces
- centralizing role helpers reduces silent authorization inconsistency

## ADR-005: Operator Context Stays Internal

Decision:

- internal notes, founder review flags, and retry controls belong only in admin
  surfaces

Implications:

- customer pages should consume only customer-safe state
- admin pages may be richer, but must remain protected and auditable
