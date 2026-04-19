# Monitoring Incident Runbook

## 1) App down / runtime errors
1. Check Vercel deployment health and function logs.
2. Check Sentry for fresh exceptions and impacted routes.
3. Validate `/api/health/status` for env parity + DB health.
4. Roll back to previous deployment if impact is broad.

## 2) Webhook failures (Stripe / Resend / internal)
1. Confirm signature secret validity and endpoint URL.
2. Review route-level logs (`webhooks.*` events).
3. For Stripe: verify replay with known event in dashboard.
4. For Resend: replay webhook and verify idempotent behavior.

## 3) n8n execution failures
1. Inspect n8n execution details + failing node.
2. Confirm Error Trigger workflow emitted operator alert.
3. Confirm callback to `/api/internal/workflows/failed` succeeded.
4. If callback failed, verify `N8N_CALLBACK_SECRET` parity.

## 4) Email delivery failures
1. Inspect `EmailNotification` failure entries in app admin data views.
2. Inspect `/api/webhooks/resend` logs for bounce/complaint/failure events.
3. Validate recipient address and provider policy status.
4. Requeue customer communication via safe retry path.

## 5) Missing/invalid env vars
1. Run `pnpm --filter @evolve-edge/web env:parity:audit` locally/Codex.
2. Compare with Vercel env configuration.
3. Redeploy after env correction.

## Test plan
- Intentional app error capture: throw controlled error in staging route and verify Sentry.
- Intentional failed n8n run: fail staging workflow node and verify Error Trigger + callback alert.
- Simulated email failure webhook: replay `email.bounced` payload to `/api/webhooks/resend`.
- Missing env startup test: unset required var and ensure startup fails with clear message.

## Rollback
- Disable Sentry by unsetting `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
- Disable Resend webhook in provider dashboard if causing noisy failures.
- Revert n8n Error Trigger workflow to previous version.
- Revert app commit and redeploy if monitoring code causes regressions.
