# Phase 62: Backend Commercial Routing Layer

## Purpose

This phase introduces a backend-owned commercial routing layer for Stripe checkout completion so Evolve Edge computes, stores, and dispatches workflow decisions before n8n orchestration begins.

The app remains the source of truth for:

- commercial state
- entitlement resolution
- workflow routing decisions
- dispatch records

Stripe remains the billing authority. n8n remains an execution layer only.

## What Changed

### Commercial mapping layer

The new service in [commercial-routing.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\commercial-routing.ts) resolves Stripe billing context into normalized backend plan codes:

- `starter`
- `scale`
- `enterprise`

Supported resolution order:

1. Stripe metadata `plan_key`
2. Stripe metadata `plan_code`
3. configured Stripe price IDs
4. configured Stripe product IDs
5. internal fallback subscription plan code

If no mapping is found, checkout completion fails closed and the webhook receipt remains failed for replay/recovery.

### Canonical workflow codes

The backend now computes one of:

- `audit_starter`
- `audit_scale`
- `audit_enterprise`
- `briefing_only`
- `intake_review`

These are derived from app-owned entitlements and quota state, not from n8n branches.

### Routing snapshots

The new `RoutingSnapshot` table stores:

- org and user linkage
- Stripe source event linkage
- normalized commercial plan code
- chosen workflow code
- entitlement summary
- normalized routing hints
- routing reasons
- current routing lifecycle status

This creates a durable answer to:

- why did this org get this workflow?
- what commercial state was evaluated?
- what fallback was used?

### Workflow dispatch tracking

The new `WorkflowDispatch` table stores outbound `audit.requested` dispatch state for n8n, including:

- retries
- last error
- response status
- correlation ID
- response payload
- callback-linked execution IDs

### Stripe webhook behavior

`checkout.session.completed` now:

1. verifies the Stripe signature
2. claims the Stripe billing event idempotently
3. resolves or creates org/user context
4. syncs Stripe subscription state into the app
5. resolves normalized commercial plan code
6. computes entitlements and workflow code
7. persists a routing snapshot
8. queues a normalized `audit.requested` workflow dispatch

### n8n contract

The new `audit.requested` payload contains:

- normalized routing snapshot ID
- compact request aliases for the n8n workflow handoff such as `request_id`, `app_customer_id`, `app_org_id`, `customer_email`, `company_name`, and purchased-tier fields
- normalized workflow code
- normalized plan code
- persisted normalized routing hints such as `report_template` and `processing_depth`
- entitlement summary
- quota state
- execution context
- callback URLs for status, report-ready, failure, and report-writeback handoff back into the app

It intentionally does **not** include raw Stripe price IDs or product IDs.

## Normalized n8n payload schema

```json
{
  "source": "evolve-edge",
  "provider": "n8n",
  "version": "2026-04-10",
  "event_type": "audit.requested",
  "routing_snapshot_id": "rs_123",
  "dispatch_id": "wd_123",
  "correlation_id": "audit_123",
  "execution_context": {
    "organization_id": "org_123",
    "user_id": "usr_123",
    "source_system": "stripe",
    "source_event_type": "checkout.session.completed",
    "source_event_id": "evt_123",
    "source_record_type": "checkoutSession",
    "source_record_id": "cs_test_123",
    "environment": "preview"
  },
  "callbacks": {
    "status_url": "https://app.example.com/api/internal/workflows/status",
    "report_ready_url": "https://app.example.com/api/internal/workflows/report-ready",
    "failure_url": "https://app.example.com/api/internal/workflows/failed",
    "report_writeback_url": "https://app.example.com/api/internal/workflows/report-writeback",
    "auth_scheme": "bearer"
  },
  "callback_urls": {
    "status_update_url": "https://app.example.com/api/internal/workflows/status",
    "report_ready_url": "https://app.example.com/api/internal/workflows/report-ready",
    "failure_url": "https://app.example.com/api/internal/workflows/failed"
  },
  "request_id": "wd_123",
  "app_customer_id": "usr_123",
  "app_org_id": "org_123",
  "customer_email": "ops@example.com",
  "customer_name": "Alex Example",
  "company_name": "Example Health",
  "purchased_tier": "scale",
  "purchased_plan_code": "scale",
  "stripe_session_id": "cs_test_123",
  "amount_paid": 500000,
  "currency": "usd",
  "top_concerns": ["Vendor review debt"],
  "uses_ai_tools": true,
  "company_size": "11-50",
  "industry": "healthtech",
  "additional_notes": "Uses external AI tooling in support workflows.",
  "website": null,
  "routing": {
    "plan_code": "scale",
    "workflow_code": "audit_scale",
    "status": "dispatch_queued",
    "entitlement_summary": {},
    "quota_state": {},
    "feature_flags": {},
    "reason": {}
  }
}
```

