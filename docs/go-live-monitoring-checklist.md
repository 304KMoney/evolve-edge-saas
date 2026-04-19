# Go-Live Monitoring Checklist

## Pre-go-live configuration
- [ ] `pnpm --filter @evolve-edge/web env:parity:audit` shows no missing required vars.
- [ ] Sentry DSN configured (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`) for target environment.
- [ ] `OPS_ALERT_WEBHOOK_URL` configured for operator alert routing.
- [ ] n8n Error Trigger workflow deployed and active.
- [ ] Resend webhook endpoint configured at `/api/webhooks/resend`.
- [ ] Resend signing secret set (`RESEND_WEBHOOK_SIGNING_SECRET`).

## Health checks
- [ ] `GET /api/health/status` returns `200` and `ok=true`.
- [ ] Internal readiness route `/api/internal/ops/readiness` returns expected snapshot.
- [ ] Stripe webhook route(s) verified in Stripe dashboard.
- [ ] n8n callback bearer auth verified.

## Operator dashboards (first look during incident)
1. Vercel deployment + function logs.
2. Sentry Issues/Performance.
3. Evolve Edge operational alerts (OPS webhook destination).
4. Admin queue + email notification failures in app.
5. n8n executions/error-trigger workflow.
