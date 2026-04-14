# Delivery Mismatch Detection

This document describes the backend-owned mismatch detection layer for billing reconciliation and delivery tracking.

For the broader operator troubleshooting flow, see [billing-reconciliation-and-delivery-operations.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\billing-reconciliation-and-delivery-operations.md).

## Purpose

The mismatch checker gives operators a deterministic way to spot lifecycle problems from backend records alone.

It currently detects:

- `paid_not_routed`
- `routed_not_delivered`
- `delivered_without_matching_payment`

## Source of truth boundaries

- Neon and the Evolve Edge backend remain the system of record.
- `BillingEvent` is the canonical payment-event receipt.
- `RoutingSnapshot` is the canonical routing decision.
- `WorkflowDispatch` is the canonical execution handoff/callback record.
- `DeliveryStateRecord` is the canonical delivery lifecycle record.

n8n is not asked to infer pricing or reconciliation state.

## Detection model

Mismatch detection lives in `apps/web/lib/delivery-mismatch-detection.ts`.

It is currently implemented as a reusable query and evaluation layer, not as inline handler logic and not as a new database table.

That keeps the design:

- deterministic
- queryable
- easy to reuse in future ops dashboards or scheduled checks
- safe to evolve before introducing persisted findings

## Current rules

### `paid_not_routed`

Detected when:

- delivery state is `paid`
- no routing snapshot is linked
- the request has remained in that state beyond the configured threshold

### `routed_not_delivered`

Detected when:

- delivery state is one of:
  - `routed`
  - `processing`
  - `awaiting_review`
  - `report_generated`
- it has remained undelivered beyond the configured threshold
- it has not already failed

### `delivered_without_matching_payment`

Detected when:

- delivery state is `delivered`
- neither `DeliveryStateRecord.billingEventId` nor `RoutingSnapshot.billingEventId` is present

## Default thresholds

- `paid_not_routed`: 15 minutes
- `routed_not_delivered`: 180 minutes

These defaults are intentionally conservative and backend-owned.

## Output shape

Each finding includes:

- mismatch code
- severity
- title
- operator-readable summary
- organization context
- delivery-state context
- linkage ids
- observed timestamp
- age in minutes
- machine-readable metadata

## Intentional non-goals in this phase

This phase does not implement:

- automatic queue item creation
- automatic repair actions
- mismatch backfill
- anomaly scoring
- customer-facing status pages

## Operational use

Use `listDeliveryMismatchFindings()` to enumerate findings for ops or internal admin tooling.

Use `detectDeliveryMismatchForRecord()` for focused unit testing or record-level evaluation.

## Current limitations

- findings are query-time only and are not persisted yet
- no automatic queue item creation happens in this phase
- no scheduled execution is included in this phase
