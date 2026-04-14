# Evolve Edge n8n Node Contract Sheet

This is the copy-paste contract sheet for the current Evolve Edge app-to-n8n workflow.

Use this document to wire these n8n nodes:

1. `Webhook - App Intake`
2. `HTTP Request - Status Callback`
3. `HTTP Request - Report Ready Callback`
4. `HTTP Request - Failure Callback`

This contract matches the current app implementation. The app remains the system of record. n8n is orchestration only.

## Required app env

The app must have:

- `N8N_WEBHOOK_URL` or `N8N_WORKFLOW_DESTINATIONS`
- `N8N_CALLBACK_SHARED_SECRET`

Compatibility note:

- the app also accepts `N8N_CALLBACK_SECRET`
- callback auth is bearer-based

## Route map

App routes currently used by n8n:

- status callback: `/api/internal/workflows/status`
- report-ready callback: `/api/internal/workflows/report-ready`
- failure callback: `/api/internal/workflows/failed`
- report writeback callback: `/api/internal/workflows/report-writeback`

The outbound handoff includes both callback shapes:

```json
{
  "callbacks": {
    "status_url": "https://your-app.com/api/internal/workflows/status",
    "report_ready_url": "https://your-app.com/api/internal/workflows/report-ready",
    "failure_url": "https://your-app.com/api/internal/workflows/failed",
    "report_writeback_url": "https://your-app.com/api/internal/workflows/report-writeback",
    "auth_scheme": "bearer"
  },
  "callback_urls": {
    "status_update_url": "https://your-app.com/api/internal/workflows/status",
    "report_ready_url": "https://your-app.com/api/internal/workflows/report-ready",
    "failure_url": "https://your-app.com/api/internal/workflows/failed"
  }
}
```

Use either:

- `callbacks.status_url`
- `callback_urls.status_update_url`

and the equivalent `report_ready_url` and `failure_url` fields.

## Node 1: Webhook - App Intake

Recommended n8n node type:

- `Webhook`

Expected inbound source:

- Evolve Edge app dispatches `audit.requested`

Recommended path:

- whatever path your `auditRequested` destination points to in `N8N_WORKFLOW_DESTINATIONS`
- if you are using the legacy single-webhook fallback, this is the value of `N8N_WEBHOOK_URL`

Recommended webhook authentication:

- validate the shared secret/signature if you are using an n8n-side check
- app sends signed headers when `secret` is configured on the destination

Headers the app sends:

```text
Content-Type: application/json
x-evolve-edge-correlation-id: <correlation id>
x-evolve-edge-routing-snapshot-id: <routing snapshot id>
x-evolve-edge-dispatch-id: <dispatch id>
x-evolve-edge-idempotency-key: <idempotency key>
x-evolve-edge-provider: n8n
x-evolve-edge-timestamp: <unix timestamp>
x-evolve-edge-signature: <hmac signature>
```

Primary fields available in the inbound JSON:

```json
{
  "source": "evolve-edge",
  "provider": "n8n",
  "version": "2026-04-10",
  "event_type": "audit.requested",
  "routing_snapshot_id": "rs_123",
  "dispatch_id": "wd_123",
  "correlation_id": "audit_123",
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
  "execution_context": {
    "organization_id": "org_123",
    "user_id": "usr_123",
    "source_system": "stripe",
    "source_event_type": "checkout.session.completed",
    "source_event_id": "evt_123",
    "source_record_type": "checkoutSession",
    "source_record_id": "cs_test_123",
    "environment": "production"
  },
  "callbacks": {
    "status_url": "https://your-app.com/api/internal/workflows/status",
    "report_ready_url": "https://your-app.com/api/internal/workflows/report-ready",
    "failure_url": "https://your-app.com/api/internal/workflows/failed",
    "report_writeback_url": "https://your-app.com/api/internal/workflows/report-writeback",
    "auth_scheme": "bearer"
  }
}
```

Recommended fields to carry forward inside n8n:

- `request_id`
- `app_customer_id`
- `app_org_id`
- `customer_email`
- `company_name`
- `purchased_tier`
- `purchased_plan_code`
- `top_concerns`
- `callbacks.status_url`
- `callbacks.report_ready_url`
- `callbacks.failure_url`

## Node 2: HTTP Request - Status Callback

Recommended n8n node type:

- `HTTP Request`

Method:

- `POST`

URL:

```text
{{$json.callbacks.status_url || $json.callback_urls.status_update_url}}
```

Headers:

```text
Content-Type: application/json
Authorization: Bearer {{$env.N8N_CALLBACK_SHARED_SECRET}}
```

Compact body to send:

```json
{
  "request_id": "{{$json.request_id}}",
  "app_customer_id": "{{$json.app_customer_id}}",
  "app_org_id": "{{$json.app_org_id}}",
  "status": "running",
  "customer_email": "{{$json.customer_email}}",
  "company_name": "{{$json.company_name}}",
  "purchased_tier": "{{$json.purchased_tier}}",
  "hubspot_contact_id": "{{$json.hubspot_contact_id || ''}}",
  "hubspot_deal_id": "{{$json.hubspot_deal_id || ''}}",
  "report_id": "{{$json.report_id || ''}}",
  "report_url": "{{$json.report_url || ''}}",
  "failure_reason": "",
  "timestamp": "{{$now}}"
}
```

