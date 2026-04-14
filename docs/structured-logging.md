# Structured Logging Conventions

Evolve Edge uses centralized structured server logs so production behavior can be inspected without relying on ad hoc console output.

## Goals

- Keep backend and workflow behavior inspectable in production.
- Preserve backend as the source of truth for billing, routing, and workflow execution.
- Avoid logging secrets or raw sensitive payload contents.
- Make it easy to correlate billing, routing, dispatch, callback, and report-delivery events.
- Persist the highest-signal payment and workflow failures into the operations queue
  so operators do not have to rely on logs alone.

## Canonical Log Fields

All critical backend logs should use the shared logger in [`C:\Users\kielg\OneDrive\Desktop\Evolve Edge\apps\web\lib\monitoring.ts`](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\monitoring.ts).

Canonical top-level fields:

- `request_id`
- `routing_snapshot_id`
- `org_id`
- `user_id`
- `workflow_code`
- `status`
- `source`
- `correlation_id`
- `dispatch_id`
- `event_id`
- `resource_id`

Anything that does not fit one of the canonical fields should go under `metadata`.

## Join Keys

Operators should treat different identifiers as the primary join key for
different parts of the platform:

- auth and report access
  - start with `request_id`
  - then join on `org_id`, `user_id`, and `resource_id` when present
- Stripe billing
  - start with `event_id`
  - then join into `BillingEvent`, `BillingEventLog`, `DeliveryStateRecord`, and
    `RoutingSnapshot`
- routing and orchestration
  - start with `routing_snapshot_id`
  - then join to `dispatch_id` and `correlation_id`
- n8n execution
  - start with `dispatch_id`
  - use `correlation_id` to follow request delivery and callbacks together
- Dify analysis
  - start with `resource_id` when it is the analysis job id
  - use `correlation_id` for the outbound Dify request path
  - use `metadata.assessmentId` to reconnect analysis to report generation
- report export and delivery
  - start with `resource_id` when it is the report id
  - then join on `org_id`, `user_id`, and delivery-state references

There is intentionally no single universal id for every flow. The app uses the
smallest stable join key that matches each subsystem's source of truth.

## Trace Handoffs

When a flow crosses subsystem boundaries, operators should expect the primary
join key to change in this order:

- Stripe to routing
  - start with Stripe `event_id`
  - join to `BillingEvent.stripeEventId`
  - then join to `RoutingSnapshot` through `billingEventId` or the shared
    source-event references on the paid-request flow
- routing to n8n
  - start with `routing_snapshot_id`
  - join to `WorkflowDispatch.routingSnapshotId`
  - then use `dispatch_id` and `correlation_id` for delivery and callback logs
- Dify to report generation
  - start with the analysis job id as Dify `resource_id`
  - join to `assessmentId` in Dify log metadata and domain-event payloads
  - then join to the generated `reportId` once report generation completes
- report generation to export and delivery
  - start with `reportId`
  - join to report export logs through `resource_id`
  - join to executive delivery and delivery-state records through report and
    report-package references

The most important operational rule is to follow the durable record at each
handoff rather than forcing one id to span every subsystem.

## Severity Levels

Supported severity levels:

- `debug`
- `info`
- `warn`
- `error`

Use `LOG_LEVEL` to control output. Default is `info`.

## Logging Rules

- Use `logServerEvent(level, event, metadata)` instead of raw `console.*` in critical backend paths.
- Pass request context when available so `request_id` can be lifted to the top level.
- Do not log raw secrets, tokens, passwords, signatures, cookies, or authorization headers.
- Do not log raw sensitive report contents or full inbound webhook payloads unless a sanitized summary is sufficient.

## Redaction

Secret and sensitive key redaction is handled centrally by [`C:\Users\kielg\OneDrive\Desktop\Evolve Edge\apps\web\lib\security-redaction.ts`](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\security-redaction.ts).

Keys matching values like `password`, `token`, `secret`, `signature`, `cookie`, `session`, `authorization`, and similar patterns are replaced with `[REDACTED]`.

## Operational Troubleshooting

## Durable Ops Findings

For first-customer operations, the backend now persists selected high-signal
failure paths into the existing operations queue.

Current persisted finding sources:

- Stripe webhook processing failures that reached backend normalization but could
  not be applied safely
- Dify analysis failures that are terminal or exhausted retries and now require
  operator review
- workflow dispatch failures after the app exhausted retry attempts
- workflow execution failures reported back by n8n callbacks

These findings are backend-owned and auditable in Neon. They complement logs and
webhook alerts; they do not replace canonical billing, routing, or delivery
records.

### Billing webhook issues

Check for:

- `stripe.webhook.received`
- `stripe.webhook.deduplicated`
- `stripe.webhook.processed`
- `stripe.webhook.failed`

Useful fields:

- `event_id`
- `org_id`
- `request_id`
- `status`

### Routing issues

Check for:

- `routing.snapshot.created`
- `routing.snapshot.reused`

Useful fields:

- `routing_snapshot_id`
- `org_id`
- `workflow_code`
- `status`

### Dify analysis issues

Check for:

- `dify.analysis.completed`
- `dify.analysis.failed`
- `dify.analysis.failure_finding_failed`

Useful fields:

- `resource_id`
- `org_id`
- `correlation_id`

Terminal or exhausted-retry Dify failures should also create a durable
operations-queue finding keyed to the `AnalysisJob` so operators can move from
the queue into the affected customer run and assessment without relying on log
search alone.

### Workflow dispatch issues

Check for:

- `workflow.dispatch.queued`
- `workflow.dispatch.delivered`
- `workflow.dispatch.failed`
- `workflow.callback.status.received`
- `workflow.callback.status.completed`
- `workflow.callback.report_ready.received`
- `workflow.callback.report_ready.completed`

Useful fields:

- `dispatch_id`
- `routing_snapshot_id`
- `correlation_id`
- `workflow_code`
- `org_id`

### Report delivery issues

Check for:

- `report.export.invalid_signed_token`
- `report.export.signed_token_mismatch`
- `report.export.signed_token_not_delivered`
- `report.export.not_found`
- `report.export.delivered`

### Report generation issues

Report generation currently has strong durable success records:

- `report.generated` audit log
- `report.generated` / `assessment.completed` / `roadmap.generated` domain events
- `CustomerRun` progression to report generation and later delivery

The main report-generation action now emits these structured signals at the
action boundary:

- `report.generate.validation_fallback`
- `report.generate.failed`

Current failure classifications:

- `report_generation.validation_fallback`
- `report_generation.routing_failed`
- `report_generation.persistence_failed`
- `report_generation.downstream_sync_failed`

When report generation fails, operators should start from the assessment,
latest analysis job, and customer run, then inspect the classification to
separate routing failures from core report persistence or later downstream sync
steps such as email queueing, executive delivery package creation, monitoring
sync, and customer lifecycle sync.

For delivery/export hardening, `report.export.signed_token_not_delivered` now also creates a durable operations-queue finding so operators can investigate early sharing or delivery workflow gaps from backend state instead of logs alone.

Useful fields:

- `resource_id`
- `org_id`
- `user_id`
- `request_id`
- `routing_snapshot_id`
- `workflow_code`

## Environment

Relevant environment variables:

- `LOG_LEVEL`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`

Security-related logging helpers also rely on the existing report-signing and webhook secrets, but those values are never logged directly.
