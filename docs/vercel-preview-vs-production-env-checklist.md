# Vercel Preview vs Production Env Checklist

This checklist shows the safest current environment split for Evolve Edge on Vercel.

It is intentionally practical:

- Preview should be safe for validation
- Production should be safe for first-customer operations
- The app remains the system of record
- n8n remains orchestration only

## How to use this checklist

In Vercel, set values by environment:

- `Preview`
- `Production`

For each variable below, this document tells you whether to:

- keep the same value in both
- use different values in Preview and Production
- leave it unset in Preview unless you are intentionally testing that integration

## Set In Both Preview And Production

These should exist in both environments, but they usually should not share the exact same secret value unless noted.

### App and auth

- `AUTH_MODE=password`
- `AUTH_SECRET`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `DATABASE_URL`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `REPORT_DOWNLOAD_REQUIRE_AUTH=true`
- `OUTBOUND_DISPATCH_SECRET`

Rule:

- same key names in both environments
- different secret values are preferred between Preview and Production
- `DATABASE_URL` should point to the correct database for that environment

### n8n callback security

- `N8N_CALLBACK_SHARED_SECRET`

Compatibility note:

- if you also keep `N8N_CALLBACK_SECRET`, it should match the same intended callback secret for that environment
- the app accepts either name, but `N8N_CALLBACK_SHARED_SECRET` is the preferred current setup

Rule:

- set in both Preview and Production
- use different secret values between Preview and Production

### Public browser-safe values

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CONTACT_SALES_URL`
- `NEXT_PUBLIC_SALES_CONTACT_EMAIL`

Rule:

- set in both
- values should differ if the preview hostname differs from the production hostname
- any change to `NEXT_PUBLIC_*` requires redeploy

## Usually Different Between Preview And Production

These should normally be different across environments.

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_MONTHLY`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

Recommended values:

- Preview: Stripe test-mode values
- Production: Stripe live-mode values

Do not mix:

- test secret key with live price IDs
- live secret key with test webhook secret

### n8n destinations

- `N8N_WORKFLOW_DESTINATIONS`
- optional fallback: `N8N_WEBHOOK_URL`
- optional fallback: `N8N_WEBHOOK_SECRET`

Recommended values:

- Preview: preview or staging n8n webhook URLs only
- Production: production n8n webhook URLs only

Rule:

- do not point Preview at the production n8n workflow unless you are intentionally doing a controlled live validation
- do not point Production at preview or staging n8n URLs
- prefer `N8N_WORKFLOW_DESTINATIONS`
- treat `N8N_WEBHOOK_URL` as compatibility fallback only

### HubSpot

- `HUBSPOT_ACCESS_TOKEN`

Recommended values:

- Preview: sandbox token or leave unset if CRM projection is not being tested
- Production: live token

### Dify

- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `DIFY_WORKFLOW_VERSION`
- `DIFY_DISPATCH_SECRET`

Recommended values:

- Preview: non-production Dify workspace if available
- Production: live Dify workspace

## Safe To Leave Unset In Preview Unless You Are Testing That Slice

- `HUBSPOT_ACCESS_TOKEN`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`

Note:

- leaving these unset in Preview is safer than accidentally projecting preview data into live CRM or live alerting channels

## Exact n8n values to set

### Preview

Set:

- `N8N_CALLBACK_SHARED_SECRET=<preview-shared-secret>`

Choose one of these two patterns:

Preferred:

- `N8N_WORKFLOW_DESTINATIONS=<preview-json>`

Compatibility-only fallback:

- `N8N_WEBHOOK_URL=https://preview-n8n.example.com/webhook/...`

### Production

Set:

- `N8N_CALLBACK_SHARED_SECRET=<production-shared-secret>`

Choose one of these two patterns:

Preferred:

- `N8N_WORKFLOW_DESTINATIONS=<production-json>`

Compatibility-only fallback:

- `N8N_WEBHOOK_URL=https://n8n.example.com/webhook/...`

## Recommended `N8N_WORKFLOW_DESTINATIONS` values

### Preview example

```json
[
  {
    "name": "auditRequested",
    "url": "https://preview-n8n.example.com/webhook/audit-requested",
    "secret": "preview-shared-secret",
    "events": ["audit.requested"]
  }
]
```

### Production example

```json
[
  {
    "name": "auditRequested",
    "url": "https://n8n.example.com/webhook/audit-requested",
    "secret": "production-shared-secret",
    "events": ["audit.requested"]
  }
]
```

## Exact callback auth rule

The n8n callback nodes should send:

```text
Authorization: Bearer <N8N_CALLBACK_SHARED_SECRET>
```

This applies to:

- `POST /api/internal/workflows/status`
- `POST /api/internal/workflows/report-ready`
- `POST /api/internal/workflows/failed`

## Production no-go rules

Do not mark Production ready if any of these are true:

- `N8N_WORKFLOW_DESTINATIONS` is missing and you are relying on `N8N_WEBHOOK_URL`
- `N8N_CALLBACK_SHARED_SECRET` is missing
- Preview secrets were copied into Production unchanged
- Production `NEXT_PUBLIC_APP_URL` still points to a preview hostname
- Production Stripe keys are still test-mode keys
- Production n8n URLs still point to preview or staging workflows

## Fast Vercel operator checklist

### Preview

- `NEXT_PUBLIC_APP_URL` points to preview domain
- `DATABASE_URL` points to preview-safe database
- Stripe keys are test-mode
- `N8N_CALLBACK_SHARED_SECRET` is set
- `N8N_WORKFLOW_DESTINATIONS` points to preview n8n
- optional external integrations are sandboxed or unset

### Production

- `NEXT_PUBLIC_APP_URL` points to live domain
- `DATABASE_URL` points to production Neon
- Stripe keys are live-mode
- `N8N_CALLBACK_SHARED_SECRET` is set
- `N8N_WORKFLOW_DESTINATIONS` points to production n8n
- `REPORT_DOWNLOAD_REQUIRE_AUTH=true`
- callback nodes in n8n use the production shared secret

## Related docs

- [launch-environment-readiness.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/launch-environment-readiness.md)
- [first-customer-launch-checks.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/first-customer-launch-checks.md)
- [n8n-node-contract-sheet.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/n8n-node-contract-sheet.md)
- [phase-62-backend-commercial-routing-layer.md](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/docs/phase-62-backend-commercial-routing-layer.md)
