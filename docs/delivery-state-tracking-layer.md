# Delivery State Tracking Layer

This document describes the backend-owned delivery-state lifecycle for paid requests in Evolve Edge.

For the combined operator and engineering flow, see [billing-reconciliation-and-delivery-operations.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\billing-reconciliation-and-delivery-operations.md).

## Purpose

The delivery-state layer gives the platform one durable, auditable record that answers:

- a paid request exists
- it was routed
- workflow execution started
- review is pending when applicable
- a report output exists
- delivery completed or failed

This layer is additive. It does not replace billing truth, routing truth, or report truth.

## Source of truth boundaries

- Neon and the Evolve Edge backend remain the system of record.
- Stripe remains the billing authority.
- `RoutingSnapshot` remains the routing authority.
- `WorkflowDispatch` remains the orchestration handoff record.
- `Report` and `ReportPackage` remain delivery artifacts.

`DeliveryStateRecord` exists to connect those boundaries into one support-facing lifecycle.

## Canonical statuses

- `paid`
- `routed`
- `processing`
- `awaiting_review`
- `report_generated`
- `delivered`
- `failed`

## Current linkage model

Each `DeliveryStateRecord` can link to:

- `organizationId`
- `userId`
- `billingEventId`
- `routingSnapshotId`
- `workflowDispatchId`
- `reportId`
- `reportPackageId`

`RoutingSnapshot` now also carries an explicit `billingEventId` reference so payment and routing can be reconciled without relying on source-event matching alone.

It also stores:

- source system and source event
- canonical plan code
- canonical workflow code
- routing hints
- execution result metadata
- append-safe transitions

## Current lifecycle wiring

The current implementation wires the delivery-state lifecycle at these boundaries:

1. Stripe `checkout.session.completed`
   - creates `paid`
2. Routing snapshot persistence and workflow dispatch queueing
   - advances to `routed`
3. n8n workflow status callback
   - advances to `processing`
   - or `failed`
4. n8n report-ready callback
   - advances to `report_generated`
   - stores external result reference and execution payload
5. Executive delivery package creation
   - advances to `awaiting_review` when the generated report can be matched safely
6. Executive QA approval or founder review
   - does not mark the request as `delivered`
7. Executive package send
   - advances to `delivered`

## Auditing model

`DeliveryStateRecord` stores the current status.

`DeliveryStateTransition` stores append-safe transition history, including:

- from status
- to status
- actor type
- actor label
- reason code
- optional note
- optional metadata
- occurred-at timestamp

## Intentional non-goals in this phase

This phase does not implement:

- delivery anomaly detection
- backfill of all historical paid requests
- automatic reconciliation between ambiguous reports and paid requests
- a customer-facing delivery tracker

Mismatch detection now exists as a separate backend query layer and is documented in [delivery-mismatch-detection.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\delivery-mismatch-detection.md).

## Operational note

Automatic linkage from `report_generated` to `awaiting_review` currently works when the generated report can be matched to the external result reference safely. If a flow does not yet provide that reference, the delivery-state record remains valid but may stop at `report_generated` until a later reconciliation phase.

## Migration note

New persistence introduced in this phase:

- `DeliveryStateRecord`
- `DeliveryStateTransition`
- `DeliveryStateStatus`

Apply the migration before enabling operators to rely on the new lifecycle in support workflows.

See also: [delivery-reconciliation-linkage.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\delivery-reconciliation-linkage.md)
