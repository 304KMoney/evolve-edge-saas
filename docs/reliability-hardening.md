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
