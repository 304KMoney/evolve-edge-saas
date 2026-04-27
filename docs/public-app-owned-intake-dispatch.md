# Public App-Owned Intake Dispatch

`/api/automation/intake-to-app-dispatch` is the public app-owned intake path for paid audit orchestration.

It exists alongside the legacy `/api/automation/intake-to-n8n` forwarder and is the preferred contract when the workflow needs app-owned state and callback-safe orchestration.

## What it does

On a successful `POST`, the route:

1. normalizes the incoming intake payload
2. resolves or creates the app-owned `User`
3. resolves or creates the app-owned `Organization`
4. creates a `DeliveryStateRecord` in `PAID`
5. creates a `RoutingSnapshot`
6. creates a `WorkflowDispatch`
7. dispatches the normalized `audit.requested` payload to n8n

The response includes:

- `app_org_id`
- `app_customer_id`
- `delivery_state_id`
- `routing_snapshot_id`
- `workflow_dispatch_id`

## Required request fields

- `request_id`
- `customer_email`
- `purchased_tier` or `purchased_plan_code`

Optional fields mirror the legacy intake payload, including:

- `app_org_id`
- `app_customer_id`
- `customer_name`
- `first_name`
- `last_name`
- `company_name`
- `top_concerns`
- `amount_paid`
- `currency`
- `stripe_session_id`
- `order_id`

## Why this route exists

The legacy intake forwarder sends normalized data directly to n8n but does not create app-owned workflow records first. That means internal callback routes like:

- `/api/internal/workflows/status`
- `/api/internal/workflows/report-ready`

have no `WorkflowDispatch` to update.

This app-owned route fixes that by creating canonical state in Neon before n8n starts execution.

## Operational guidance

- Use `/api/automation/intake-to-app-dispatch` when callbacks must update app state.
- Keep `/api/automation/intake-to-n8n` only for compatibility until downstream callers are migrated.
- The legacy `/api/automation/intake-to-n8n` forwarder now resolves outbound
  callback auth through the same app-owned callback secret helper as the main
  workflow dispatch path, so either `N8N_CALLBACK_SECRET` or
  `N8N_CALLBACK_SHARED_SECRET` can back that compatibility route.
- The legacy `/api/automation/intake-to-n8n` forwarder also resolves its
  outbound `auditRequested` target through the shared workflow destination
  config, so environments that cut over to `N8N_WORKFLOW_DESTINATIONS` do not
  need to keep `N8N_WEBHOOK_URL` alive just for that compatibility path.
- n8n should carry `workflow_dispatch_id` / `dispatch_id` through execution and post it back as `dispatchId` in callback payloads.
