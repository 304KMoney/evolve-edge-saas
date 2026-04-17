# Environment Parity Guide (Local vs Vercel vs Codex)

## Goal
Prevent silent config drift across local development, Codex execution, and Vercel environments.

## Command
Run from repo root:

```bash
pnpm --filter @evolve-edge/web env:parity:audit
```

This prints **present/missing only** and never prints secret values.

## Comparison workflow
1. Run audit locally.
2. Run audit in Codex runtime.
3. Compare against Vercel env UI values by key name.
4. Fix missing required keys first; then review optional keys by integration scope.

## Critical startup guards
The app fails fast when required keys for active integrations are missing, including database/auth and any enabled Stripe/n8n/Dify/Resend surfaces.

## Common drift patterns
- Local has `DIFY_BASE_URL` but Vercel only sets `DIFY_API_BASE_URL` (or vice-versa).
- n8n callback secret present in one environment but not another.
- Resend webhook signing secret missing in staging.
- Preview Vercel environment missing auth/session vars.

## Safe resolution order
1. Database and auth/session.
2. Stripe + n8n dispatch/callback.
3. Dify execution.
4. HubSpot projection.
5. Monitoring + email webhooks.
