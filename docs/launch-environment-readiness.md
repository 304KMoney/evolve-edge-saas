# Launch Environment Readiness

This runbook is the shortest practical setup order for getting Evolve Edge into
a first-customer-ready environment.

It is operational by design. It does not change architecture ownership.

## What the environment must preserve

- the Next.js app owns product and customer state
- Neon is the canonical database
- Stripe is payment-event authority only
- n8n is orchestration only
- Dify is AI execution only
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
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `REPORT_DOWNLOAD_REQUIRE_AUTH=true`

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

Recommended:

- include at least the live `auditRequested` destination
- keep callback and writeback secrets distinct when possible
- keep test/staging webhook URLs out of the production `N8N_WORKFLOW_DESTINATIONS` payload
- use the legacy `N8N_WEBHOOK_URL` fallback only if you are intentionally
  supporting older workflow wiring

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
- `INTERNAL_ADMIN_EMAILS`

### Optional but recommended integrations

Set if the first-customer flow depends on them:

- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `HUBSPOT_ACCESS_TOKEN`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`

## Redeploy caveat

- Changes to `NEXT_PUBLIC_*` values require a redeploy because they are embedded
  into the Next.js build output.
- Changes to server-only values should also be treated as redeploy-required for
  first-customer operations so Route Handlers, Prisma-backed server code, and
  webhook callbacks all restart against the same configuration set.

## Required verification order

1. Run:
   - from the repo root: `pnpm preflight:first-customer:env`
   - from the repo root: `pnpm preflight:first-customer`
   - or from `apps/web`: the same commands through that package
2. Interpret the results correctly:
   - `preflight:first-customer:env` only checks config presence and required-vs-optional coverage
   - `preflight:first-customer` checks repo-owned safety assumptions and fail-closed launch conditions
   - neither command proves live third-party connectivity or external dashboard setup
3. Run focused app checks:
   - `pnpm --filter @evolve-edge/db run generate`
   - `.\node_modules\.bin\tsc.cmd --noEmit`
   - launch-critical focused tests
4. Verify one Stripe webhook flow:
   - `BillingEvent`
   - `RoutingSnapshot`
   - `WorkflowDispatch`
   - missing or invalid webhook signatures fail closed with `400`
   - duplicate deliveries do not overwrite a terminal `BillingEvent`
5. Verify one n8n callback flow:
   - status callback accepted
   - report-ready callback accepted
6. Verify one signed report export flow:
   - delivered report succeeds
   - undelivered report fails closed
7. Verify operators can use:
   - `/admin`
   - `/admin/queues`
   - `/admin/accounts/[organizationId]`

## No-go conditions

Do not launch a first customer if any of these are still true:

- `pnpm preflight:first-customer` fails with errors
- `tsc --noEmit` fails
- Stripe canonical price or product envs are missing
- `N8N_WORKFLOW_DESTINATIONS` is missing or incomplete for the live flow
- production is still relying on legacy `N8N_WEBHOOK_URL` fallback
- signed report auth is not enforced
- operators cannot inspect queue findings in the app

## Notes on live verification

- This repo now includes env-status and preflight commands.
- `pnpm preflight:first-customer:env` is a config-coverage check only.
- `pnpm preflight:first-customer` validates repo-owned safety assumptions and
  fail-closed launch conditions.
- Neither command validates third-party connectivity on its own.
- Live verification of Vercel, Stripe webhook registration, and n8n endpoint
  reachability still requires real environment access and credentials.
- If the local workspace is not linked to Vercel or the Vercel connector is not
  authenticated, treat environment population as a manual operator step.
- Treat n8n webhook URL cutover as an environment update plus redeploy.
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
