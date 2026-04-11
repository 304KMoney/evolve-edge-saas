# How To Operate The Platform

## Purpose

This is the internal operating guide for a founder, delivery lead, or ops hire.

## Daily Operator Checks

1. Open `/admin`
2. Review:
   - failed runs
   - founder review queue
   - delivery review queue
   - follow-up due accounts
   - recent internal notes
3. Review Stripe/billing failures
4. Review failed outbound deliveries
5. Review customer accounts with `ACTION_REQUIRED`

## Customer Journey Surfaces

### Lead And Sales

- customer control plane: `/admin/customers/[customerAccountId]`
- org detail: `/admin/accounts/[organizationId]`

Use these to:

- inspect current lifecycle stage
- update next action
- add internal notes
- review founder escalation state

### Delivery

- report delivery detail: `/dashboard/reports/[reportId]`
- executive package visibility: org admin detail
- customer run visibility: org admin detail

Use these to:

- confirm reports are generated
- confirm QA and founder review states
- confirm delivery and briefing progress

### Monitoring And Retention

- customer monitoring workspace: `/dashboard/monitoring`
- retention summary: dashboard and settings
- engagement history: `/dashboard/programs`

Use these to:

- review recurring posture
- inspect remediation continuity
- confirm the account has ongoing reasons to stay subscribed

## Failure Handling

### Failed Customer Runs

If a run is `ACTION_REQUIRED`:

1. open `/admin/accounts/[organizationId]`
2. review the current step and recovery hint
3. confirm the upstream issue is actually fixed
4. retry only with a written reason

### Failed Outbound Sync

If HubSpot or n8n delivery fails:

1. inspect webhook failure surfaces in admin
2. verify the external endpoint and shared secret
3. retry only after the destination is healthy

### Billing Problems

If a workspace is read-only or past due:

1. inspect subscription state in admin
2. route owners to Stripe portal
3. avoid changing access manually unless code explicitly supports it

## Local Setup For Engineers

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

## Required Secrets Before Go-Live

- `DATABASE_URL`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `INTERNAL_ADMIN_EMAILS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `CRON_SECRET`
- `DIFY_API_KEY`
- `HUBSPOT_ACCESS_TOKEN`

## Deferred Technical Debt

- admin access is still allowlist-based, not fully role-granular
- operator retries are form-confirmed, not approval-workflow based
- some docs still live in phase files instead of a single consolidated handbook
