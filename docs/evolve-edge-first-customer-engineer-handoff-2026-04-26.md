# Evolve Edge First-Customer Engineer Handoff

Prepared: April 26, 2026  
Audience: part-time full-stack engineer  
Purpose: get Evolve Edge to safe first-customer readiness with the least possible duplicate work and cleanup

## Executive Summary

Evolve Edge is now materially closer to first-customer readiness than it was at the start of this review.

The main app blockers that were preventing a real end-to-end customer path have been fixed and deployed:

- assessment creation no longer leaks `NEXT_REDIRECT`
- billing checkout/sign-in handoff now survives auth redirects
- `/dashboard/reports` no longer hard-fails when secondary dependencies are missing
- report generation now succeeds on preview
- report detail rendering now succeeds on preview
- report package delivery reads are compatible with the older preview database shape
- duplicate domain-event retries no longer poison the report-generation transaction
- Dify has been removed from active readiness surfacing; the live path is LangGraph plus OpenAI

The current state is:

- core sign-in works
- core dashboard pages render
- report generation works
- report detail page works
- the remaining gaps are primarily environment/config completion and one soft database parity warning

## Verified Preview

Latest verified preview:

- [https://evolve-edge-saas-fhh0cdjbs-kielgrn-5786s-projects.vercel.app](https://evolve-edge-saas-fhh0cdjbs-kielgrn-5786s-projects.vercel.app)

Verified live on that preview:

- `/dashboard`
- `/dashboard/assessments`
- `/dashboard/frameworks`
- `/dashboard/monitoring`
- `/dashboard/evidence`
- `/dashboard/programs`
- `/dashboard/roadmap`
- `/dashboard/settings`
- `/dashboard/reports`
- `POST /dashboard/reports` report generation flow
- `/dashboard/reports/[reportId]`

Known soft warning still present on preview:

- `AiWorkflowFeedback` table is missing in the preview database, but the reports page now degrades safely instead of breaking

## Architecture Guardrails

Do not change these boundaries casually:

- Next.js app owns product logic and customer-visible state
- Neon/Postgres owns persistence
- Stripe is billing authority only
- n8n is orchestration only
- LangGraph is workflow orchestration only
- OpenAI is model execution only
- Dify is deprecated rollback compatibility only
- HubSpot is CRM projection only
- Hostinger is brochure/top-of-funnel only

## Code Fixes Already Completed

These were completed during the current hardening pass and should not be reopened unless a failing test or live regression requires it:

- assessment redirect compatibility
- checkout CTA auth redirect compatibility
- reports-page partial dependency fallback
- report package write compatibility for older preview schema
- report package read compatibility for older preview schema
- domain-event idempotency upsert for duplicate-safe retries
- env/readiness surfacing aligned to LangGraph plus OpenAI, not Dify

Primary touched files:

- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\dashboard\assessments\actions.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\dashboard\assessments\actions.ts)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\api\billing\checkout\route.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\api\billing\checkout\route.ts)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\dashboard\reports\page.tsx](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\app\dashboard\reports\page.tsx)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\executive-delivery.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\executive-delivery.ts)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\domain-events.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\domain-events.ts)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\env-validation.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\env-validation.ts)
- [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\integration-status.ts](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\apps\web\lib\integration-status.ts)

## What Is Still Left

### 1. Fill Launch-Critical Environment Variables

The current preview readiness audit still reports these missing values:

- `N8N_WORKFLOW_DESTINATIONS`
- `OUTBOUND_DISPATCH_SECRET`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `EMAIL_PROVIDER`

Additional email/runtime values should also be verified for both Preview and Production:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `EMAIL_FROM_ADDRESS`
- `NOTIFICATION_DISPATCH_SECRET`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `PUBLIC_INTAKE_SHARED_SECRET`

### 2. Confirm Correct Provider Values

These values should be treated as canonical unless the architecture is intentionally changed:

- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `OPENAI_MODEL=gpt-4o-2024-08-06`
- `EMAIL_PROVIDER=resend`

Important:

- do not place an API key in `OPENAI_MODEL`
- the `sk-proj-...` value belongs in `OPENAI_API_KEY`
- Dify should not be used for the live path

### 3. Optional But Recommended Preview DB Cleanup

The preview logs still show a compatibility warning because the preview database does not include:

- `AiWorkflowFeedback`

This is not currently blocking the customer journey because the page degrades safely, but it should still be brought back to schema parity before launch if possible.

### 4. Finish The Last Live Functional Checks

These have not yet been fully verified live after env completion:

- report export/download
- evidence upload and downstream counts
- billing portal / Stripe management handoff
- queued email delivery path
- webhook receipt path for Resend

## Exact Recommended Work Order

Use this order to avoid duplicate work:

1. Fill Preview env values first.
2. Re-run readiness commands.
3. Re-run preview smoke tests.
4. Only then mirror the same env set into Production.
5. Re-run the same smoke path in Production before first real customer usage.

## Commands To Run

From `apps/web`:

```bash
corepack pnpm typecheck
corepack pnpm integration:status
corepack pnpm preflight:first-customer
```

Focused regressions already useful for this slice:

```bash
corepack pnpm exec tsx test/domain-events.test.ts
corepack pnpm exec tsx test/executive-delivery.test.ts
```

## Live Smoke Path

Run this with test data, not real customer data:

1. Sign in.
2. Open `/dashboard`.
3. Open `/dashboard/assessments`.
4. Create or confirm an intake-submitted assessment exists.
5. Open `/dashboard/reports`.
6. Generate a report.
7. Open the generated report detail page.
8. Open `/dashboard/roadmap`.
9. Open `/dashboard/frameworks`.
10. Open `/dashboard/monitoring`.
11. Open `/dashboard/programs`.
12. Open `/dashboard/evidence`.
13. Upload a test evidence artifact.
14. Test report export/download.
15. Test the billing/settings path.

## Go / No-Go Criteria

The platform is ready for first-customer input only when all of the following are true:

- readiness env gaps are filled for the intended environment
- report generation succeeds
- report detail renders
- report export/download works
- evidence upload works
- email delivery path is configured
- Stripe management handoff works
- no launch-critical route is returning a 500

## Files To Treat Carefully

- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/ai-execution.ts`
- `apps/web/src/server/ai/providers/openai-langgraph.ts`
- `apps/web/src/server/ai/workflows/audit/graph.ts`
- `packages/db/prisma/schema.prisma`

## What Not To Waste Time On

Do not spend the next engineering block on broad refactors.

Avoid:

- replacing working compatibility layers just because they look imperfect
- reintroducing Dify into active readiness logic
- redesigning reports or delivery-state architecture
- changing commercial plan ownership boundaries
- renaming canonical envs or route contracts

The highest-value remaining work is launch configuration, parity cleanup, and final smoke verification.

## Handoff Recommendation

Recommended assignment for the part-time engineer:

- finish env completion in Preview and Production
- verify Stripe, Resend, and n8n secrets
- close the optional preview DB parity gap for `AiWorkflowFeedback`
- complete the final smoke checks for export, evidence, and delivery email
- produce a final go/no-go note with screenshots, exact command output, and any remaining hard blockers

If no new blocker appears during those steps, Evolve Edge should move from “code-blocked” to “ops/config readiness” rather than requiring another major app hardening pass.
