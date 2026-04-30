# Launch Environment Readiness

This runbook is the shortest practical setup order for getting Evolve Edge into
a first-customer-ready environment.

It is operational by design. It does not change architecture ownership.

## What the environment must preserve

- the Next.js app owns product and customer state
- Neon is the canonical database
- Stripe is payment-event authority only
- n8n is orchestration only
- OpenAI/LangGraph are AI execution only
- HubSpot is CRM projection only

## Launch environment variables

### Public browser-safe

Set only values that are safe to expose in the browser:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CONTACT_SALES_URL`
- `NEXT_PUBLIC_SALES_CONTACT_EMAIL`

### Server-only required

Set these in Vercel or the target server environment only:

- `AUTH_MODE=password`
- `AUTH_SECRET`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`
- `OUTBOUND_DISPATCH_SECRET`
- `N8N_CALLBACK_SECRET`
- `N8N_WRITEBACK_SECRET`
- `N8N_WORKFLOW_DESTINATIONS`
- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `EMAIL_FROM_ADDRESS`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `PUBLIC_INTAKE_SHARED_SECRET`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `REPORT_DOWNLOAD_REQUIRE_AUTH=true`

The launch preflight now fails closed unless `N8N_WORKFLOW_DESTINATIONS`
contains a valid `auditRequested` destination, because that is the paid-flow
handoff used after Stripe reconciliation and routing.

That fail-closed gate is intentionally narrower than the full named n8n surface.
Use `/api/fulfillment/dispatch-health` to inspect every app-known workflow
destination and its latest app-owned dispatch outcome.

### Stripe-related

These are the minimum Stripe launch values:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

Legacy `growth` Stripe envs may still exist for compatibility, but they are not
the canonical first-customer setup path.

Stripe mode rule:

- production must use live Stripe credentials
- development should use test Stripe credentials
- preview should use test Stripe credentials unless a deliberate live validation
  pass is being run
- the Stripe webhook route fails closed if an incoming event `livemode` does not
  match the configured `STRIPE_SECRET_KEY` mode

Launch reminder:

- Stripe price and product IDs should belong to the same Stripe mode as the
  configured `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` must come from the same Stripe mode endpoint as the
  active app environment

### n8n callback and writeback

These protect app-owned orchestration callbacks:

- `OUTBOUND_DISPATCH_SECRET`
- `N8N_CALLBACK_SECRET`
- `N8N_WRITEBACK_SECRET`
- `N8N_WORKFLOW_DESTINATIONS`
- `PUBLIC_INTAKE_SHARED_SECRET`

Recommended:

- include at least the live `auditRequested` destination
- make sure the JSON is valid and the `auditRequested` entry is actually present;
  a non-empty `N8N_WORKFLOW_DESTINATIONS` value is not enough on its own
- keep callback and writeback secrets distinct when possible
- keep `PUBLIC_INTAKE_SHARED_SECRET` set in production so public intake routes
  fail closed unless the caller is authorized
- keep test/staging webhook URLs out of the production `N8N_WORKFLOW_DESTINATIONS` payload
- use the legacy `N8N_WEBHOOK_URL` fallback only if you are intentionally
  supporting older workflow wiring
- keep `/api/automation/intake-to-app-dispatch` pointed at app-owned dispatch
  only. The route fails closed unless the organization has completed app intake
  and has an active Stripe-backed subscription stored in Postgres; purchased
  plan fields in external payloads are treated as context, not authority.

### n8n webhook cutover

- Test or staging URLs belong only in non-production environments.
- Production launch should use live n8n webhook URLs inside
  `N8N_WORKFLOW_DESTINATIONS`.
- Do not rely on `N8N_WEBHOOK_URL` for first-customer production cutover; it is
  a compatibility fallback, not the preferred launch path.

### Database and Prisma

- `DATABASE_URL`

Prisma client generation still needs to match the deployed schema and app code.

### Local or dev only if applicable

- `LOG_LEVEL`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX_REQUESTS`
- `WEBHOOK_RATE_LIMIT_WINDOW_MS`
- `WEBHOOK_RATE_LIMIT_MAX_REQUESTS`
- `WORKFLOW_DISPATCH_TIMEOUT_MS`
- `WORKFLOW_DISPATCH_STALE_MINUTES`
- `INTERNAL_ADMIN_EMAILS`

### Optional but recommended integrations

Set if the first-customer flow depends on them:

- `OPENAI_REASONING_MODEL`
- `AI_EXECUTION_TIMEOUT_MS`
- `NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL`
- `HUBSPOT_SYNC_ENABLED`
- `HUBSPOT_ACCESS_TOKEN`
- `HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID`
- `APOLLO_API_KEY`
- `APOLLO_API_BASE_URL`

Apollo is currently optional enrichment-only for n8n/operator workflows. No
app-owned launch-critical Apollo client is wired in this repo today. The repo
does include a project-scoped Codex MCP server that forwards the same Apollo
env vars for operator prospecting and enrichment work.
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`

## Redeploy caveat

- Changes to `NEXT_PUBLIC_*` values require a redeploy because they are embedded
  into the Next.js build output.
- Changes to server-only values should also be treated as redeploy-required for
  first-customer operations so Route Handlers, Prisma-backed server code, and
  webhook callbacks all restart against the same configuration set.
- Vercel Hobby projects cannot deploy sub-daily cron schedules. The repo's
  built-in email-dispatch cron is therefore set to run once per day at 14:00
  UTC until the project is upgraded or that job is moved to a different
  scheduler.

## Required verification order

1. Run:
   - from the repo root: `pnpm integration:status`
   - from the repo root: `pnpm preflight:first-customer:env`
   - from the repo root: `pnpm preflight:first-customer`
   - or from `apps/web`: the same commands through that package
2. Interpret the results correctly:
- `integration:status` checks whether Neon, Vercel, Stripe, n8n, LangGraph/OpenAI, HubSpot, Apollo, and Dify look wired from local env files plus `.vercel/project.json`
- `integration:status` treats Stripe as incomplete unless the canonical secret, webhook, and all canonical price/product envs are present, so partial commercial env setup no longer shows as configured
- `integration:status` treats n8n as incomplete unless the paid-flow `auditRequested` destination actually resolves, so a non-empty `N8N_WORKFLOW_DESTINATIONS` value without that entry still shows up as missing
- `integration:status` treats the OpenAI/LangGraph path as incomplete unless `AI_EXECUTION_DISPATCH_SECRET`, `OPENAI_API_KEY`, and `OPENAI_MODEL` are all present, because n8n still needs the shared auth secret to call the app-owned execute route
- `integration:status` is a presence-only snapshot; it treats Apollo and Dify as optional integrations and reports legacy `N8N_WEBHOOK_URL` fallback separately from explicit `N8N_WORKFLOW_DESTINATIONS`
   - `integration:status` does not verify live API credentials, Stripe webhook registration, n8n workflow existence, or HubSpot write scopes
   - `preflight:first-customer:env` only checks config presence and required-vs-optional coverage
   - `preflight:first-customer` checks repo-owned safety assumptions and fail-closed launch conditions
   - neither command proves live third-party connectivity or external dashboard setup
3. Run focused app checks:
   - `pnpm --filter @evolve-edge/db run generate`
   - `.\node_modules\.bin\tsc.cmd --noEmit`
   - launch-critical focused tests
   - if Sentry is not installed in the current workspace, confirm the app still
     compiles and runs with Sentry env vars unset; Sentry capture should be
     treated as optional observability, not a launch blocker by itself
4. Verify one Stripe webhook flow:
   - `BillingEvent`
   - `RoutingSnapshot`
   - `WorkflowDispatch`
   - missing or invalid webhook signatures fail closed with `400`
   - duplicate deliveries do not overwrite a terminal `BillingEvent`
