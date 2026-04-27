# Reliability Hardening

## Architecture Audit

### Current strengths

Evolve Edge already had several strong production-readiness patterns:

- app-owned domain events with durable idempotency keys
- Stripe webhook claim-and-process flow through `BillingEvent`
- durable outbound delivery records through `WebhookDelivery`
- durable Dify job records through `AnalysisJob`
- app-owned customer run tracking for operator recovery
- scheduled job run tracking

### Highest-leverage reliability risks identified

1. `WebhookDelivery` rows could remain stuck in `PROCESSING` if a worker crashed after claiming the row.
2. `AnalysisJob` rows could remain stuck in `RUNNING` if Dify timed out or the process died mid-run.
3. External API failures were not consistently classified as retryable vs non-retryable.
4. Correlation across retries and external calls was weak, which made operator triage harder.
5. Generic webhook retries treated all failures similarly, even when the destination returned a non-retryable error.
6. HubSpot and webhook calls had timeouts, but the timeout boundaries and failure semantics were not centralized.

## What Changed

### Shared reliability primitives

File: `apps/web/lib/reliability.ts`

Added:

- timeout clamping
- retryable HTTP status classification
- normalized external error classification
- stale processing detection
- correlation ID generation

This keeps retry and failure decisions consistent across external integrations.

### Outbound webhook hardening

File: `apps/web/lib/webhook-dispatcher.ts`

Added:

- stale `PROCESSING` delivery recovery into `RETRYING` or terminal `FAILED`
- correlation IDs on outbound generic webhook requests
- delivery-scoped idempotency header on outbound requests
- retry classification based on normalized failure type
- better operator alert severity for retryable vs terminal failures
- `reviewRequired` and `recoveredStale` counts in dispatcher results

Behavioral change:

- retryable failures such as timeouts, network failures, `429`, and `5xx` continue retrying
- non-retryable failures such as `400`, `401`, `403`, and `404` stop retrying sooner and surface as review-required failures
- replay attempts are now blocked for deliveries already in `DELIVERED` or `PROCESSING`, so manual replay cannot force duplicate outbound side effects through the same delivery row

### Inbound workflow callback hardening

Files:

- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/workflow-callback-policy.ts`
- `apps/web/lib/workflow-writeback-receipts.ts`

Current callback durability model:

- workflow status callbacks are state-backed and no-op when the same terminal outcome already exists on `WorkflowDispatch`
- report-ready callbacks are state-backed and no-op when the same final report-ready payload already exists on `WorkflowDispatch`
- report-writeback callbacks are receipt-backed through `WorkflowWritebackReceipt`, which gives them a durable callback milestone dedupe boundary
- report-writeback now also reconciles `CustomerRun` progression from the canonical `Report` link, so workflow-driven report generation and report-generation failure do not rely only on dashboard-side mutations

Behavioral change:

- duplicate `succeeded` or identical `failed` status callbacks no longer re-emit operator events, audit logs, or delivery-state churn
- duplicate report-ready callbacks no longer republish `report.ready` or replay the same operator-ready event when the stored terminal payload already matches
- duplicate report-writeback milestones continue returning a safe duplicate response instead of replaying writeback side effects
- status and report-ready callback routes now also return an explicit `deduplicated: true` response body for those safe no-op repeats
- report-writeback can now move a customer run into report-generated progression, report-generation action-required state, or final delivered completion when the workflow callback becomes the canonical source of that milestone

### Operator visibility hardening

Files:

- `apps/web/lib/fulfillment-visibility.ts`
- `apps/web/lib/fulfillment-health.ts`
- `apps/web/lib/admin-console.ts`

Added:

- shared fulfillment visibility summaries that compare `DeliveryStateRecord`, `WorkflowDispatch`, `CustomerRun`, and the latest outbound `WebhookDelivery` state
- explicit drift detection for:
  - delivered requests whose customer run is still open
  - failed dispatch or delivery state that has not moved the run into operator attention
  - delivery progress that has no linked customer run
  - blocked outbound CRM delivery without a matching run-level warning
- recovery summaries when retries have already succeeded and the canonical state is no longer blocked

Behavioral change:

- `/api/fulfillment/health` now includes reconciliation counts plus recent attention and recovery records instead of only raw pipeline counts
- `/admin` now shows a fulfillment drift and recovery panel so operators can see cross-record disagreement without opening raw rows first
- `/admin/accounts/[organizationId]` now shows the same fulfillment drift and recovery summary for a single workspace so launch triage can stay on the account detail page

### Workflow dispatch recovery hardening

Files:

- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/workflow-dispatch-policy.ts`

Added:

- stale `DISPATCHING` workflow recovery into retryable `PENDING` or terminal `FAILED`
- operator-visible findings when stale dispatches exhaust recovery attempts
- dispatcher result counters for recovered stale dispatches and review-required outcomes

Behavioral change:

- workflow handoffs that remain stuck in `DISPATCHING` past the stale timeout are no longer left indefinitely in-flight
- recoverable stale dispatches re-enter the normal retry path
- exhausted stale dispatches fail visibly instead of silently lingering between app routing and n8n acknowledgement

### HubSpot sync hardening

File: `apps/web/lib/hubspot.ts`

Added:

- correlation IDs on outbound HubSpot requests
- centralized timeout clamping
- normalized failure propagation

### Dify analysis hardening

File: `apps/web/lib/dify.ts`

Added:

- stale `RUNNING` analysis recovery
- automatic requeue for stale in-flight jobs that still have attempts left
- terminal review state for stale jobs that exhausted retries
- correlation IDs and idempotency headers on Dify requests
- normalized Dify failure logging and alerting

## External Failure Map

### Stripe

Failure points:

