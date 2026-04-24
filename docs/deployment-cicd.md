# CI/CD And Deployment Flow

Evolve Edge now uses a production-safe GitHub Actions flow with three layers:

1. CI validation on pushes and pull requests
2. Preview deployment after validation passes
3. Production deployment only after validation and preview both pass

## Workflows

### CI

File:

- `.github/workflows/ci.yml`

What it does:

- installs dependencies
- validates required CI environment variables
- runs typecheck
- runs lint
- runs unit and integration tests
- runs AI regression tests
- runs the mocked AI eval harness

If any step fails, the workflow fails and deployment should not proceed.

### Deploy

File:

- `.github/workflows/deploy.yml`

Trigger:

- manual `workflow_dispatch`

Inputs:

- `target=preview`
- `target=production`

Flow:

1. run the same validation gate as CI
2. validate preview deployment secrets
3. build and deploy to Vercel Preview
4. if `target=production`, validate production deployment secrets
5. deploy to Vercel Production

Production is gated by:

- validation passing
- preview deployment succeeding first
- GitHub `production` environment approval if configured

## Required GitHub Secrets

### CI validation

- `CI_DATABASE_URL`
- `CI_AUTH_SECRET`
- `CI_AUTH_ACCESS_EMAIL`
- `CI_AUTH_ACCESS_PASSWORD`
- `CI_OUTBOUND_DISPATCH_SECRET`
- `CI_AI_EXECUTION_PROVIDER`
- `CI_AI_EXECUTION_DISPATCH_SECRET`
- `CI_OPENAI_API_KEY`
- `CI_OPENAI_MODEL`

### Shared Vercel deploy

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Preview deploy

- `PREVIEW_DATABASE_URL`
- `PREVIEW_AUTH_SECRET`
- `PREVIEW_AUTH_ACCESS_EMAIL`
- `PREVIEW_AUTH_ACCESS_PASSWORD`
- `PREVIEW_OUTBOUND_DISPATCH_SECRET`
- `PREVIEW_AI_EXECUTION_PROVIDER`
- `PREVIEW_AI_EXECUTION_DISPATCH_SECRET`
- `PREVIEW_OPENAI_API_KEY`
- `PREVIEW_OPENAI_MODEL`
- `PREVIEW_NEXT_PUBLIC_APP_URL`
- `PREVIEW_EMAIL_FROM_ADDRESS`
- `PREVIEW_RESEND_API_KEY`
- `PREVIEW_NOTIFICATION_DISPATCH_SECRET`
- `PREVIEW_CRON_SECRET`

### Production deploy

- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_AUTH_SECRET`
- `PRODUCTION_AUTH_ACCESS_EMAIL`
- `PRODUCTION_AUTH_ACCESS_PASSWORD`
- `PRODUCTION_OUTBOUND_DISPATCH_SECRET`
- `PRODUCTION_AI_EXECUTION_PROVIDER`
- `PRODUCTION_AI_EXECUTION_DISPATCH_SECRET`
- `PRODUCTION_OPENAI_API_KEY`
- `PRODUCTION_OPENAI_MODEL`
- `PRODUCTION_NEXT_PUBLIC_APP_URL`
- `PRODUCTION_EMAIL_FROM_ADDRESS`
- `PRODUCTION_RESEND_API_KEY`
- `PRODUCTION_NOTIFICATION_DISPATCH_SECRET`
- `PRODUCTION_CRON_SECRET`
- `PRODUCTION_NEXT_PUBLIC_FOUNDING_RISK_AUDIT_URL`
- `PRODUCTION_HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID`
- `PRODUCTION_N8N_WORKFLOW_DESTINATIONS`
- `PRODUCTION_N8N_CALLBACK_SHARED_SECRET`

## Scripts

- `pnpm ci:env:validate`
- `pnpm ci:env:validate:preview`
- `pnpm ci:env:validate:production`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:ai`
- `pnpm ai:eval`

## Deployment Gate Rules

- Never deploy if CI validation fails.
- Never deploy production before preview succeeds.
- Keep GitHub `production` environment protected with required reviewers when possible.
- Keep Vercel deployment history enabled so the previous production build remains available for rollback.

## Rollback

Vercel preserves previous deployments, so the fastest rollback is:

1. open the Vercel project
2. find the last known-good production deployment
3. promote or rollback to that deployment
4. confirm health checks, dashboard access, and AI execution route behavior
5. if needed, pause further deploys until the failing commit is fixed

App-level rollback options remain available:

- revert `AI_EXECUTION_PROVIDER` to `dify` if required
- restore Dify rollback env vars if the AI migration is the issue

## Recommended Staging Practice

- Use Preview as the staging gate.
- Point Preview at preview-safe infrastructure and non-production integrations.
- Do not share production n8n or live Stripe values with Preview unless you are intentionally running a controlled validation.

## Scheduled Delivery Automation

`apps/web/vercel.json` now schedules:

- `GET /api/internal/jobs/run?job=dispatch-email-notifications` every 15 minutes

That cron depends on:

- `CRON_SECRET` in the deployed environment
- `NOTIFICATION_DISPATCH_SECRET`
- `EMAIL_FROM_ADDRESS`
- `RESEND_API_KEY`

This is what drains the queued customer delivery email plus the 3-day and 7-day
follow-up emails after a paid report is delivered.

## Local Validation Before Pushing

```powershell
pnpm install
pnpm ci:env:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm test:ai
pnpm ai:eval
```

## Related Docs

- [README.md](C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/README.md)
- [vercel-preview-vs-production-env-checklist.md](C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/vercel-preview-vs-production-env-checklist.md)
- [vercel-env-fill-sheet.md](C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/vercel-env-fill-sheet.md)
- [dify-to-openai-langgraph-cutover.md](C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/migrations/dify-to-openai-langgraph-cutover.md)