5. Verify one n8n callback flow:
   - status callback accepted
   - report-ready callback accepted
   - report-writeback can reconcile customer-run report-generated or delivered milestones
   - stale `WorkflowDispatch` rows do not remain permanently `DISPATCHING`
6. Verify one signed report export flow:
   - delivered report succeeds
   - undelivered report fails closed
7. Verify one paid-only delivery flow:
   - the org has an app-side subscription in `ACTIVE` or `GRACE_PERIOD`
   - an unpaid or past-due org cannot mark the report delivered
   - a paid org can deliver the report and queue customer email safely
8. Verify queued email dispatch:
   - `GET /api/internal/jobs/run?job=dispatch-email-notifications` succeeds with `CRON_SECRET`
   - a delivered report creates one immediate email plus 3-day and 7-day queued follow-ups
9. Verify operators can use:
   - `/admin`
   - `/admin/queues`
   - `/admin/accounts/[organizationId]`
   - `/api/fulfillment/health` reconciliation output
   - account-level fulfillment drift and recovery details inside `/admin/accounts/[organizationId]`

## No-go conditions

Do not launch a first customer if any of these are still true:

- `pnpm preflight:first-customer` fails with errors
- `tsc --noEmit` fails
- Stripe canonical price or product envs are missing
- `N8N_WORKFLOW_DESTINATIONS` is missing or incomplete for the live flow
- `N8N_WORKFLOW_DESTINATIONS` is present but does not include a valid
  `auditRequested` destination
- `AI_EXECUTION_PROVIDER`, `AI_EXECUTION_DISPATCH_SECRET`, `OPENAI_API_KEY`, or `OPENAI_MODEL` is missing
- queued email dispatch is not schedulable because `CRON_SECRET`, `NOTIFICATION_DISPATCH_SECRET`, `EMAIL_FROM_ADDRESS`, or `RESEND_API_KEY` is missing
- Resend webhook processing is not safely enabled because `RESEND_WEBHOOK_SIGNING_SECRET` is missing
- production is still relying on legacy `N8N_WEBHOOK_URL` fallback
- signed report auth is not enforced
- operators cannot inspect queue findings in the app
- workflow dispatch rows are getting stuck in `DISPATCHING` without recovery or operator visibility

## Notes on live verification

- This repo now includes env-status and preflight commands.
- `pnpm integration:status` gives the quickest app-owned snapshot of whether the repo is pointed at Neon, linked to Vercel, and configured for Stripe, n8n, LangGraph/OpenAI, HubSpot, optional Apollo enrichment, and rollback-only Dify.
- `pnpm preflight:first-customer:env` is a config-coverage check only.
- `pnpm preflight:first-customer` validates repo-owned safety assumptions and
  fail-closed launch conditions.
- Neither command validates third-party connectivity on its own.
- Live verification of Vercel, Stripe webhook registration, and n8n endpoint
  reachability still requires real environment access and credentials.
- If the local workspace is not linked to Vercel or the Vercel connector is not
  authenticated, treat environment population as a manual operator step.
- Treat n8n webhook URL cutover as an environment update plus redeploy.
- Treat email-dispatch scheduling as an environment update plus redeploy because `apps/web/vercel.json` now expects a Vercel cron for `dispatch-email-notifications`.
- After cutover, send one controlled audit request and confirm the
  `WorkflowDispatch` row, destination URL selection, and downstream n8n
  execution all reflect the production workflow destination.
- Treat first-customer launch as `no-go` until both repo-owned checks pass and
  at least one real Stripe webhook path, one real n8n callback path, one signed
  report access path, and operator access to `/admin` are manually verified in
  the target environment.

## Related docs

- [first-customer-launch-checks.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/first-customer-launch-checks.md)
- [end-to-end-paid-flow-smoke-test.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/end-to-end-paid-flow-smoke-test.md)
- [stripe-n8n-dify-hubspot-integration.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/stripe-n8n-dify-hubspot-integration.md)
- [security-foundation.md](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/security-foundation.md)
