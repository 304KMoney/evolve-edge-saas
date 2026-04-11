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
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `OUTBOUND_DISPATCH_SECRET`
- `PROVISION_ORG_API_TOKEN`
- `N8N_WORKFLOW_DESTINATIONS`
- `HUBSPOT_ACCESS_TOKEN`
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
