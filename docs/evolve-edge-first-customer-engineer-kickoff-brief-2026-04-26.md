# Evolve Edge Engineer Kickoff Brief

Prepared: April 26, 2026  
Audience: part-time full-stack engineer

## Mission

Get Evolve Edge safely ready for its first customer without reopening working architecture or creating cleanup work.

## Current State

The core app blockers have been fixed and deployed on preview.

Verified working on the latest preview:

- sign-in
- dashboard
- assessments
- frameworks
- monitoring
- evidence page
- programs
- roadmap
- settings
- reports page
- report generation
- report detail page

## What Is Left

### Launch-critical env/config

Fill and verify:

- `N8N_WORKFLOW_DESTINATIONS`
- `OUTBOUND_DISPATCH_SECRET`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `EMAIL_FROM_ADDRESS`
- `NOTIFICATION_DISPATCH_SECRET`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `PUBLIC_INTAKE_SHARED_SECRET`

### Canonical values

- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `OPENAI_MODEL=gpt-4o-2024-08-06`
- `EMAIL_PROVIDER=resend`

Do not use Dify for the live path.

### Soft parity item

- preview DB is still missing `AiWorkflowFeedback`
- this is not blocking the customer journey, but should be cleaned up if possible

## Work Order

1. Fill Preview envs.
2. Run readiness checks.
3. Run live smoke test with test data.
4. Verify report download and evidence upload.
5. Mirror the same env set into Production.
6. Repeat the smoke test in Production before real customer usage.

## Commands

```bash
corepack pnpm typecheck
corepack pnpm integration:status
corepack pnpm preflight:first-customer
```

Focused regressions:

```bash
corepack pnpm exec tsx test/domain-events.test.ts
corepack pnpm exec tsx test/executive-delivery.test.ts
```

## Smoke Path

1. Sign in.
2. Open `/dashboard/reports`.
3. Generate a report.
4. Open the generated report.
5. Verify `/dashboard/roadmap`, `/dashboard/frameworks`, `/dashboard/monitoring`, and `/dashboard/programs`.
6. Upload test evidence.
7. Verify report export/download.
8. Verify billing/settings handoff.

## Avoid

- broad refactors
- reintroducing Dify
- changing canonical plan/env naming
- rewriting working compatibility layers without a failing test or live regression

## Primary Reference

If more detail is needed, use:

- `docs/evolve-edge-first-customer-engineer-handoff-2026-04-26.md`
