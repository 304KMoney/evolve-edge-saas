# End-To-End Paid Flow Smoke Test

Use this checklist to validate one controlled first-customer flow in the
deployed environment before launch.

Recommended test shape:

- plan: `starter`
- customer: disposable test workspace
- email: operator-controlled inbox
- environment: deployed preview-for-launch or production candidate

## Smoke test checklist

### 1. Site and pricing load

Check:

- deployed site loads
- `/pricing` renders
- Starter CTA routes into the app-owned checkout path

Expected outcome:

- no broken page load
- no obvious auth/config error
- CTA does not route to a brochure-only or temporary surface

Blocking if:

- site does not load
- pricing page is broken
- CTA does not enter the app-owned flow

### 2. Checkout success path

Check:

- complete one Stripe checkout
- return lands on `/billing/return`
- app redirects to the expected billing/dashboard state

Expected outcome:

- checkout succeeds
- customer is not stranded on a dead return path
- app shows `success` or `processing`, not an unrecoverable error

Blocking if:

- checkout cannot start
- Stripe returns to the wrong environment/domain
- billing return path fails hard

### 3. Verified Stripe webhook processing

Check:

- `/api/stripe/webhook` receives the event
- webhook verifies successfully
- no Stripe mode mismatch or signature failure

Expected outcome:

- `BillingEvent` exists
- `BillingEvent.status = PROCESSED`
- duplicate delivery does not create duplicate side effects

Blocking if:

- webhook not received
- signature verification fails
- event remains failed without operator-understandable cause

### 4. Reconciliation persistence

Check:

- a `PaymentReconciliationRecord` is written
- plan and customer fields are normalized

Expected outcome:

- reconciliation row links to the Stripe event
- canonical plan is persisted
- record is usable for audit/debugging

Blocking if:

- no reconciliation record exists
- plan/customer reconciliation is missing or malformed

### 5. Access-grant issuance

Check:

- successful reconciliation issues a durable access grant

Expected outcome:

- `CustomerAccessGrantRecord` exists
- grant is tied to the organization/customer context

Blocking if:

- payment succeeds but no durable grant is issued

### 6. Intake submission to n8n

Check:

- app computes routing
- `WorkflowDispatch` is queued and sent to the configured n8n destination

Expected outcome:

- `RoutingSnapshot` exists
- `WorkflowDispatch` exists
- dispatch payload uses normalized app-owned fields

Blocking if:

- no routing snapshot
- no workflow dispatch
- n8n would need to infer pricing or customer state from raw Stripe values

### 7. n8n writeback to app

Check:

- workflow status callback is accepted
- report writeback callback is accepted

Expected outcome:

- status/writeback routes return success
- duplicate callbacks are safely deduplicated
- no malformed-payload or auth failures

Blocking if:

- writeback auth fails
- callback payload cannot be parsed
- repeated callbacks create duplicate side effects

### 8. Report persistence

Check:

- durable report record is updated by writeback
- report content, artifact metadata, and delivery fields persist

Expected outcome:

- `Report` row contains executive summary and status
- artifact metadata is present when report is ready
- delivery state is reflected in durable app data

Blocking if:

- report is not persisted
- durable status/artifact state is missing after successful writeback

### 9. Dashboard visibility

Check:

- `/dashboard/reports` shows the report
- `/dashboard/reports/[id]` shows current status and artifact state

Expected outcome:

- report is visible in the list
- detail page shows current report status, delivery status if present, and artifact readiness

Blocking if:

- report is missing from dashboard routes
- dashboard still shows stale state after durable writeback

### 10. Artifact view and download

Check:

- report artifact route opens
- download route behaves correctly

Expected outcome:

- ready artifact can be viewed/downloaded
- unavailable artifact fails calmly and honestly
- unauthorized access still fails closed

Blocking if:

- ready artifact cannot be opened or downloaded
- unauthorized access is accidentally allowed

### 11. Delivery status and operator visibility

Check:

- delivery update persists
- operator workflow events are written

Expected outcome:

- delivered or failed state is visible in durable records
- operator-visible events exist for reconciliation, grant issuance, report readiness, and delivery progression/failure

Blocking if:

- delivery completes but operator trail is missing
- a critical failure occurs without durable operator visibility

## Blocking vs non-blocking criteria

### Blocking failures

- any broken customer path from pricing through checkout return
- Stripe webhook verification or reconciliation failure
- missing durable reconciliation or access-grant record after successful payment
- no routing snapshot or workflow dispatch
- n8n callback auth/validation failure
- report not persisted after successful writeback
- report missing from dashboard
- ready artifact cannot be accessed
- unauthorized artifact access succeeds
- critical failures not visible to operators

### Non-blocking issues

- delayed but eventually successful redirect to `billing=processing`
- cosmetic UI issues that do not hide or misstate core state
- optional integrations not used in the tested path, such as HubSpot projection
- duplicate callback receipts that are safely ignored
- minor copy or formatting inconsistencies in operator-visible notes

## Pass criteria

Mark the smoke test:

- `pass` if every blocking step succeeds
- `pass with warnings` if all blocking steps succeed and only non-blocking issues remain
- `fail` if any blocking step fails

## Related docs

- [launch-environment-readiness.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\launch-environment-readiness.md)
- [first-customer-launch-checks.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\first-customer-launch-checks.md)
- [billing-reconciliation-and-delivery-operations.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\billing-reconciliation-and-delivery-operations.md)
