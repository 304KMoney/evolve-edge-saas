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

Stripe webhook lifecycle safety notes:

- the app verifies the raw webhook payload against `STRIPE_WEBHOOK_SECRET` before it trusts the parsed event body
- a Stripe event is claimed into a canonical `BillingEvent` receipt before processing continues
- duplicate deliveries do not rewrite already-claimed receipts unless the event is actively reclaimed for processing
- terminal `BillingEvent` transitions only apply from `PROCESSING`, which prevents a stale retry path from overwriting a newer terminal state
- `processingStartedAt` is an in-flight marker only and is cleared when the receipt reaches `PROCESSED` or `FAILED`

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
- typed adapter boundary for Dify request/response normalization
- idempotent request hashing
- blocking workflow call
- timeout handling
- stale job recovery
- normalized validated output persisted into `AnalysisJob.outputPayload`

Primary service:

- [dify.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/dify.ts)

Typed adapter:

- [dify-adapter.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/dify-adapter.ts)

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

### HubSpot projection boundary

HubSpot sync remains bounded to projection-only responsibilities:

- the backend decides whether an event is eligible for CRM sync
- only an allowlisted event set is accepted by `syncDomainEventToHubSpot()`
- HubSpot writes may update local external reference fields such as
  `hubspotCompanyId` or `hubspotContactId`
- HubSpot does not define billing state, entitlements, routing, delivery state,
  or report truth

If a new event needs CRM visibility, it must be explicitly added to the
HubSpot allowlist rather than relying on ad hoc direct calls.

This makes downstream routing and debugging easier without changing the app-owned event source model.

### Dify output normalization

The backend now owns a dedicated Dify adapter layer. `dify.ts` is responsible
for job orchestration and retries, while `dify-adapter.ts` is responsible for
contract typing, response validation, and normalization.

Dify result validation accepts and normalizes these aliases:

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

Required for current first-customer setup:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

Compatibility-only legacy envs may still exist in local or older environments:

- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_GROWTH_ANNUAL`

Those should not be used as the canonical first-customer configuration path.

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

### n8n-bound domain-event governance

For the generic n8n event envelope path, the app forwards allowlisted
domain-event payloads as published. That contract is intentionally broader than
the dedicated `audit.requested` payload, so changes to those event payloads
should be treated carefully.

Rules:

- keep n8n-bound event payloads operationally minimal
- include identifiers, lifecycle context, and workflow-safe summaries only
- do not add secrets, raw evidence blobs, full report bodies, or broad customer
  state dumps
- avoid adding fields just because n8n "might use them later"
- if a workflow needs app-owned routing or commercial policy, prefer sending the
  normalized backend decision rather than raw billing/provider details

Highest-sensitivity generic n8n-bound event families today:

- `lead.captured`
- `customer_account.stage_changed`
- `payment.failed`

## First-customer setup order

Use this order when preparing a real customer environment:

1. Set auth and app env:
   - `AUTH_SECRET`
   - `AUTH_ACCESS_EMAIL`
   - `AUTH_ACCESS_PASSWORD`
   - `NEXT_PUBLIC_APP_URL`
2. Set Neon and billing env:
   - `DATABASE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - canonical Stripe price and product env vars
3. Set orchestration env:
   - `OUTBOUND_DISPATCH_SECRET`
   - `N8N_CALLBACK_SECRET`
   - `N8N_WORKFLOW_DESTINATIONS`
4. Set secure report access env:
   - `REPORT_DOWNLOAD_SIGNING_SECRET`
   - `REPORT_DOWNLOAD_REQUIRE_AUTH=true`
5. Set optional but recommended external integrations:
   - `DIFY_API_BASE_URL`
   - `DIFY_API_KEY`
   - `DIFY_WORKFLOW_ID`
   - `HUBSPOT_ACCESS_TOKEN`
6. Run:
   - `pnpm preflight:first-customer`
   - focused tests
   - one manual end-to-end paid request verification

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
  "commercial_context": {
    "company_name": "Example Org",
    "contact_name": null,
    "contact_email": null,
    "industry": null,
    "frameworks": ["soc2"],
    "plan_code": "scale",
    "workflow_code": "audit_scale",
    "report_template": "scale_operating_report",
    "processing_depth": "scale",
    "top_concerns": []
  },
  "routing_context": {
    "routing_decision_id": "route_123",
    "workflow_family": "assessment_analysis",
    "route_key": "analysis.scale_enhanced",
    "processing_tier": "scale",
    "report_template": "scale_operating_report",
    "workflow_code": "audit_scale",
    "processing_depth": "scale"
  },
  "workflowRouting": {
    "decisionId": "route_123",
    "workflowFamily": "assessment_analysis",
    "routeKey": "analysis.scale_standard",
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

Notes:

- `commercial_context` and `routing_context` are the current canonical Dify
  request fields
- `workflowRouting` is still sent as a compatibility payload for existing prompt
  or workflow expectations
- the overlap is intentional today and should be treated as a compatibility
  boundary, not as two competing sources of truth
- if fallback values ever differ between `routing_context` and `workflowRouting`,
  treat `routing_context` as authoritative and `workflowRouting` as legacy
  compatibility context only

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

Important:

- raw Dify output is not trusted directly
- the app validates required fields before updating assessment/report state
- Dify remains an execution dependency, not a product-state authority

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
