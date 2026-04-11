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
- normalized workflow code
- normalized plan code
- entitlement summary
- quota state
- execution context

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

Payload:

```json
{
  "dispatchId": "wd_123",
  "status": "acknowledged",
  "externalExecutionId": "n8n_456",
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

Payload:

```json
{
  "dispatchId": "wd_123",
  "reportReference": "report_run_789",
  "reportUrl": "https://example.com/report/789",
  "externalExecutionId": "n8n_456",
  "executiveSummary": "High-level summary",
  "riskLevel": "Moderate",
  "topConcerns": ["Policy gaps", "Vendor review debt"],
  "metadata": {
    "generatedBy": "n8n"
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
4. Set `N8N_CALLBACK_SECRET`.
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
