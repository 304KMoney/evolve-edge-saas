# Harshay Access Handoff

Prepared: April 27, 2026  
Audience: founder/operator and incoming engineer  
Purpose: give Harshay the access needed to hit the ground running without leaking secrets or weakening source-of-truth boundaries.

## Recommended Reply To Harshay

Hi Harshay,

Absolutely. I will grant access in batches as each system is ready. For security, I will send platform invitations directly where possible and put any required secrets in the shared password manager or secret vault rather than sending credentials in email or chat.

For Vercel, I will send the invitation to `harshay.imag3@gmail.com` so it matches the GitHub-linked email.

I will also share the repo `.env.example` and a short local setup note. I will not send my personal `.env` file directly because it may contain live credentials, webhook secrets, API keys, and production database connection strings. If local secrets are needed, I will provision scoped development or preview credentials and share those through the vault.

As access lands, please confirm each invite works and note any missing permissions in the shared checklist.

## What Is Acceptable To Share

Acceptable:

- Platform invitations sent from each vendor dashboard.
- Read-only or developer-scoped access by default.
- Preview/test-mode credentials for local development.
- Repo `.env.example` and environment key names.
- Secret values through a password manager or approved secret vault.
- A dedicated test user account for the Evolve Edge app.
- Links to runbooks, setup docs, and workflow diagrams.

Not acceptable:

- Sending `.env`, `.env.local`, Vercel env pulls, or database URLs over normal email/chat.
- Sharing your personal owner/admin login.
- Sharing production database write credentials unless explicitly needed and approved.
- Sharing unrestricted Stripe live-mode admin access on day one.
- Allowing n8n, HubSpot, Dify, or Stripe to become the source of truth for app state.

## Access Matrix

| System | Recommended Initial Access | How To Provide | Notes |
|---|---|---|---|
| GitHub | Repository write access | GitHub repo/team invite | Needed to clone, branch, open PRs, and inspect history. |
| Neon | Project member with least privilege available; read access first, write/migration only if needed | Neon project invite | Neon/Postgres is canonical persistence. Avoid production write access until scope requires it. |
| Dify | Viewer/developer access only if rollback/debugging is needed | Dify workspace invite | Dify is deprecated and retained as rollback compatibility only. Do not route new product state through Dify. |
| Evolve Edge test account | Dedicated non-production test user | Create app user or share one-time password via vault | Do not share founder/operator credentials. Prefer preview or staging account. |
| Stripe | Test-mode developer or read-only access first | Stripe team invite | Stripe is billing authority and payment-event source only. Avoid raw product-name inference downstream. |
| n8n | Workflow viewer/developer for relevant workflows | n8n user invite | n8n is orchestration only. It should view/manage/test workflow definitions, not own pricing, entitlements, or routing policy. |
| Sentry | Member with issue/project visibility | Sentry org/project invite | Enough to see errors, releases, traces, and environment tags. |
| HubSpot | CRM read/edit access scoped to integration objects | HubSpot user invite | HubSpot is CRM projection only, not billing or entitlement truth. |
| Vercel | Project developer access | Vercel invite to `harshay.imag3@gmail.com` | Include Preview and Production visibility. Give env write access only if he is expected to manage deploy config. |
| Secret vault | Scoped collection access | Password manager invite | Put local dev secrets and test credentials here, not in email/chat. |

## Local Environment Guidance

Share these files/docs first:

- `.env.example`
- `README.md`
- `docs/env-parity-guide.md`
- `docs/vercel-env-fill-sheet.md`
- `docs/team/engineering-access-checklist.md`
- `docs/team/harshay-day-one-package.md`

Use `.env.example` as the list of required keys. Create a Harshay-specific local `.env.local` by filling only development or preview-safe values from the vault.

Do not send these files directly:

- `.env`
- `.env.local`
- `.tmp-development-env-pull`
- `.tmp-preview-env-current`
- `.tmp-preview-env-pull*`
- `.tmp-production-env-pull`

Those files may contain secrets, live webhook keys, database URLs, API keys, or credentials.

## Minimum Local Secrets Harshay May Need

For local app boot and integration testing, provision scoped development or preview values for:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in test mode only
- canonical Stripe price/product IDs for test mode
- `N8N_WORKFLOW_DESTINATIONS` with non-production webhook URLs
- `N8N_CALLBACK_SHARED_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY` scoped to project/dev usage if live AI execution is in scope
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `RESEND_API_KEY` or email-provider sandbox key if email testing is in scope
- `HUBSPOT_ACCESS_TOKEN` only if CRM projection testing is in scope
- `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` only if local error reporting is desired

## Test User Account

Create a dedicated account such as:

- Email: `harshay+preview@evolveedgeai.com` or another approved test email
- Environment: Preview or local development
- Role: operator/admin only if he needs admin console access; otherwise standard customer/test account
- Delivery: send temporary password or magic-link setup through the vault or vendor invite flow

Record the account in the access checklist with:

- environment
- role
- expiration/review date
- who approved it

## Suggested Access Order

1. GitHub repo access.
2. Vercel project access using `harshay.imag3@gmail.com`.
3. Secret vault access with scoped local/preview secrets.
4. Neon preview database visibility.
5. Evolve Edge test user account.
6. Stripe test-mode access.
7. n8n workflow access.
8. Sentry project access.
9. HubSpot scoped access.
10. Dify viewer/developer access only for deprecated rollback/debug context.

## Verification Checklist

Ask Harshay to confirm:

- GitHub clone succeeds.
- `pnpm install` succeeds.
- `.env.local` is populated from vault values, not copied from founder machine files.
- `pnpm db:generate` succeeds.
- `pnpm ci:env:validate` succeeds or reports known missing optional integration keys.
- Local app boots.
- Test user login works.
- Vercel Preview deployments and logs are visible.
- Neon data visibility is sufficient for assigned work.
- Stripe test-mode products, prices, checkout sessions, and webhooks are visible.
- n8n workflow definitions and executions are visible.
- Sentry issues are visible.
- HubSpot integration objects are visible if in scope.

## Security Reminder For Harshay

Use the credentials only for Evolve Edge work, keep secrets in the approved vault, do not copy secrets into personal notes or unsecured files, and report lost access, suspicious activity, or accidental exposure immediately.

## Source-Of-Truth Boundaries

These boundaries should be included in the onboarding note:

- Next.js owns product logic and customer-visible state.
- Neon/Postgres is canonical persistence.
- Stripe is billing authority and payment-event source only.
- n8n is orchestration and async execution only.
- LangGraph is workflow orchestration only.
- OpenAI is model execution only.
- Dify is deprecated rollback compatibility only.
- HubSpot is CRM projection only.
- Hostinger is brochure/top-of-funnel only.
