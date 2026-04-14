# Vercel Env Fill Sheet

Use this as the smallest possible line-by-line sheet for populating Vercel.

Fill in the blank values for:

- `Preview`
- `Production`

Do not paste this file into the app. It is an operator worksheet only.

## Public

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `____________________________` | `____________________________` | Preview should use preview hostname. Production should use live domain. |
| `NEXT_PUBLIC_CONTACT_SALES_URL` | `____________________________` | `____________________________` | Usually `/contact-sales` on the matching environment domain. |
| `NEXT_PUBLIC_SALES_CONTACT_EMAIL` | `____________________________` | `____________________________` | Can be the same in both if intended. |

## Auth

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `AUTH_MODE` | `password` | `password` | Keep explicit. |
| `AUTH_SECRET` | `____________________________` | `____________________________` | Use different secrets between environments. |
| `AUTH_ACCESS_EMAIL` | `____________________________` | `____________________________` | Operator login email. |
| `AUTH_ACCESS_PASSWORD` | `____________________________` | `____________________________` | Use different passwords between environments. |

## Database

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | `____________________________` | `____________________________` | Preview should not point to production DB unless intentionally sharing. |

## Stripe

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `____________________________` | `____________________________` | Preview should usually be test-mode. Production should be live-mode. |
| `STRIPE_WEBHOOK_SECRET` | `____________________________` | `____________________________` | Must match the endpoint and Stripe mode for that environment. |
| `STRIPE_PRICE_STARTER_MONTHLY` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRICE_STARTER_ANNUAL` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRICE_SCALE_MONTHLY` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRICE_SCALE_ANNUAL` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRICE_ENTERPRISE_ANNUAL` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRODUCT_STARTER` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRODUCT_SCALE` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |
| `STRIPE_PRODUCT_ENTERPRISE` | `____________________________` | `____________________________` | Keep mode-consistent with the secret key. |

## n8n

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `OUTBOUND_DISPATCH_SECRET` | `____________________________` | `____________________________` | Different values preferred. |
| `N8N_CALLBACK_SHARED_SECRET` | `____________________________` | `____________________________` | n8n callback routes should send this as bearer auth. |
| `N8N_CALLBACK_SECRET` | `____________________________` | `____________________________` | Optional compatibility alias. Usually set equal to the shared secret for that environment. |
| `N8N_WRITEBACK_SECRET` | `____________________________` | `____________________________` | Optional. Can be separate or omitted if you rely on callback secret fallback. |
| `N8N_WORKFLOW_DESTINATIONS` | `____________________________` | `____________________________` | Preferred. Use preview n8n URLs in Preview, production n8n URLs in Production. |
| `N8N_WEBHOOK_URL` | `____________________________` | `____________________________` | Compatibility fallback only. Leave blank if using `N8N_WORKFLOW_DESTINATIONS`. |
| `N8N_WEBHOOK_SECRET` | `____________________________` | `____________________________` | Optional legacy fallback secret. |
| `N8N_WEBHOOK_TIMEOUT_MS` | `10000` | `10000` | Keep default unless you have a reason to change it. |
| `WORKFLOW_DISPATCH_TIMEOUT_MS` | `10000` | `10000` | Keep default unless you have a reason to change it. |

### `N8N_WORKFLOW_DESTINATIONS` fill block

Preview:

```json
[{"name":"auditRequested","url":"____________________________","secret":"____________________________","events":["audit.requested"]}]
```

Production:

```json
[{"name":"auditRequested","url":"____________________________","secret":"____________________________","events":["audit.requested"]}]
```

## Reports and security

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `REPORT_DOWNLOAD_SIGNING_SECRET` | `____________________________` | `____________________________` | Different values preferred. |
| `REPORT_DOWNLOAD_REQUIRE_AUTH` | `true` | `true` | Keep enforced outside local development. |

## HubSpot

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | `____________________________` | `____________________________` | Use sandbox in Preview or leave blank if not testing CRM projection. |
| `HUBSPOT_API_BASE_URL` | `https://api.hubapi.com` | `https://api.hubapi.com` | Usually same in both. |
| `HUBSPOT_TIMEOUT_MS` | `10000` | `10000` | Usually same in both. |

## Dify

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `DIFY_API_BASE_URL` | `____________________________` | `____________________________` | Use non-production workspace in Preview if available. |
| `DIFY_API_KEY` | `____________________________` | `____________________________` | Different values preferred. |
| `DIFY_WORKFLOW_ID` | `____________________________` | `____________________________` | Environment-specific if workflows differ. |
| `DIFY_WORKFLOW_VERSION` | `v1` | `v1` | Keep unless you intentionally version differently. |
| `DIFY_TIMEOUT_MS` | `20000` | `20000` | Keep default unless needed. |
| `DIFY_DISPATCH_SECRET` | `____________________________` | `____________________________` | Different values preferred. |

## Email and alerts

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `EMAIL_PROVIDER` | `resend` | `resend` | Keep same if intended. |
| `RESEND_API_KEY` | `____________________________` | `____________________________` | Sandbox or non-production sender in Preview if available. |
| `EMAIL_FROM_ADDRESS` | `____________________________` | `____________________________` | Use production sender only in Production. |
| `EMAIL_REPLY_TO` | `____________________________` | `____________________________` | Optional. |
| `EMAIL_TIMEOUT_MS` | `10000` | `10000` | Usually same in both. |
| `OPS_ALERT_WEBHOOK_URL` | `____________________________` | `____________________________` | Optional. Preview can be blank. |
| `OPS_ALERT_WEBHOOK_SECRET` | `____________________________` | `____________________________` | Optional. Preview can be blank. |

## Operational defaults

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `LOG_LEVEL` | `info` | `info` | Adjust only if needed. |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | `60000` | Usually same in both. |
| `API_RATE_LIMIT_MAX_REQUESTS` | `60` | `60` | Usually same in both. |
| `WEBHOOK_RATE_LIMIT_WINDOW_MS` | `60000` | `60000` | Usually same in both. |
| `WEBHOOK_RATE_LIMIT_MAX_REQUESTS` | `30` | `30` | Usually same in both. |

## Quick no-go reminders

- Do not use preview n8n URLs in Production.
- Do not use test Stripe keys in Production.
- Do not leave `N8N_CALLBACK_SHARED_SECRET` blank in Production.
- Do not leave `N8N_WORKFLOW_DESTINATIONS` blank in Production unless you are intentionally using the legacy fallback.
- Do not point `NEXT_PUBLIC_APP_URL` at a preview hostname in Production.

## Related docs

- [vercel-preview-vs-production-env-checklist.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/vercel-preview-vs-production-env-checklist.md)
- [n8n-node-contract-sheet.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/n8n-node-contract-sheet.md)
