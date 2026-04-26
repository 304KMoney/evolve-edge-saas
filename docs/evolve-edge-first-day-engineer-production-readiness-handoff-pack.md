# Evolve Edge Production-Readiness Handoff Pack

Prepared: April 26, 2026
Audience: first-day full-stack engineer
Timebox: 22 working hours
Purpose: review, verify, and hand off production readiness without breaking architecture boundaries

## What This Pack Is For

Use this pack when handing Evolve Edge to a senior full-stack engineer for a first-day production-readiness review.

The engineer is not being asked to guarantee launch from the repo alone. The engineer is being asked to:

- confirm repo truth
- confirm current environment truth
- identify launch blockers clearly
- close only safe, high-signal repo gaps
- leave a trustworthy go, no-go, or partial recommendation

## First-Day Mission

Keep Evolve Edge inside its intended ownership boundaries:

- Next.js app owns product logic and customer-visible state
- Neon/Postgres owns persistence
- Stripe is billing authority only
- n8n is orchestration only
- LangGraph is workflow orchestration only
- OpenAI is model execution only
- HubSpot is CRM projection only
- Apollo is optional enrichment only
- Dify is deprecated rollback compatibility only

## Definition Of Success In 22 Hours

By the end of the first day, the engineer should be able to hand back:

- a repo-health summary
- a real missing-env and missing-access inventory
- exact command output from readiness checks
- exact tests run
- a lane-by-lane readiness view for Neon, Vercel, Stripe, n8n, OpenAI/LangGraph, delivery/ops, and optional HubSpot
- a clear recommendation for the next safe action

## Current Repo Truth

These repo-level readiness fixes are already in place and should not be casually reopened:

- report writeback is bound to app-owned workflow dispatch linkage
- n8n dispatch-health covers all app-known workflow destinations
- legacy n8n shared-webhook fallback exposes the full workflow surface
- HubSpot only stamps delivery on `report.delivered`, not on `report.generated`
- LangGraph reasoning-heavy nodes use the configured reasoning model when present
- `pnpm integration:status` exists and reports the current integration snapshot
- launch preflight now fails closed on missing ops, email webhook, and public intake secrets
- readiness scripts load local `.env*` before reporting
- root CI/deploy env validation matches the stricter launch contract

## Current Known Local Blockers

The local workspace is still not first-customer launch ready. The latest local validation shows these missing launch-critical items:

- `AUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`
- `N8N_WORKFLOW_DESTINATIONS`
- `N8N_CALLBACK_SECRET` or `N8N_CALLBACK_SHARED_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `AI_EXECUTION_PROVIDER`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `EMAIL_FROM_ADDRESS`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `PUBLIC_INTAKE_SHARED_SECRET`

Optional for day one:

- `HUBSPOT_ACCESS_TOKEN`
- Apollo enrichment configuration

## First-Day Onboarding Workflow

### Hour 0-2: Orient

- [ ] Read `AGENTS.md`
- [ ] Read `docs/launch-environment-readiness.md`
- [ ] Read `docs/stripe-n8n-dify-hubspot-integration.md`
- [ ] Read `docs/deployment-cicd.md`
- [ ] Confirm the architecture boundaries before changing any integration code
- [ ] Run `pnpm install` if dependencies are not present
- [ ] Run `pnpm db:generate`
- [ ] Run `pnpm typecheck`

### Hour 2-5: Snapshot Readiness

- [ ] Run `pnpm integration:status`
- [ ] Run `pnpm preflight:first-customer:env`
- [ ] Run `pnpm preflight:first-customer`
- [ ] Save exact output from each command
- [ ] Separate `blocked-env` from `blocked-code`

### Hour 5-9: Audit Local Configuration

- [ ] Check root `.env`
- [ ] Check root `.env.local`
- [ ] Check `apps/web/.env.local`
- [ ] Confirm whether missing launch-critical values truly do not exist
- [ ] Do not fabricate placeholder values for launch-critical checks

### Hour 9-14: Safe Repo Fixes Only

- [ ] Fix only additive or fail-closed readiness drift
- [ ] Add or update focused tests for the exact slice changed
- [ ] Re-run targeted tests
- [ ] Re-run `pnpm typecheck`
- [ ] Update the closest matching doc in `docs/`

### Hour 14-18: External-System Review

- [ ] Review Neon wiring
- [ ] Review Vercel link and environment flow
- [ ] Review Stripe canonical envs and webhook expectations
- [ ] Review n8n workflow destinations and callback secrets
- [ ] Review OpenAI/LangGraph execution requirements
- [ ] Review report, email, and ops secrets
- [ ] Mark every lane as `ready`, `blocked-env`, or `blocked-access`

### Hour 18-22: Handoff

- [ ] Produce a blocker table
- [ ] List what was verified locally
- [ ] List what still requires live third-party access
- [ ] State go, no-go, or partial
- [ ] Name the next safe action for the next 2-4 hours

## Required Environment Matrix

### Core App

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

### n8n

- `N8N_WORKFLOW_DESTINATIONS`
- `N8N_CALLBACK_SECRET` or `N8N_CALLBACK_SHARED_SECRET`
- `OUTBOUND_DISPATCH_SECRET`

### OpenAI And LangGraph

- `AI_EXECUTION_PROVIDER`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_MODEL` when a separate reasoning tier is intended

