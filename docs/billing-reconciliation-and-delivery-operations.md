# Billing Reconciliation And Delivery Operations

This document describes the actual implemented billing reconciliation and delivery-state tracking flow in Evolve Edge.

It is intended for:

- operators troubleshooting stuck or inconsistent requests
- engineers extending the billing, routing, workflow, or delivery layers
- future internal admin tooling work

## Purpose

Evolve Edge needs to answer four operational questions from backend state alone:

1. what was paid for
2. what routing decision was made
3. what execution actually ran
4. what was ultimately delivered

The current implementation answers those questions using canonical backend records in Neon. Stripe remains the payment-event authority, but the Evolve Edge backend remains the system of record for routing, lifecycle status, reconciliation, and delivery state.

## Short operational summary

The implemented flow today is:

1. Stripe sends a verified payment event
2. the backend claims and persists it as a `BillingEvent`
3. the backend computes and persists a `RoutingSnapshot`
4. the backend queues a `WorkflowDispatch` for n8n
5. n8n callbacks update execution status back into the backend
6. the backend updates `DeliveryStateRecord`
7. report and package records are linked as delivery artifacts

If an operator needs to debug a stuck or inconsistent request, the fastest inspection order is:

1. `DeliveryStateRecord`
2. `DeliveryStateTransition`
3. `RoutingSnapshot`
4. `WorkflowDispatch`
5. `BillingEvent`
6. `Report`
7. `ReportPackage`

## Source of truth boundaries

- `BillingEvent`
  - durable Stripe webhook receipt and processing record
- `RoutingSnapshot`
  - durable backend-owned routing decision
- `WorkflowDispatch`
  - durable n8n handoff and callback record
- `DeliveryStateRecord`
  - durable paid-request lifecycle record
- `DeliveryStateTransition`
  - append-safe transition audit trail
- `Report`
  - generated report artifact
- `ReportPackage`
  - executive delivery package and send/review state

Important boundaries:

- Neon and the backend are the system of record.
- Stripe is the billing authority.
- n8n is execution/orchestration only.
- n8n does not infer pricing or reconciliation state.
- Dify and HubSpot are not part of the billing reconciliation control plane.

## Canonical payment record versus ongoing billing state

The canonical payment/purchase event record is `BillingEvent`.

The canonical ongoing billing/access state record is the local `Subscription` copy that the app maintains after Stripe synchronization.

For delivery reconciliation, the distinction is:

- `BillingEvent` answers "what financial event happened?"
- `Subscription` answers "what is the workspace billing/access state now?"
- `DeliveryStateRecord` answers "where is this paid request in its fulfillment lifecycle?"

## Billing event log expectations

`BillingEventLog` is the operator-facing audit trail for normalized billing events. It is not the raw Stripe receipt table, and it is not the ongoing subscription state table.

When reading billing logs, use these field meanings:

- `stripeEventId`, `stripeCheckoutSessionId`, `stripePaymentIntentId`
  - external Stripe references
- `canonicalPlanKey`
  - canonical plan enum used by the backend
- `planCodeSnapshot`
  - internal revenue-plan code snapshot used by the billing layer

Important:

- `planCodeSnapshot` is expected to contain values like `starter-annual` or `scale-annual`
- operators and support surfaces should normalize those values back to `Starter`, `Scale`, or `Enterprise` before display
- this is how we preserve billing compatibility without leaking internal revenue-plan drift into customer-safe views

## Data model overview

### `BillingEvent`

Primary role:

- durable receipt of Stripe events

Important fields:

- `stripeEventId`
- `type`
- `status`
- `payload`
- `processedAt`
- `failedAt`
- `lastError`

Notes:

- `processingStartedAt` is an in-flight marker only. Terminal `BillingEvent` rows clear it when they move to `PROCESSED` or `FAILED` so operators can trust the persisted state at a glance.

### `RoutingSnapshot`

Primary role:

- durable record of the backend-owned routing decision

Important fields:

- `billingEventId`
- `sourceSystem`
- `sourceEventType`
- `sourceEventId`
- `planCode`
- `workflowCode`
- `entitlementsJson`
- `normalizedHintsJson`
- `routingReasonJson`
- `status`

### `WorkflowDispatch`

Primary role:

- durable record of what was sent to n8n and what came back

Important fields:

- `routingSnapshotId`
- `eventType`
- `destination`
- `status`
- `requestPayload`
- `responsePayload`
- `externalExecutionId`
- `responseStatus`
- `lastError`

### `DeliveryStateRecord`

Primary role:

- current lifecycle record for a paid request

Important fields:

