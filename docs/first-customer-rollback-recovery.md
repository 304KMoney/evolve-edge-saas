# First-Customer Rollback And Recovery

Use this note when launch-day changes need to be rolled back quickly to restore
service or stop incorrect processing.

Priority order:

1. stop bad new traffic or bad callbacks
2. restore the last known good app configuration
3. re-run one controlled validation flow

## Scenarios covered

- bad deployment
- broken environment variable configuration
- Stripe webhook misconfiguration
- n8n production webhook or callback misconfiguration
- callback auth mismatch

## 1. Bad deployment

Look first:

- current production deployment in Vercel
- latest successful prior deployment

Safest immediate recovery actions:

1. roll traffic back to the last known good deployment
2. do not keep testing against a broken production build
3. once rollback is live, re-check site load, pricing entry, and dashboard access

Use this when:

- site fails to load
- key routes error on boot
- dashboard or Route Handlers fail immediately after deploy

## 2. Broken environment variable configuration

Look first:

- target environment values in Vercel
- [launch-environment-readiness.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/launch-environment-readiness.md)

Safest immediate recovery actions:

1. restore the last known good env values for the target environment
2. redeploy so server code and Route Handlers restart with the corrected config
3. re-run the launch preflight and one controlled smoke-test slice

Use this when:

- checkout cannot start
- Prisma-backed routes cannot connect
- Stripe or n8n callbacks suddenly fail after config changes

## 3. Stripe webhook misconfiguration

Look first:

- Stripe Dashboard webhook deliveries
- `/api/stripe/webhook`
- `BillingEvent`
- `PaymentReconciliationRecord`

Safest immediate recovery actions:

1. confirm the correct production webhook endpoint URL
2. confirm `STRIPE_WEBHOOK_SECRET` matches the active Stripe endpoint
3. confirm Stripe live versus test mode is intentional
4. once corrected, send one controlled event and confirm `BillingEvent` is
   processed before resuming normal traffic review

Use this when:

- Stripe shows delivery failures
- signature verification fails
- webhook events reach the app but are rejected for mode mismatch

## 4. n8n production webhook or callback misconfiguration

Look first:

- `N8N_WORKFLOW_DESTINATIONS`
- n8n published production webhook URLs
- `WorkflowDispatch`
- `/api/internal/workflows/status`
- `/api/internal/workflows/report-writeback`

Safest immediate recovery actions:

1. remove or replace incorrect production webhook URLs in the target env
2. redeploy if env values changed
3. confirm n8n is calling the correct production status and writeback routes
4. send one controlled workflow run and confirm:
   - `WorkflowDispatch` is created
   - writeback is accepted
   - durable `Report` state updates

Use this when:

- intake dispatches to the wrong workflow URL
- n8n runs but never calls back
- writeback goes to the wrong environment

## 5. Callback auth mismatch

Look first:

- `N8N_CALLBACK_SECRET`
- `N8N_WRITEBACK_SECRET`
- n8n callback configuration
- status and writeback route responses

Safest immediate recovery actions:

1. choose the correct shared secret values for the target environment
2. update n8n and the app so both sides match exactly
3. redeploy the app if env values changed
4. re-run one controlled status callback and one controlled writeback callback

Use this when:

- n8n callbacks return `401`
- status callback works in test but fails in production
- report writeback payloads are valid but rejected as unauthorized

## Recovery rule

After any rollback or config recovery:

1. run one controlled end-to-end validation flow
2. confirm:
   - `BillingEvent`
   - `PaymentReconciliationRecord`
   - `CustomerAccessGrantRecord`
   - `WorkflowDispatch`
   - `Report`
3. only then reopen the launch path to real customer traffic

## Related docs

- [first-customer-launch-checks.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/first-customer-launch-checks.md)
- [launch-environment-readiness.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/launch-environment-readiness.md)
- [end-to-end-paid-flow-smoke-test.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/end-to-end-paid-flow-smoke-test.md)
- [phase-60-support-runbook.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-60-support-runbook.md)