- invalid webhook signature
- malformed webhook payload
- duplicate webhook delivery
- missing subscription context in webhook payload
- Stripe state sync failure after a valid webhook

Current handling:

- signature verification
- billing event claim-and-process logic
- duplicate replay safety through `stripeEventId`
- failed events remain visible through `BillingEvent`

### HubSpot

Failure points:

- token/auth issues
- timeout
- object association failure
- custom property mismatch

Current handling:

- request timeout
- normalized retry classification
- outbound delivery durability through `WebhookDelivery`
- operator alerts on terminal failure

### n8n / generic webhook consumers

Failure points:

- destination misconfiguration
- timeouts
- downstream `4xx/5xx`
- duplicate replays

Current handling:

- durable `WebhookDelivery`
- delivery-scoped idempotency headers
- stale processing recovery
- retry classification
- failed-delivery visibility in app surfaces
- replay blocked for already delivered or in-flight delivery rows

### Dify

Failure points:

- timeout
- malformed payload
- malformed response shape
- worker crash after claiming a job

Current handling:

- response validation before use
- stale running job recovery
- bounded retry count
- operator alerting

## Why It Matters

These changes reduce the most common startup-to-enterprise reliability failures:

- stuck processing rows
- endless retries on non-retryable failures
- poor operator traceability during external incidents
- silent degradation when upstream systems are flaky

The business flow stays the same, but it becomes much more predictable under delay, replay, timeout, and partial outage conditions.

## Environment Variables

No new required environment variables were added.

Optional tuning variables now supported:

- `WEBHOOK_DELIVERY_STALE_MINUTES`
- `DIFY_ANALYSIS_STALE_MINUTES`
- `WORKFLOW_DISPATCH_STALE_MINUTES`

If unset, safe defaults are used.

## Migrations

None.

## Tests Added

File: `apps/web/test/reliability.test.ts`

Covers:

- timeout clamping
- retryable HTTP classification
- normalized external error classification
- stale processing detection

## Operational Runbook

### If webhook deliveries are failing

1. Open the workspace settings page and review failed outbound deliveries.
2. Check the `lastError`, destination, and attempt count.
3. If the failure is auth or request-shape related, fix the destination config before retrying.
4. Re-run the scheduled webhook dispatcher after the fix.
5. Treat rows that exhausted retries as review-required until delivery is confirmed manually.

### If workflow callbacks appear duplicated

1. Check `WorkflowDispatch.status`, `externalExecutionId`, `responsePayload`, and `lastError`.
2. If the callback matches the already-persisted terminal state, expect the app to no-op safely instead of replaying downstream side effects.
3. For report writeback, check the corresponding `WorkflowWritebackReceipt` milestone behavior before assuming the callback was dropped.
4. Only replay from operator tooling after confirming the callback represented a genuinely missing state transition rather than a duplicate delivery.
5. If report generation progressed, failed, or reached delivered state through workflow writeback, confirm the linked `CustomerRun` now reflects that same milestone instead of assuming the run must be repaired separately.
6. If `/admin` or `/api/fulfillment/health` shows fulfillment drift, trust the canonical source named in the finding before replaying multiple systems at once.

### If workflow dispatch looks stuck

1. Check `WorkflowDispatch.status`, `attemptCount`, `lastAttemptAt`, `lastError`, and the linked `RoutingSnapshot.status`.
2. If the row remains `DISPATCHING` past the stale timeout, expect the scheduled dispatcher to recover it automatically into `PENDING` or terminal `FAILED`.
3. If recovery exhausted attempts, review the generated queue finding before replaying the handoff.
4. Confirm the n8n destination URL and callback secret configuration before forcing another dispatch attempt.

### If Dify analysis is stuck

1. Check the latest `AnalysisJob` row and the corresponding customer run.
2. If the job is still `RUNNING` far past the expected timeout window, the scheduled retry job will automatically recover it.
3. If the job exhausts retries, treat it as review-required and inspect the upstream Dify response or timeout behavior.
4. Re-trigger the customer run only after confirming the input payload is valid.

### If HubSpot sync is failing

1. Confirm the access token and custom property configuration.
2. Review failed outbound deliveries for `hubspot-crm`.
3. Look for auth failures vs retryable upstream failures.
4. Re-run outbound dispatch after fixing credentials or HubSpot configuration.

## Test Checklist

1. Run the web test suite and confirm the new reliability tests pass.
2. Simulate a timeout-like external failure and confirm it is classified as retryable.
3. Simulate a `401` or `403` external failure and confirm it becomes review-required instead of endlessly retrying.
4. Force a webhook delivery into stale `PROCESSING` state and confirm the dispatcher recovers it.
5. Force an analysis job into stale `RUNNING` state and confirm the Dify dispatcher requeues it or marks it terminal when retries are exhausted.
6. Send the same workflow terminal callback twice and confirm the second callback is treated as a safe no-op.
7. Force a workflow dispatch into stale `DISPATCHING` state and confirm the dispatcher recovers it or marks it terminal after retries are exhausted.
8. Seed one recovered run and one drifted delivery record, then confirm `/api/fulfillment/health` and `/admin` surface both conditions without opening raw tables.
9. Open `/admin/accounts/[organizationId]` for a seeded workspace and confirm the account page shows the same fulfillment attention or recovery context as the global admin surface.

## Future SLO / SLA Recommendations

- Add a small admin reliability dashboard for:
  - failed webhook deliveries
  - stale analysis jobs
  - failed Stripe billing events
  - scheduled job failures
- Persist correlation IDs on delivery and job rows if cross-system tracing becomes a support requirement.
- Add explicit dead-letter queues as first-class tables once support volume justifies manual replay tooling.
- Define first operational SLOs around:
  - Stripe webhook processing latency
  - report generation completion time
  - outbound delivery success rate
  - Dify analysis success rate