- `billingEventId`
- `routingSnapshotId`
- `workflowDispatchId`
- `reportId`
- `reportPackageId`
- `planCode`
- `workflowCode`
- `externalResultReference`
- `status`
- `paidAt`
- `routedAt`
- `processingAt`
- `awaitingReviewAt`
- `reportGeneratedAt`
- `deliveredAt`
- `failedAt`

### `DeliveryStateTransition`

Primary role:

- append-safe history of status changes

Important fields:

- `deliveryStateRecordId`
- `fromStatus`
- `toStatus`
- `actorType`
- `actorLabel`
- `reasonCode`
- `note`
- `metadata`
- `occurredAt`

## Stripe event to backend state flow

### 1. Stripe webhook receipt

Entry point:

- [route.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\app\api\stripe\webhook\route.ts)

Implemented behavior:

1. verify Stripe signature
2. parse and validate event payload
3. claim or deduplicate `BillingEvent`
4. process the event type
5. mark the `BillingEvent` processed or failed

### 2. Paid checkout event creates lifecycle

For `checkout.session.completed` and `checkout.session.async_payment_succeeded`, the backend:

1. resolves commercial context
2. resolves or creates the org and user when needed
3. synchronizes Stripe checkout/subscription state
4. creates a `DeliveryStateRecord` with status `paid`
5. computes and persists a `RoutingSnapshot`
6. links the delivery state to the routing snapshot
7. advances the delivery state to `routed`
8. queues a normalized `WorkflowDispatch`

The delivery-state creation and routing link happen before external workflow execution begins, so the backend already knows that a paid request exists even if downstream execution is delayed or fails.

### 3. Subscription and invoice events

Other Stripe events such as:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

primarily update subscription and billing state. They do not create the paid-request delivery lifecycle unless they go through the checkout-paid path above.

## Delivery lifecycle progression

Canonical statuses:

- `paid`
- `routed`
- `processing`
- `awaiting_review`
- `report_generated`
- `delivered`
- `failed`

Central transition logic lives in:

- [delivery-state.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\delivery-state.ts)

### Where each status is currently set

#### `paid`

Set in:

- Stripe checkout completion handling

Mechanism:

- `createDeliveryStateFromPaidRequest()`

#### `routed`

Set in:

- routing snapshot creation and workflow dispatch queueing

Mechanism:

- `transitionDeliveryState(... toStatus: ROUTED ...)`

#### `processing`

Set in:

- workflow status callback when n8n acknowledges or starts running

Mechanism:

- `recordWorkflowStatusCallback()`

#### `report_generated`

Set in:

- workflow report-ready callback

Mechanism:

- `recordWorkflowReportReady()`

#### `awaiting_review`

Set in:

- executive delivery package creation

Mechanism:

- `markDeliveryStateAwaitingReviewForReport()`

This is currently based on safe linkage using report id, package id, or external result reference.

#### `delivered`

Set in:

- executive package send

Mechanism:

- `markDeliveryStateDeliveredForReport()`

Important:

- QA approval does not mark the request as delivered
- founder review does not mark the request as delivered
- only the actual send boundary marks `delivered`

#### `failed`

Set in:

- workflow status callback when execution fails

Mechanism:

- `recordWorkflowStatusCallback()`

The failure state stores:

- `lastError`
- latest execution metadata when available
- append-safe transition history

### Current status progression rule

Delivery-state progression is intentionally monotonic except for `failed`.

That means:

- later lifecycle states do not regress back to earlier ones
- `failed` can be applied explicitly from an in-flight state
- repeated identical updates are safe and do not create duplicate transitions

## Routing snapshot and execution result linkage

The canonical reconciliation chain is:

1. `BillingEvent`
2. `RoutingSnapshot`
3. `WorkflowDispatch`
4. `DeliveryStateRecord`
5. `Report` and `ReportPackage`

Current direct linkage:

- `RoutingSnapshot.billingEventId`
- `WorkflowDispatch.routingSnapshotId`
- `DeliveryStateRecord.billingEventId`
- `DeliveryStateRecord.routingSnapshotId`
- `DeliveryStateRecord.workflowDispatchId`
- `DeliveryStateRecord.reportId`
- `DeliveryStateRecord.reportPackageId`

Execution-result linkage today is represented by:

- `WorkflowDispatch.externalExecutionId`
- `WorkflowDispatch.responsePayload`
- `DeliveryStateRecord.latestExecutionResultJson`
- `DeliveryStateRecord.externalResultReference`

The normalized summary helper lives in:

- [delivery-reconciliation.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\delivery-reconciliation.ts)

It currently supports lookup by:

- `deliveryStateId`
- `billingEventId`
- `routingSnapshotId`
- `workflowDispatchId`

This helper is intended for support and operator use. It does not recompute commercial policy and it does not make n8n authoritative.

## Mismatch scenarios currently detected

Mismatch detection lives in:

- [delivery-mismatch-detection.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\delivery-mismatch-detection.ts)

Detected scenarios:

### `paid_not_routed`

Meaning:

- a request was paid for
- no routing snapshot is linked
- the request has remained in `paid` past the configured threshold

Default threshold:

- 15 minutes

### `routed_not_delivered`

Meaning:

- a request entered routing/execution/review
- it has not reached `delivered`
- it has not already failed
- it has remained in that state past the configured threshold

Statuses checked:

- `routed`
- `processing`
- `awaiting_review`
- `report_generated`

Default threshold:

- 180 minutes

### `delivered_without_matching_payment`

Meaning:

- a request is marked `delivered`
- neither `DeliveryStateRecord.billingEventId` nor `RoutingSnapshot.billingEventId` exists

Severity:

- critical

These findings are currently evaluated from canonical backend state at query time. They are not yet persisted as their own findings table.

## Operator troubleshooting guide

### Question: what was purchased?

Check:

1. `BillingEvent`
2. Stripe event type and `stripeEventId`
3. whether the corresponding `DeliveryStateRecord.billingEventId` exists

If there is no `BillingEvent`, the purchase event was never recorded by the backend.

If there is a Stripe event externally but no matching `BillingEvent`, troubleshoot:

1. webhook delivery configuration
2. webhook signature verification failures
3. idempotent claim handling in the Stripe webhook route
4. environment mismatch between Stripe and the target app deployment

### Question: what was routed?

Check:

1. `RoutingSnapshot`
2. `planCode`
3. `workflowCode`
4. `routingReasonJson`
5. `normalizedHintsJson`

If there is a payment record but no routing snapshot, the request should surface as `paid_not_routed`.

Also confirm:

1. the checkout event resolved a valid commercial mapping
2. the routing snapshot was not blocked by a missing org or user resolution path
3. the event was not left in `BillingEventStatus.FAILED`

### Question: what was executed?

Check:

1. `WorkflowDispatch`
2. `status`
3. `requestPayload`
4. `responsePayload`
5. `externalExecutionId`

If there is a routing snapshot but no progress toward delivery, the request may surface as `routed_not_delivered`.

Also check:

1. whether `WorkflowDispatch` was ever created
2. whether it is still `PENDING`, `DISPATCHING`, or `FAILED`
3. whether the n8n callback secret and callback routes are configured correctly

### Question: what was delivered?

Check:

1. `DeliveryStateRecord.status`
2. `reportId`
3. `reportPackageId`
4. `deliveredAt`
5. `failedAt`

If `delivered` exists without a payment link, the request should surface as `delivered_without_matching_payment`.

Also confirm:

1. whether the package was only reviewed versus actually sent
2. whether `ReportPackage.sentAt` exists
3. whether `DeliveryStateRecord.deliveredAt` matches the send boundary

### Question: why is the request stuck?

Recommended inspection order:

1. `DeliveryStateRecord`
2. `DeliveryStateTransition`
3. `RoutingSnapshot`
4. `WorkflowDispatch`
5. `BillingEvent`
6. `Report`
7. `ReportPackage`

That order reflects the current operator-facing lifecycle best.

## Setup and migration notes

This documentation reflects features introduced across these already-implemented phases:

- delivery-state tracking migration
- reconciliation linkage migration
- mismatch detection query layer

Apply migrations before expecting the linkage fields and delivery-state tables to exist:

1. `20260412110000_delivery_state_tracking_layer`
2. `20260412123000_reconciliation_linkage`

Recommended validation commands:

```powershell
Set-Location "C:\Users\kielg\OneDrive\Desktop\Evolve Edge"
pnpm db:migrate
pnpm db:generate
Set-Location "C:\Users\kielg\OneDrive\Desktop\Evolve Edge\apps\web"
.\node_modules\.bin\tsc.cmd --noEmit
npx tsx test/delivery-state.test.ts
npx tsx test/delivery-reconciliation.test.ts
npx tsx test/delivery-mismatch-detection.test.ts
```

## Known limitations and deferred items

Current limitations:

- no historical backfill
- no automatic mismatch repair
- no mismatch persistence table yet
- no automatic queue-item creation from mismatch findings yet
- no customer-facing delivery tracker
- no mismatch detection for ambiguous report-to-request linkage
- no dedicated operator dashboard UI for reconciliation findings yet

Important deferred items:

- anomaly scoring
- scheduled or cron-driven mismatch execution
- automated remediation workflows
- broader support surfaces for searching or filtering reconciliation findings

## Related docs

- [delivery-state-tracking-layer.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\delivery-state-tracking-layer.md)
- [delivery-reconciliation-linkage.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\delivery-reconciliation-linkage.md)
- [delivery-mismatch-detection.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\delivery-mismatch-detection.md)
