# Delivery Reconciliation Linkage

This document describes the backend-owned reconciliation chain for paid requests in Evolve Edge.

For the operator-oriented end-to-end flow, see [billing-reconciliation-and-delivery-operations.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\billing-reconciliation-and-delivery-operations.md).

## Purpose

The reconciliation layer answers four support and operator questions without relying on n8n or Stripe payload inference:

- what was purchased
- what was routed
- what was executed
- what was delivered

## Source of truth boundaries

- Neon and the Evolve Edge backend remain the system of record.
- `BillingEvent` is the durable payment-event receipt.
- `RoutingSnapshot` is the durable routing decision.
- `WorkflowDispatch` is the durable execution handoff and callback record.
- `DeliveryStateRecord` is the lifecycle record that ties the paid request together.
- `Report` and `ReportPackage` remain the delivery artifacts.

## Canonical linkage chain

The expected reconciliation chain is:

1. `BillingEvent`
2. `RoutingSnapshot`
3. `WorkflowDispatch`
4. `DeliveryStateRecord`
5. `Report` and `ReportPackage`

This phase adds an explicit `billingEventId` link on `RoutingSnapshot` so the payment-to-routing hop is durable and queryable without matching on source event ids alone.

## What each record answers

### Purchase

`BillingEvent` answers:

- Stripe event id
- Stripe event type
- payment payload receipt status

### Routing

`RoutingSnapshot` answers:

- canonical plan code
- canonical workflow code
- entitlement snapshot
- normalized routing hints
- routing reason

### Execution

`WorkflowDispatch` answers:

- dispatch destination
- dispatch/request payload
- callback status
- external execution id when provided
- response payload and response status

### Delivery

`DeliveryStateRecord` answers:

- current delivery lifecycle status
- linked billing event
- linked routing snapshot
- linked workflow dispatch
- linked report and report package when available

## Current intentional non-goals

This phase does not implement:

- mismatch detection
- anomaly detection
- historical backfill
- automated repair of ambiguous linkages

## Operational note

The backend helper `getDeliveryReconciliationSummary()` returns a normalized summary for operator and support use. It is reference-only and does not move control-plane logic out of the app.

## Current limitations

- mismatch detection is documented separately and intentionally not persisted as findings yet
- historical backfill is not implemented
- ambiguous report-to-request linkage is still intentionally deferred