## Callback schemas

### Workflow status callback

`POST /api/internal/workflows/status`

Authorization:

- `Authorization: Bearer <N8N_CALLBACK_SECRET>`
- compatible alias: `Authorization: Bearer <N8N_CALLBACK_SHARED_SECRET>`

Payload:

```json
{
  "dispatchId": "wd_123",
  "request_id": "wd_123",
  "status": "acknowledged",
  "externalExecutionId": "n8n_456",
  "customer_email": "ops@example.com",
  "purchased_tier": "scale",
  "message": "Workflow accepted",
  "metadata": {
    "step": "accepted"
  }
}
```

Allowed `status` values:

- `acknowledged`
- `running`
- `succeeded`
- `failed`

### Report-ready callback

`POST /api/internal/workflows/report-ready`

Authorization:

- `Authorization: Bearer <N8N_CALLBACK_SECRET>`
- compatible alias: `Authorization: Bearer <N8N_CALLBACK_SHARED_SECRET>`

Payload:

```json
{
  "dispatchId": "wd_123",
  "request_id": "wd_123",
  "reportReference": "report_run_789",
  "report_id": "report_run_789",
  "reportUrl": "https://example.com/report/789",
  "report_url": "https://example.com/report/789",
  "externalExecutionId": "n8n_456",
  "executiveSummary": "High-level summary",
  "riskLevel": "Moderate",
  "topConcerns": ["Policy gaps", "Vendor review debt"],
  "metadata": {
    "generatedBy": "n8n"
  }
}
```

### Failure callback

`POST /api/internal/workflows/failed`

Authorization:

- `Authorization: Bearer <N8N_CALLBACK_SECRET>`
- compatible alias: `Authorization: Bearer <N8N_CALLBACK_SHARED_SECRET>`

Payload:

```json
{
  "request_id": "wd_123",
  "customer_email": "ops@example.com",
  "purchased_tier": "scale",
  "failure_reason": "Dify processing timed out",
  "metadata": {
    "step": "analysis"
  }
}
```

## Stripe commercial setup

Required price env vars:

- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

Optional product env vars:

- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

Important compatibility rule:

- internal `growth` currently maps to the `scale` commercial route for workflow selection

This keeps existing paid flows working while this routing layer exposes only the requested commercial plan set.

## n8n setup

Add an `auditRequested` destination to `N8N_WORKFLOW_DESTINATIONS`.

Example:

```json
[
  {
    "name": "auditRequested",
    "url": "https://n8n.example.com/webhook/audit-requested",
    "secret": "replace-with-shared-secret",
    "events": ["audit.requested"]
  }
]
```

When n8n receives `audit.requested`, map nodes as follows:

1. App to n8n inbound handoff:
   `N8N_WORKFLOW_DESTINATIONS[auditRequested].url`
2. n8n status callback node:
   `callbacks.status_url` or `callback_urls.status_update_url`
3. n8n report-ready callback node:
   `callbacks.report_ready_url` or `callback_urls.report_ready_url`
4. n8n failure callback node:
   `callbacks.failure_url` or `callback_urls.failure_url`
5. n8n report writeback node:
   `callbacks.report_writeback_url`

## Deferred by design

These are intentionally not solved in this phase:

- HubSpot deal sync / deal ownership
- first-class add-on packaging
- customer-facing routing diagnostics
- moving commercial policy into n8n
- letting Dify own routing or product-state writes

## Rollout notes

1. Apply the Prisma migration.
2. Set the new Stripe product/price env vars.
3. Add `auditRequested` to `N8N_WORKFLOW_DESTINATIONS`.
4. Set `N8N_CALLBACK_SECRET` or `N8N_CALLBACK_SHARED_SECRET`.
5. Verify checkout completion creates:
   - Stripe subscription sync
   - `RoutingSnapshot`
   - `WorkflowDispatch`
6. Trigger `/api/internal/workflows/dispatch` to send queued work to n8n.
7. Test both callback endpoints from n8n or a secure local caller.

## Rollback notes

1. Revert the app code.
2. Roll back migration `20260411080000_backend_commercial_routing_layer`.
3. Remove the new env vars if no longer needed.
