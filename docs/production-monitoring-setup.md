# Production Monitoring Setup

## Scope
This setup covers:
- Next.js/Vercel runtime + frontend error monitoring (Sentry)
- n8n execution failure alerting
- Resend email delivery failure monitoring
- Environment parity guardrails and startup fail-fast checks

## Required env additions
- `SENTRY_DSN` (optional but required to enable server/runtime capture)
- `NEXT_PUBLIC_SENTRY_DSN` (optional but required to enable browser capture)
- `SENTRY_TRACES_SAMPLE_RATE` (optional; default `0`)
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (optional; default `0`)
- `RESEND_WEBHOOK_SIGNING_SECRET` (required when Resend email monitoring is enabled)

## App monitoring setup
1. Set Sentry DSN env vars in Vercel.
2. Deploy app.
3. Trigger a controlled staging error and confirm issue appears in Sentry.
4. Confirm request metadata is redacted (no auth/cookie/token leakage).

## Email failure monitoring setup (Resend)
1. Add webhook endpoint in Resend:
   - `POST https://<app-base-url>/api/webhooks/resend`
2. Subscribe to at least:
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
   - `email.delivery_delayed`
3. Set `RESEND_WEBHOOK_SIGNING_SECRET` from Resend dashboard.
4. Replay test payloads and verify app logs + operational alerts.

## n8n failure monitoring setup
Implement `docs/n8n-error-trigger-workflow-package.md` in n8n and verify:
- Error Trigger receives execution failures
- dedupe guard suppresses repeated noise
- callback to `/api/internal/workflows/failed` succeeds
- operator channel receives structured alerts

## Daily operator checks
1. `/api/health/status`
2. Sentry open issues and spike trends
3. n8n failed execution queue
4. app operational alerts + email failures
5. key webhook endpoint failure rates