Allowed `status` values:

- `acknowledged`
- `running`
- `succeeded`
- `failed`

Expected app success response:

```json
{
  "ok": true,
  "dispatchId": "wd_123",
  "status": "ACKNOWLEDGED"
}
```

Notes:

- The app also accepts `dispatchId` if you prefer the older field name.
- The app logs `request_id`, `customer_email`, `purchased_tier`, and `status`.

## Node 3: HTTP Request - Report Ready Callback

Recommended n8n node type:

- `HTTP Request`

Method:

- `POST`

URL:

```text
{{$json.callbacks.report_ready_url || $json.callback_urls.report_ready_url}}
```

Headers:

```text
Content-Type: application/json
Authorization: Bearer {{$env.N8N_CALLBACK_SHARED_SECRET}}
```

Compact body to send:

```json
{
  "request_id": "{{$json.request_id}}",
  "app_customer_id": "{{$json.app_customer_id}}",
  "app_org_id": "{{$json.app_org_id}}",
  "status": "succeeded",
  "customer_email": "{{$json.customer_email}}",
  "company_name": "{{$json.company_name}}",
  "purchased_tier": "{{$json.purchased_tier}}",
  "hubspot_contact_id": "{{$json.hubspot_contact_id || ''}}",
  "hubspot_deal_id": "{{$json.hubspot_deal_id || ''}}",
  "report_id": "{{$json.report_id}}",
  "report_url": "{{$json.report_url}}",
  "timestamp": "{{$now}}"
}
```

If you want to include richer optional fields, the app also accepts:

- `reportReference`
- `reportUrl`
- `externalExecutionId`
- `executiveSummary`
- `riskLevel`
- `topConcerns`
- `metadata`

Expected app success response:

```json
{
  "ok": true,
  "dispatchId": "wd_123",
  "status": "SUCCEEDED"
}
```

## Node 4: HTTP Request - Failure Callback

Recommended n8n node type:

- `HTTP Request`

Method:

- `POST`

URL:

```text
{{$json.callbacks.failure_url || $json.callback_urls.failure_url}}
```

Headers:

```text
Content-Type: application/json
Authorization: Bearer {{$env.N8N_CALLBACK_SHARED_SECRET}}
```

Compact body to send:

```json
{
  "request_id": "{{$json.request_id}}",
  "app_customer_id": "{{$json.app_customer_id}}",
  "app_org_id": "{{$json.app_org_id}}",
  "status": "failed",
  "customer_email": "{{$json.customer_email}}",
  "company_name": "{{$json.company_name}}",
  "purchased_tier": "{{$json.purchased_tier}}",
  "hubspot_contact_id": "{{$json.hubspot_contact_id || ''}}",
  "hubspot_deal_id": "{{$json.hubspot_deal_id || ''}}",
  "report_id": "{{$json.report_id || ''}}",
  "report_url": "{{$json.report_url || ''}}",
  "failure_reason": "{{$json.failure_reason || 'Workflow execution failed'}}",
  "timestamp": "{{$now}}"
}
```

Expected app success response:

```json
{
  "ok": true,
  "dispatchId": "wd_123",
  "status": "FAILED"
}
```

## Minimal n8n variable map

If your workflow needs a quick normalized object before callbacks, build this:

```json
{
  "request_id": "{{$json.request_id || $json.dispatch_id}}",
  "app_customer_id": "{{$json.app_customer_id}}",
  "app_org_id": "{{$json.app_org_id}}",
  "customer_email": "{{$json.customer_email}}",
  "company_name": "{{$json.company_name}}",
  "purchased_tier": "{{$json.purchased_tier}}",
  "purchased_plan_code": "{{$json.purchased_plan_code}}",
  "hubspot_contact_id": "",
  "hubspot_deal_id": "",
  "report_id": "",
  "report_url": "",
  "failure_reason": ""
}
```

## Safe operating rules

- Treat `request_id` as the app dispatch identifier for callbacks.
- Do not invent pricing, entitlement, or workflow decisions in n8n.
- Do not write customer-visible state anywhere except through the app callbacks.
- Do not send secrets, full report bodies, or raw evidence blobs back in callback payloads.
- Use the app callback response only as acknowledgment, not as a replacement for app state.

## Fast test checklist

1. Trigger one paid intake in the app.
2. Confirm n8n receives `audit.requested`.
3. Send a `running` callback to `/api/internal/workflows/status`.
4. Send a `succeeded` callback to `/api/internal/workflows/report-ready`.
5. Confirm the app records:
   - `WorkflowDispatch` status progression
   - `RoutingSnapshot` progression
   - delivery-state update
   - report-ready event handling

## Related implementation files

- [apps/web/lib/n8n.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/n8n.ts)
- [apps/web/lib/workflow-dispatch.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/workflow-dispatch.ts)
- [apps/web/app/api/internal/workflows/status/route.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/api/internal/workflows/status/route.ts)
- [apps/web/app/api/internal/workflows/report-ready/route.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/api/internal/workflows/report-ready/route.ts)
- [apps/web/app/api/internal/workflows/failed/route.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/app/api/internal/workflows/failed/route.ts)
