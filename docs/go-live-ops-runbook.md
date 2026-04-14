# Evolve Edge Go-Live Ops Runbook

## Critical environment variables

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `AUTH_MODE`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `INTERNAL_ADMIN_EMAILS`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_SCALE_ANNUAL`
  - `STRIPE_PRICE_ENTERPRISE_ANNUAL`
  - `OUTBOUND_DISPATCH_SECRET`
  - `PROVISION_ORG_API_TOKEN`
  - `N8N_WORKFLOW_DESTINATIONS`
  - `HUBSPOT_ACCESS_TOKEN`

Legacy `growth` Stripe envs may still exist in older environments, but they are
compatibility-only and should not be treated as the canonical go-live path.
- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `NOTIFICATION_DISPATCH_SECRET`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `DIFY_DISPATCH_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `OPS_ALERT_WEBHOOK_URL` (optional)
- `OPS_ALERT_WEBHOOK_SECRET` (optional)

## Critical webhook / internal endpoints

- Stripe webhook: `/api/stripe/webhook`
- Domain event dispatcher: `/api/internal/domain-events/dispatch`
- Dify analysis dispatcher: `/api/internal/analysis/dispatch`
- Notification dispatcher: `/api/internal/notifications/dispatch`
- Renewal reminder queue: `/api/internal/notifications/renewals`
- Scheduled jobs runner: `/api/internal/jobs/run`
- Ops readiness: `/api/internal/ops/readiness`
- Org provisioning handoff: `/api/internal/provision-org`

## Retry / recovery procedures

### Stripe webhook failures
- Check `/admin` for failed billing events and subscription state drift
- Re-send the event from Stripe dashboard or Stripe CLI
- Confirm `BillingEvent.status` moves to `PROCESSED`

### n8n / outbound delivery failures
- Check failed webhook deliveries in `/admin`
- Validate `N8N_WORKFLOW_DESTINATIONS`
- Run the dispatcher manually with `POST /api/internal/domain-events/dispatch`

### Dify analysis failures
- Check failed analysis jobs in `/admin`
- Validate Dify credentials and workflow configuration
- Re-run analysis safely with `POST /api/internal/analysis/dispatch`

### Cron / scheduled job failures
- Check recent job runs in `/admin`
- Validate `vercel.json` cron config and `CRON_SECRET`
- Run jobs manually with `POST /api/internal/jobs/run`

### Renewal reminders / notification failures
- Check failed email notifications in `/admin`
- Validate email provider env vars
- Re-run `POST /api/internal/notifications/dispatch`
- Re-run `POST /api/internal/notifications/renewals`

## Go-live verification checklist

- Sign-in works
- Onboarding completes
- Assessment creation and submit works
- Dify analysis dispatch works
- Report generation works
- Report delivery works
- Stripe webhook processes successfully
- n8n deliveries succeed
- Scheduled jobs route runs cleanly
- `/admin` shows healthy or understandable degraded state
- `/api/internal/ops/readiness` returns an accurate snapshot

## Fulfillment verification checklist

Use this as the final operator checklist for fulfillment readiness in the target
environment.

1. Fulfillment health route
   - Verify `GET /api/fulfillment/health` exists and is reachable.
   - Expected: returns truthful route-liveness plus compact fulfillment status
     or counts.
   - If the route is missing, treat fulfillment verification as incomplete.
2. Fulfillment dispatch-health route
   - Verify `GET /api/fulfillment/dispatch-health` exists and is reachable.
   - Expected: returns truthful dispatch target configuration and a recent
     outcome when the system stores one; otherwise `recentOutcome` or similar
     should be explicitly `null`.
   - If the route is missing, treat dispatch verification as incomplete.
3. Manual fulfillment run
   - Verify the repo-owned fulfillment run path exists and can be invoked in the
     deployed environment.
   - Expected: the run advances only the items operators expect to move and does
     not fabricate success.
4. Cron expectation
   - Verify the deployed environment includes the intended fulfillment cron
     schedule.
   - Expected: operators know the cadence and can confirm the route or job fires
     in production.
5. n8n webhook expectation
   - Verify the configured n8n workflow destinations are the production
     destinations intended for launch.
   - Expected: live webhook execution succeeds end to end and callback/writeback
     behavior remains healthy.

No-go rule for fulfillment:

- Do not treat fulfillment as operationally verified if the fulfillment health
  routes are missing, if the run path cannot be exercised safely, if cron is
  unverified, or if n8n dispatch has not been proven in the target environment.

## Common failure modes

- Missing or incorrect webhook secret
- Missing Stripe price mapping
- Broken n8n destination URL or signature mismatch
- Dify timeout or invalid structured output
- Notification provider misconfiguration
- Cron secret mismatch or Vercel cron not deployed
- Failed scheduled jobs causing retries to accumulate

## Internal response model

- Product truth stays in the app database
- Stripe remains billing truth
- n8n remains orchestration only
- Dify remains AI analysis only
- HubSpot remains CRM visibility only
- `/admin` is the first-line operational console
