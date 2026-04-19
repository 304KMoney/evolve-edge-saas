# Production Readiness Hardening (Stripe + n8n + Dify)

## What this adds

- A strict Stripe ingestion endpoint at `POST /api/webhooks/stripe` for `checkout.session.completed` only.
- Runtime boot validation for launch-critical environment variables, with redacted startup status logging.
- Dify base URL alias support (`DIFY_BASE_URL` as compatibility alias for `DIFY_API_BASE_URL`).
- A normalized Dify section contract for report payload consumers:
  - `executive_summary`
  - `risk_analysis`
  - `risk_scoring`
  - `remediation_roadmap`

## Source-of-truth boundaries

- Stripe remains payment authority; the app persists customer-visible workflow state.
- Neon/Postgres remains canonical persistence for routing snapshots, delivery state, and workflow dispatch.
- n8n remains orchestration-only; callbacks continue to be app-authenticated bearer writebacks.
- Dify remains execution-only; outputs must pass backend normalization before use.

## Required env for runtime boot validation

The app now fails fast if any of these are not configured:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `HUBSPOT_ACCESS_TOKEN`
- `N8N_WEBHOOK_URL`
- `DIFY_API_KEY`
- `DIFY_API_BASE_URL` (or alias `DIFY_BASE_URL`)
- `NEXT_PUBLIC_APP_URL` (or alias `APP_BASE_URL`)
- `N8N_CALLBACK_SECRET` (or alias `N8N_SECRET`)

Only presence booleans are logged at boot; values are never logged.

## Operator setup notes

1. Keep Stripe endpoint `POST /api/stripe/webhook` for existing event families.
2. Configure Stripe to also send `checkout.session.completed` to `POST /api/webhooks/stripe` for strict intake.
3. Ensure n8n callback routes use bearer auth with `N8N_CALLBACK_SECRET` (or `N8N_WRITEBACK_SECRET` where applicable).

## Troubleshooting

- **Boot fails with missing env variables:** fix deployment env settings, then redeploy.
- **Stripe strict endpoint returns ignored=true:** ensure event type is exactly `checkout.session.completed`.
- **Dify execution failing due base URL:** set `DIFY_API_BASE_URL`; `DIFY_BASE_URL` is accepted as compatibility alias.

## Deferred items

- Existing orchestration retry strategy in `workflow-dispatch.ts` remains authoritative; no broad dispatch policy rewrite was applied in this hardening slice.
