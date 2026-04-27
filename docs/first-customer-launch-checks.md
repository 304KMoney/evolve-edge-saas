# First-Customer Launch Checks

Use this as the operator-facing go or no-go checklist before first-customer
launch.

It is intentionally short and aligned to the app's current production path:
Vercel deployment, Neon persistence, Stripe checkout plus verified webhook
processing, n8n workflow execution, durable report writeback, and protected
dashboard report access.

## Must-Have Before Launch

- Deployment completed in the target environment.
  Expected: the intended Vercel deployment is live and reachable on the correct
  domain.
- Environment variables set for the target environment.
  Expected: required public and server-only values are present. Use
  [launch-environment-readiness.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/launch-environment-readiness.md).
- Database reachable.
  Expected: the app can connect to `DATABASE_URL` and Prisma-backed server
  routes start without database connection errors.
- Prisma migrations applied if needed.
  Expected: deployed schema matches the app code and Prisma client generation
  has been run for the current schema.
- Stripe mode intentional and verified.
  Expected: production uses live Stripe credentials, non-production uses test
  credentials unless a deliberate live validation is being run, and webhook mode
  matches the configured Stripe key mode.
- Stripe webhook endpoint active.
  Expected: `/api/stripe/webhook` is reachable, signature verification succeeds,
  and one controlled event can be processed into `BillingEvent` plus
  `PaymentReconciliationRecord`.
- n8n production webhooks published and active.
  Expected: `N8N_WORKFLOW_DESTINATIONS` contains the live workflow URLs needed
  for launch, and production is not relying on legacy `N8N_WEBHOOK_URL`
  fallback.
- n8n writeback callback configured.
  Expected: n8n is configured to call the app's status and report writeback
  routes for the target environment.
- Callback auth secret configured.
  Expected: `N8N_CALLBACK_SECRET` and `N8N_WRITEBACK_SECRET` are set in the app
  and match the secrets configured in n8n.
- Smoke test completed successfully.
  Expected: one controlled paid flow passes end to end. Use
  [end-to-end-paid-flow-smoke-test.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/end-to-end-paid-flow-smoke-test.md).
- Support runbook available.
  Expected: the operator on call knows where to look first for payment,
  reconciliation, access-grant, writeback, artifact, and delivery issues. Use
  [phase-60-support-runbook.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-60-support-runbook.md).

## Recommended Before Launch

- Run the repo-owned preflight checks.
  Suggested: `pnpm preflight:first-customer:env` and
  `pnpm preflight:first-customer`.
- Run focused validation commands for the deployed code and schema.
  Suggested: Prisma generate, `tsc --noEmit`, and the launch-critical test
  slices used by the team.
- Verify protected report behavior manually.
  Expected: a ready report is visible in `/dashboard/reports`, the detail page
  reflects durable status and artifact state, download behaves correctly, and
  unauthorized access still fails closed.
- Verify report grant and writeback linkage behavior manually.
  Expected: when durable `CustomerAccessGrantRecord` rows exist, dashboard
  access is limited to the granted report or organization scope, and workflow
  report writeback still resolves correctly when n8n sends an external
  `report_reference` instead of the app-owned report id.
- Verify operator visibility in the app.
  Expected: operators can inspect reconciliation, access-grant, report, and
  delivery progression from durable records and workflow events, see
  terminal/retry-exhausted Dify failures as durable operator findings, and
  review Stripe missing-context findings when tenant context is resolvable.
- Confirm launch docs are available in the operating workspace.
  Suggested:
  - [launch-environment-readiness.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/launch-environment-readiness.md)
  - [end-to-end-paid-flow-smoke-test.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/end-to-end-paid-flow-smoke-test.md)
  - [phase-60-support-runbook.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-60-support-runbook.md)

## No-Go Rule

Do not launch a first customer if any must-have item is still unverified or has
failed in the target environment.
