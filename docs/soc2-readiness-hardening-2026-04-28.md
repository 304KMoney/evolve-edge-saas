# SOC 2 Readiness Hardening - April 28, 2026

## Scope

This pass closed four pre-handoff readiness gaps:

- Durable inbound idempotency for Resend webhooks.
- PII minimization in webhook logs, alerts, and legacy Stripe responses.
- Single production Stripe ingress.
- Repeatable local/CI test evidence through the normal web test script.

## Source-Of-Truth Boundaries

- Stripe billing events continue to use `BillingEvent` as the durable receipt and reconciliation boundary.
- Non-billing inbound provider webhooks now use `InboundWebhookReceipt`.
- Resend remains an email delivery signal only; it does not own customer state, billing state, report state, or lifecycle state.
- `/api/stripe/webhook` is the production Stripe endpoint. `/api/webhooks/stripe` is legacy compatibility only and returns `410` in production.

## Schema Change

Migration:

```sh
packages/db/prisma/migrations/20260428090000_inbound_webhook_receipts/migration.sql
```

New table:

- `InboundWebhookReceipt`

New enum:

- `InboundWebhookReceiptStatus`

Operators must apply Prisma migrations before relying on Resend webhook processing in production:

```sh
pnpm db:migrate:deploy
```

## Operational Notes

- Resend webhook processing now verifies the Svix signature before claiming a durable receipt.
- Duplicate Resend `svix-id` values return a deduped or in-flight response instead of reprocessing side effects.
- Resend operational findings and alerts use masked recipient metadata and no longer persist email subject in alert metadata.
- Legacy Stripe webhook responses no longer return customer email or name, even outside production.

## Verification

Run before handoff:

```sh
pnpm --filter @evolve-edge/web typecheck
pnpm --filter @evolve-edge/web test
pnpm preflight:first-customer:env
pnpm preflight:first-customer
```

Live production verification is still required for external systems: Stripe dashboard endpoint registration, Resend webhook registration, n8n callback/writeback, signed report export, evidence upload, and one controlled paid-flow smoke test.