### Delivery And Ops

- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `EMAIL_FROM_ADDRESS`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `PUBLIC_INTAKE_SHARED_SECRET`

### Optional Integrations

- `HUBSPOT_ACCESS_TOKEN`
- Apollo enrichment settings if an assigned workflow depends on them

## External-System Review Checklist

### Neon

- [ ] Confirm the database is reachable from the intended environment
- [ ] Confirm Prisma client generation succeeds
- [ ] Confirm schema is current and runtime-safe
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### Vercel

- [ ] Confirm `.vercel/project.json` is linked correctly
- [ ] Confirm environment variable ownership is understood
- [ ] Confirm preview vs production expectations are documented
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### Stripe

- [ ] Confirm canonical Stripe product and price envs are present
- [ ] Confirm webhook secret is present
- [ ] Confirm backend mapping exists and no raw Stripe product-name inference is relied on
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### n8n

- [ ] Confirm `N8N_WORKFLOW_DESTINATIONS` includes `auditRequested`
- [ ] Confirm callback secret path is configured
- [ ] Confirm outbound dispatch secret exists
- [ ] Confirm shared fallback behavior is understood if legacy endpoints are still in use
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### OpenAI And LangGraph

- [ ] Confirm the provider is set to the intended app-owned execution path
- [ ] Confirm `OPENAI_API_KEY` and primary model are present
- [ ] Confirm reasoning model strategy is intentional
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### Delivery And Ops

- [ ] Confirm signed report download secret exists
- [ ] Confirm Resend API key and webhook secret exist
- [ ] Confirm notification, cron, and ops readiness secrets exist
- [ ] Confirm public intake shared secret exists
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

### HubSpot

- [ ] Treat HubSpot as projection-only
- [ ] Confirm token presence only if the assigned slice needs CRM projection
- [ ] Mark status: `ready`, `blocked-env`, or `blocked-access`

## Recommended Command Checklist

- [ ] `pnpm install`
- [ ] `pnpm db:generate`
- [ ] `pnpm typecheck`
- [ ] `pnpm integration:status`
- [ ] `pnpm preflight:first-customer:env`
- [ ] `pnpm preflight:first-customer`
- [ ] targeted `tsx` tests for any touched readiness or integration slice
- [ ] `node scripts/validate-required-env.js production`

## Smoke-Test Sequence

Use these only when the environment and access exist.

### Repo And Schema

- [ ] `pnpm db:generate`
- [ ] `pnpm typecheck`

### Readiness Contract

- [ ] `pnpm integration:status`
- [ ] `pnpm preflight:first-customer:env`
- [ ] `pnpm preflight:first-customer`

### Stripe

- [ ] confirm canonical envs are present
- [ ] confirm webhook endpoint and signing secret match the target deployment
- [ ] verify one known billing mapping path if access exists

### n8n

- [ ] verify `auditRequested` destination resolves
- [ ] verify callback secret wiring exists
- [ ] verify the target environment can accept app-owned dispatches

### OpenAI And LangGraph

- [ ] verify provider envs exist
- [ ] verify one known execution path can be invoked when access exists

### Delivery

- [ ] verify report signing secret exists
- [ ] verify Resend API and webhook secrets exist

## Hard No-Go Rules

- [ ] do not launch if `pnpm preflight:first-customer` fails
- [ ] do not launch if `pnpm typecheck` fails
- [ ] do not launch if Stripe canonical envs are missing
- [ ] do not launch if `auditRequested` is missing from `N8N_WORKFLOW_DESTINATIONS`
- [ ] do not launch if OpenAI/LangGraph execution secrets are missing
- [ ] do not launch if report signing, email, or ops secrets are missing
- [ ] do not make HubSpot, Apollo, Stripe, or n8n authoritative for app-owned state

## Go Or No-Go Acceptance Criteria

Mark the review as `GO` only if:

- repo health checks pass
- first-customer preflight passes
- required launch envs exist
- required callback and webhook secrets exist
- no blocking code drift is found in app-owned control paths

Mark the review as `PARTIAL` if:

- repo health is good
- blockers are external configuration or access only
- the next safe action is obvious and documented

Mark the review as `NO-GO` if:

- core checks fail
- launch-critical envs are missing
- third-party configuration is unverified and needed immediately
- there is still code ambiguity around routing, billing, AI execution, or delivery state

## Reviewer Signoff Sheet

Record the following:

- Overall status:
- Repo health:
- Local env health:
- Neon:
- Vercel:
- Stripe:
- n8n:
- OpenAI/LangGraph:
- Delivery/Ops:
- HubSpot:
- Commands run:
- Tests run:
- Missing secrets:
- Missing third-party access:
- Safe next action in the next 2-4 hours:
- Owner for next action:
- Review date:

## Final Handoff Template

- Overall: `GO`, `NO-GO`, or `PARTIAL`
- Repo health:
- Local env health:
- Verified today:
- Blocked by missing secrets:
- Blocked by missing third-party access:
- Safe next action in the next 2-4 hours:
