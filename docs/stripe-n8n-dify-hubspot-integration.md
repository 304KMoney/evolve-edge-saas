# Stripe, n8n, Dify, and HubSpot Integration

This document is the production wiring reference for Evolve Edge’s external integration layer.

## Architectural truth

The supported production flow is:

1. Stripe emits an event.
2. Evolve Edge verifies and processes the webhook.
3. Evolve Edge updates internal billing and product state.
4. Evolve Edge emits durable domain events.
5. Evolve Edge dispatches selected domain events to n8n and HubSpot.
6. Evolve Edge calls Dify for AI analysis through app-owned jobs.
7. Evolve Edge stores normalized analysis output and generates reports.
8. Evolve Edge continues downstream delivery, logging, and CRM visibility updates.

Important:

- Stripe is billing authority.
- Evolve Edge is the only owner of product state.
- n8n is orchestration only.
- Dify is execution only.
- HubSpot is CRM visibility only.

This means the app does **not** delegate report persistence, subscription truth, or billing access control to n8n or Dify.

For the plan-aware routing snapshot layer that now feeds execution hints into n8n and Dify, see:

- [phase-61-plan-aware-routing-snapshots.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-61-plan-aware-routing-snapshots.md)

## What currently exists

### Stripe

Implemented:

- checkout session creation
- customer portal session creation
- webhook verification
- idempotent `BillingEvent` receipt claiming
- internal subscription synchronization
- append-only `BillingEventLog`
- replay tooling via `/admin/replays`

Primary handler:

- [route.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/api/stripe/webhook/route.ts)

Core billing service:

- [billing.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/billing.ts)

### n8n

Implemented:

- app-owned outbound event dispatch
- named workflow destinations
- signed n8n envelopes
- retry and replay via `WebhookDelivery`

Primary dispatcher:

- [webhook-dispatcher.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/webhook-dispatcher.ts)

Workflow routing:

- [n8n.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/n8n.ts)

### Dify

Implemented:

- queued analysis jobs
- idempotent request hashing
- blocking workflow call
- timeout handling
- stale job recovery
- normalized validated output persisted into `AnalysisJob.outputPayload`

Primary service:

- [dify.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/dify.ts)

### HubSpot

Implemented:

- contact upsert
- company upsert
- app-owned event-driven CRM sync
- retry/replay through outbound delivery records

Primary service:

- [hubspot.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/hubspot.ts)

## Integration gaps found during inspection

These were the main risk areas before this hardening pass:

1. Stripe metadata strategy existed but was not centralized.
2. n8n payloads did not carry a full integration context like environment or event occurrence timestamp.
3. Dify response handling assumed one exact camelCase shape.
4. HubSpot sync could overwrite existing CRM fields with empty strings.
5. The intended cross-system flow could be misunderstood as n8n owning core state transitions, which is not supported safely in this architecture.

## What was implemented in this pass

### Centralized integration contracts

Added:

- [integration-contracts.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/integration-contracts.ts)

This centralizes:

- Stripe metadata building
- Stripe metadata parsing
- empty-property stripping for CRM-safe upserts
- stable Dify output normalization helpers

### Stripe metadata strategy

Checkout sessions and subscriptions now carry explicit metadata keys:

- `org_id`
- `organizationId`
- `customer_email`
- `customerEmail`
- `plan_key`
- `planKey`
- `plan_code`
- `planCode`
- `environment`
- `source`
- `workflow_type`
- `workflowType`

Backward-compatible aliases are preserved to avoid breaking current flows.

### n8n envelope hardening

The signed n8n envelope now includes:

- `environment`
- `correlationId`
- `event.occurredAt`
- optional `routing`

This makes downstream routing and debugging easier without changing the app-owned event source model.

### Dify output normalization

Dify result validation now accepts and normalizes these aliases:

- `executiveSummary` or `executive_summary`
- `riskLevel` or `risk_level`
- `recommendations` or `roadmap`
- `topConcerns` or `top_concerns`
- `finalReport` or `final_report`

Normalized output persists in a stable shape that includes:

- `finalReport`
- `executiveSummary`
- `postureScore`
- `riskLevel`
- `topConcerns`
- `findings`
- `roadmap`
- `recommendations`

### HubSpot sync safety

HubSpot upserts now strip empty string fields before PATCH or POST so existing good CRM data is not blanked out accidentally.

The `report.generated` sync path also now carries:

- `evolve_edge_report_generated`
- `evolve_edge_risk_level`
- `evolve_edge_top_concerns`

## Required environment variables

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

### n8n

- `OUTBOUND_DISPATCH_SECRET`
- `N8N_WORKFLOW_DESTINATIONS`
- optional legacy fallback:
  - `N8N_WEBHOOK_URL`
  - `N8N_WEBHOOK_SECRET`
  - `N8N_WEBHOOK_TIMEOUT_MS`

### Dify

- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `DIFY_WORKFLOW_VERSION`
- `DIFY_TIMEOUT_MS`
- `DIFY_DISPATCH_SECRET`
- optional:
  - `DIFY_ANALYSIS_STALE_MINUTES`

### HubSpot

- `HUBSPOT_ACCESS_TOKEN`
- `HUBSPOT_API_BASE_URL`
- `HUBSPOT_TIMEOUT_MS`

## Required Stripe metadata

Recommended required metadata on checkout and subscription objects:

- `org_id`
- `customer_email`
- `plan_key`
- `plan_code`
- `environment`
- `source`
- `workflow_type`

Current recommended values:

- `source=app.checkout`
- `workflow_type=subscription_checkout`

## Required n8n workflows and credentials

Credentials:

- inbound webhook authentication using the shared secret configured in `N8N_WORKFLOW_DESTINATIONS`
- ability for n8n to call app internal routes if used in your deployment design

Expected workflow names:

- `leadPipeline`
- `customerOnboarding`
- `onboardingVisibility`
- `customerSuccess`
- `reportReady`
- `renewalAlert`
- `expansionSignal`
- `billingRecovery`

The app dispatches to these by workflow name, not by hidden custom routing logic.

## Dify payload contract

Input contract:

```json
{
  "contractVersion": "assessment-analysis.v1",
  "workflowVersion": "v1",
  "assessment": {
    "id": "asm_123",
    "organizationId": "org_123",
    "name": "Quarterly Security Review",
    "submittedAt": "2026-04-10T12:00:00.000Z",
    "intakeVersion": 1
  },
  "sections": [
    {
      "key": "governance",
      "title": "Governance",
      "status": "COMPLETED",
      "notes": "..."
    }
  ],
  "reportUrl": "https://app.example.com/dashboard/reports",
  "workflowRouting": {
    "decisionId": "route_123",
    "workflowFamily": "assessment_analysis",
    "routeKey": "analysis.growth_standard",
    "processingTier": "standard",
    "reportDepth": "standard",
    "analysisDepth": "standard",
    "monitoringMode": "standard",
    "controlScoringMode": "disabled",
    "featureFlags": {
      "monitoringEnabled": true,
      "controlScoringEnabled": false,
      "customFrameworksEnabled": false,
      "enterpriseOverrideActive": false,
      "demoSafeguardsActive": false
    }
  }
}
```

Accepted output aliases:

- `finalReport` or `final_report`
- `executiveSummary` or `executive_summary`
- `riskLevel` or `risk_level`
- `topConcerns` or `top_concerns`
- `recommendations` or `roadmap`

Normalized stored output:

```json
{
  "result": {
    "finalReport": "string|null",
    "executiveSummary": "string",
    "postureScore": 72,
    "riskLevel": "Moderate",
    "topConcerns": ["..."],
    "findings": [],
    "roadmap": [],
    "recommendations": []
  }
}
```

## Required HubSpot properties

Current code expects or writes these custom properties:

### Company

- `evolve_edge_org_id`
- `evolve_edge_org_slug`
- `evolve_edge_plan_code`
- `evolve_edge_subscription_status`
- `evolve_edge_onboarding_status`
- `evolve_edge_current_posture_score`
- `evolve_edge_lifecycle_stage`
- `evolve_edge_last_event_type`
- `evolve_edge_last_event_at`
- `evolve_edge_last_product_milestone`
- `evolve_edge_onboarding_started_at`
- `evolve_edge_onboarding_completed_at`
- `evolve_edge_first_assessment_created_at`
- `evolve_edge_report_delivered_at`
- `evolve_edge_report_generated`
- `evolve_edge_risk_level`
- `evolve_edge_top_concerns`

### Contact

- `email`
- `firstname`
- `lastname`
- `jobtitle`
- `phone`
- `company`
- `hs_lead_status`
- `evolve_edge_user_id`
- `evolve_edge_last_event_type`
- `evolve_edge_last_event_at`
- `evolve_edge_lifecycle_stage`
- `evolve_edge_lead_source`
- `evolve_edge_lead_intent`
- `evolve_edge_requested_plan_code`
- `evolve_edge_source_path`
- `evolve_edge_company_name`
- `evolve_edge_team_size`
- `evolve_edge_utm_source`
- `evolve_edge_utm_medium`
- `evolve_edge_utm_campaign`

Note:

- Deal sync is not yet first-class in code because there is no durable app-owned deal model or authoritative HubSpot deal binding for product state. That is safer than pretending deal writes are reliable.

## End-to-end test strategy

1. Configure Stripe test mode.
2. Configure `N8N_WORKFLOW_DESTINATIONS` to test webhooks.
3. Configure Dify test credentials and workflow.
4. Configure a HubSpot sandbox token and matching custom properties.
5. Create a checkout session in-app.
6. Complete checkout in Stripe test mode.
7. Confirm `/api/stripe/webhook` processes and creates or updates the internal subscription.
8. Run `/api/internal/domain-events/dispatch` and confirm n8n and HubSpot deliveries.
9. Submit an assessment and run `/api/internal/analysis/dispatch`.
10. Confirm Dify output normalizes and report generation succeeds.
11. Replay a failed Stripe or outbound event from `/admin/replays` and confirm no duplicate side effects occur.

## Maintenance notes

When extending this integration layer:

1. keep product state writes inside the app
2. add new contracts to `integration-contracts.ts`
3. keep webhook and replay behavior idempotent
4. do not let n8n or HubSpot become hidden workflow owners
