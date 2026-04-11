# Phase 61: Plan-Aware Routing Snapshots

This phase adds an app-owned routing snapshot layer so Evolve Edge can explain why a workflow path was selected without moving pricing or entitlement logic into n8n, Dify, or HubSpot.

## Architectural intent

Commercial state remains app-owned:

- Stripe is the billing event authority
- the app resolves active subscription and entitlements
- the app computes workflow routing decisions
- n8n receives normalized routing hints only
- Dify receives a narrowed execution profile only

This phase does not introduce a HubSpot deal model and does not move workflow policy into n8n.

## What changed

### Durable routing decision model

New table:

- `WorkflowRoutingDecision`

Purpose:

- persist one deterministic workflow-routing snapshot before execution starts
- record which plan, entitlements, and quota posture were used
- record which route was selected
- record machine-readable reason codes and normalized execution hints

Important fields:

- `workflowFamily`
- `sourceRecordType`
- `sourceRecordId`
- `routeKey`
- `processingTier`
- `disposition`
- `decisionVersion`
- `idempotencyKey`
- `canonicalPlanKey`
- `planCode`
- `subscriptionStatus`
- `billingAccessState`
- `workspaceMode`
- `reasonCodes`
- `matchedRules`
- `entitlementSummary`
- `quotaState`
- `workflowHints`

### Workflow families implemented

- `ASSESSMENT_ANALYSIS`
- `REPORT_PIPELINE`

### Routing engine

Primary service:

- [workflow-routing.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/workflow-routing.ts)

The routing engine evaluates:

- canonical plan tier
- resolved entitlement state
- relevant usage metering signals
- current workspace mode
- enterprise override presence
- environment label

The routing engine intentionally does **not** read raw Stripe price IDs directly.

## Where routing is computed

### Assessment analysis start

Entry point:

- [actions.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/dashboard/assessments/actions.ts)

Before analysis begins, the app now:

1. computes a routing decision for `assessment_analysis`
2. persists it with a stable idempotency key
3. stores the routing decision reference on the queued analysis job payload

This keeps retries on the same logical execution tied to the same routing snapshot.

### Report pipeline start

Entry point:

- [actions.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/dashboard/reports/actions.ts)

Before report pipeline fan-out begins, the app now:

1. computes a routing decision for `report_pipeline`
2. persists it with a versioned idempotency key
3. embeds the routing reference and normalized hints in relevant domain-event payloads
4. uses the routing hints to decide whether monitoring sync and control scoring should run

## Normalized routing hints

Normalized hints are persisted on the routing decision and are safe to send downstream.

Current hint shape:

- `workflowFamily`
- `routeKey`
- `processingTier`
- `routeDisposition`
- `reportDepth`
- `analysisDepth`
- `monitoringMode`
- `controlScoringMode`
- `entitlementSummary`
- `quotaState`
- `featureFlags`

These are designed for orchestration, not billing truth.

## n8n contract

The n8n envelope now includes an optional top-level `routing` object when the domain event payload carries a workflow routing reference.

Current `routing` shape:

```json
{
  "decisionId": "route_123",
  "workflowFamily": "report_pipeline",
  "routeKey": "report.scale_enhanced",
  "processingTier": "enhanced",
  "routeDisposition": "upgraded",
  "entitlementSummary": {
    "workspaceAccess": true,
    "reportsGenerate": true,
    "monitoringManage": true,
    "customFrameworks": true,
    "prioritySupport": true,
    "apiAccess": false
  },
  "quotaState": {
    "reports_generated": {
      "key": "reportsGenerated",
      "used": 12,
      "limit": 120,
      "remaining": 108,
      "status": "ok",
      "enforcement": "soft"
    }
  },
  "featureFlags": {
    "monitoringEnabled": true,
    "controlScoringEnabled": true,
    "customFrameworksEnabled": true,
    "enterpriseOverrideActive": false,
    "demoSafeguardsActive": false
  },
  "reasonCodes": ["plan.scale"]
}
```

Rules:

- n8n must consume these hints instead of inferring policy from raw Stripe price IDs
- n8n must not invent its own commercial logic
- payload consumers should treat the event payload as backward-compatible, but move new branching to `routing`

## Dify contract

Assessment analysis payloads now optionally include:

- `workflowRouting.decisionId`
- `workflowRouting.workflowFamily`
- `workflowRouting.routeKey`
- `workflowRouting.processingTier`
- `workflowRouting.reportDepth`
- `workflowRouting.analysisDepth`
- `workflowRouting.monitoringMode`
- `workflowRouting.controlScoringMode`
- `workflowRouting.featureFlags`

This gives Dify only the execution-profile context it needs, not billing internals.

## Starter and Scale mapping

Live commercial mappings were added for:

- `starter-monthly`
- `starter-annual`
- `scale-monthly`
- `scale-annual`

Required env vars:

- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`

These map into the canonical app-owned plans:

- `STARTER`
- `SCALE`

## Add-ons

Add-ons are intentionally deferred in this phase.

Why:

- there is no first-class live operational add-on model yet
- the current system has expansion opportunity concepts, but not a productized add-on entitlement package that is safe to treat as billing truth

Current behavior:

- the routing service exposes an extension point for add-on keys
- `addOnsLive` is explicitly `false`

## Admin/support visibility

Internal support visibility is available in:

- [page.tsx](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/admin/accounts/%5BorganizationId%5D/page.tsx)

Support can now inspect:

- recent routing decisions
- route key
- disposition
- processing tier
- reason codes
- normalized hints

## Rollout notes

1. run the migration
2. regenerate Prisma client
3. set Starter and Scale Stripe price env vars before enabling those plans in live checkout
4. deploy the app
5. validate assessment submission, report generation, and n8n dispatch in a safe environment

## Rollback notes

1. revert the application changes
2. roll back the `WorkflowRoutingDecision` migration
3. regenerate Prisma client
4. remove Starter and Scale Stripe env vars if not being used

## Intentionally deferred

- HubSpot deal sync
- first-class add-on packaging
- automatic routing decisions for every possible internal workflow family
- customer-facing routing diagnostics
- hard blocking on soft metering signals that were previously visibility-only
