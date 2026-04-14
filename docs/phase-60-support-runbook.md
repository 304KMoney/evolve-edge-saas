# First-Customer Support Runbook

Use this runbook on launch day when one customer flow is stuck or inconsistent.

Start every investigation here:

- `/admin/accounts/[organizationId]`

If the issue spans billing, routing, and delivery, inspect records in this
order:

1. `BillingEvent`
2. `PaymentReconciliationRecord`
3. `CustomerAccessGrantRecord`
4. `RoutingSnapshot`
5. `WorkflowDispatch`
6. `Report`
7. `OperatorWorkflowEventRecord`

## Issue categories covered

- payment completion vs webhook receipt
- reconciliation not completed
- access grant missing
- intake missing
- report not written back
- report artifact unavailable
- delivery failed
- unauthorized customer access

## 1. Payment completed but no webhook receipt

Look first:

- `BillingEvent`
- Stripe Dashboard event delivery for `/api/stripe/webhook`

Expected:

- `BillingEvent` exists
- `BillingEvent.status = PROCESSED` or a visible `FAILED`

If missing:

1. confirm Stripe event exists
2. confirm correct `STRIPE_WEBHOOK_SECRET`
3. confirm webhook reached the deployed environment
4. check for Stripe live/test mode mismatch

Escalate if:

- Stripe shows successful delivery but no `BillingEvent` exists

## 2. Reconciliation not completed

Look first:

- `PaymentReconciliationRecord`
- recent billing/operator events on the org account page

Expected:

- record exists for the Stripe event
- `reconciliationStatus` reaches a completed or clearly failed state

If stuck or missing:

1. confirm the `BillingEvent` is processed
2. inspect reconciliation metadata for plan/customer mismatch
3. check operator-visible workflow events for reconciliation failure

Escalate if:

- `BillingEvent` is processed but no reconciliation record is present

## 3. Access grant missing

Look first:

- `CustomerAccessGrantRecord`
- `PaymentReconciliationRecord`

Expected:

- successful payment reconciliation has a linked durable access grant

If missing:

1. confirm reconciliation completed
2. confirm customer/org identifiers were available
3. check operator events for access-grant issuance failure

Escalate if:

- reconciliation succeeded but no durable access grant was issued

## 4. Intake missing

Look first:

- `RoutingSnapshot`
- `WorkflowDispatch`

Expected:

- a routing snapshot exists
- a workflow dispatch exists for the paid/intake flow

If missing:

1. confirm payment completed and reconciliation succeeded
2. confirm app-owned routing was computed
3. confirm `N8N_WORKFLOW_DESTINATIONS` includes the live `auditRequested` destination

Escalate if:

- payment succeeded but no routing snapshot or dispatch exists

## 5. Report not written back

Look first:

- `WorkflowDispatch`
- `Report`
- writeback/operator workflow events

Expected:

- workflow callback accepted
- `Report` row updated with durable report content/status

If missing:

1. confirm n8n status callback succeeded
2. confirm report writeback callback succeeded
3. check writeback auth and payload validation failures
4. check for writeback dedupe if the callback was retried

Escalate if:

- workflow ran but durable report state never updated

## 6. Report artifact unavailable

Look first:

- `Report.artifactMetadataJson`
- report detail page artifact state

Expected:

- artifact metadata reflects `ready`, `delivered`, `not_ready`, or `failed`
- UI matches durable artifact state

If unavailable unexpectedly:

1. confirm report writeback persisted artifact metadata
2. confirm report status is aligned with artifact status
3. test the export/view route directly

Escalate if:

- durable artifact metadata says ready but view/download still fails

## 7. Delivery failed

Look first:

- `Report` delivery fields
- `OperatorWorkflowEventRecord`

Expected:

- delivery status is visible
- failure is reflected in an operator-visible event

If delivery failed:

1. inspect the latest operator workflow event message
2. confirm whether failure came from workflow writeback or downstream delivery handling
3. verify the report itself is still persisted even if delivery failed

Escalate if:

- delivery failed and no durable operator event explains why

## 8. Unauthorized customer access

Look first:

- current customer session/org context
- `CustomerAccessGrantRecord`
- report access state screen outcome

Expected:

- valid customer sees the report
- invalid, expired, unpaid, or unbound access fails closed with the premium access state route

If access looks wrong:

1. confirm the customer is in the expected org/session
2. confirm a valid access grant exists
3. confirm report binding still matches the org/grant context
4. verify the customer is not hitting an expired or invalid signed path

Escalate if:

- an authorized customer is denied with a valid durable grant
- an unauthorized customer is allowed through

## Operator rules

- trust app-owned records over customer screenshots
- Stripe is billing authority, but the app is the source of truth for reconciliation, grants, routing, report state, and delivery status
- do not bypass missing durable records with manual assumptions
- if a flow is unclear, capture the org id, report id, Stripe event id, and workflow dispatch id before escalating

## Related docs

- [end-to-end-paid-flow-smoke-test.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\end-to-end-paid-flow-smoke-test.md)
- [billing-reconciliation-and-delivery-operations.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\billing-reconciliation-and-delivery-operations.md)
- [launch-environment-readiness.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\launch-environment-readiness.md)
