# First-Day Full-Stack Engineer Checklist

Prepared: April 26, 2026
Deadline: 22 working hours from assignment
Scope: Evolve Edge repo readiness, environment truth, and launch-path verification

## Mission

Finish the highest-value first-day work without breaking product truth:

- keep the Next.js app as the source of truth
- keep Neon as the system of record
- keep Stripe billing-only
- keep n8n orchestration-only
- keep OpenAI/LangGraph execution-only
- keep HubSpot projection-only

## Definition Of Done For Day One

By the end of the 22-hour window, the engineer should have:

- pulled the repo, installed dependencies, and confirmed `pnpm typecheck` passes
- run the app-owned readiness commands and captured current output
- produced a real missing-env inventory instead of guessing
- verified which launch blockers are code issues vs environment issues
- completed at least one safe, high-signal fix if a repo-level inconsistency is found
- handed off a clean blocker list for any secrets or third-party access they cannot self-serve

## Current Repo Truth

These are already in better shape and should not be re-opened casually:

- report writeback binding hardening
- n8n dispatch-health expansion
- legacy n8n fallback coverage for named workflows
- HubSpot `report.generated` vs `report.delivered` projection fix
- LangGraph reasoning-model routing fix
- `pnpm integration:status` command implementation
- launch-preflight hardening for ops, intake, email, and callback prerequisites
- local readiness scripts now load `.env*` before reporting

## Current Local Blockers

From the latest local validation, the workspace is still missing:

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

Optional today:

- `HUBSPOT_ACCESS_TOKEN`
- Apollo envs, which are enrichment-only and not app-owned launch-critical

## 22-Hour Execution Plan

### Hour 0-2: Boot And Trust Boundaries

- [ ] Read `AGENTS.md`
- [ ] Read `docs/launch-environment-readiness.md`
- [ ] Read `docs/stripe-n8n-dify-hubspot-integration.md`
- [ ] Confirm architecture boundaries before changing code
- [ ] Run `pnpm install` if needed
- [ ] Run `pnpm db:generate`
- [ ] Run `pnpm typecheck`

### Hour 2-5: Readiness Snapshot

- [ ] Run `pnpm integration:status`
- [ ] Run `pnpm preflight:first-customer:env`
- [ ] Run `pnpm preflight:first-customer`
- [ ] Save command outputs into a short handoff note
- [ ] Separate missing secrets from actual code defects

### Hour 5-9: Environment Inventory

- [ ] Check root `.env`
- [ ] Check root `.env.local`
- [ ] Check `apps/web/.env.local`
- [ ] Confirm whether missing secrets truly do not exist locally
- [ ] Ask for missing credentials only after proving they are absent
- [ ] Do not fabricate test values for launch-critical production checks

### Hour 9-14: Safe Repo Fixes Only If Needed

- [ ] Fix only additive or fail-closed readiness drift
- [ ] Add or update focused tests for the exact slice changed
- [ ] Re-run targeted tests
- [ ] Re-run `pnpm typecheck`
- [ ] Update the closest matching doc in `docs/`

### Hour 14-18: Launch-Path Verification

- [ ] Confirm Neon wiring
- [ ] Confirm Vercel link state
- [ ] Confirm whether canonical Stripe envs are present
- [ ] Confirm whether `auditRequested` exists in `N8N_WORKFLOW_DESTINATIONS`
- [ ] Confirm whether OpenAI/LangGraph execution envs are present
- [ ] Confirm whether report delivery and ops secrets are present
- [ ] Mark each lane as `ready`, `blocked-env`, or `blocked-access`

### Hour 18-22: Final Handoff

- [ ] Produce a blocker table
- [ ] List what was verified locally
- [ ] List what still requires live third-party access
- [ ] List any unrelated dirty worktree files left untouched
- [ ] Give the team a no-go/go recommendation for the next step

## Hard No-Go Rules

- [ ] Do not launch if `pnpm preflight:first-customer` fails
- [ ] Do not launch if `pnpm typecheck` fails
- [ ] Do not launch if Stripe canonical price/product envs are missing
- [ ] Do not launch if `auditRequested` is missing from `N8N_WORKFLOW_DESTINATIONS`
- [ ] Do not launch if OpenAI/LangGraph execution secrets are missing
- [ ] Do not launch if report auth and delivery secrets are missing
- [ ] Do not treat HubSpot or Apollo as blockers unless the assigned slice explicitly depends on them

## First-Day Deliverables

- [ ] one short written summary of repo health
- [ ] one exact missing-env list
- [ ] one exact list of commands run
- [ ] one exact list of tests run
- [ ] one exact list of blockers needing operator or platform access
- [ ] one recommendation: `continue repo work`, `request secrets`, or `schedule live integration validation`

## Recommended Final Status Format

Use this at handoff:

- Overall: `GO`, `NO-GO`, or `PARTIAL`
- Repo health:
- Local env health:
- Verified today:
- Blocked by missing secrets:
- Blocked by missing third-party access:
- Safe next action in the next 2-4 hours:
