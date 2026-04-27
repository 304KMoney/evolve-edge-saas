# Evolve Edge Full-Stack Engineer Handoff Instructions

Prepared: April 26, 2026  
Audience: incoming full-stack engineer  
Goal: make this project 90% handoff-ready so the engineer can execute instead of rediscover

## What 90% Ready Means

For this handoff, 90% ready means:

- the engineer should not need to reverse-engineer the architecture
- the engineer should not need to hunt for credentials, environments, or systems of record
- the engineer should inherit a short, prioritized remaining-work list
- the engineer should start from verified Preview behavior, not guesswork
- the engineer should know exactly what is already fixed, what is still broken, and what counts as done

The only meaningful remaining product risk is the Preview report finalization path and its downstream Production promotion.

## Current Product State

As of April 26, 2026:

- Preview env parity is green
- dashboard navigation and major button routing regressions are fixed
- `Finish onboarding` routes to `/onboarding`
- demo-mode billing CTAs no longer bounce users into the wrong flow
- SOC 2 framework pages now expose downloadable assets
- Preview evidence upload is working end to end
- the current assessment flow can save intake and queue analysis

Still unresolved:

- the current Preview report path still ends in `Export pending`
- `Download HTML` is not yet available on the current Preview report
- the report route still shows `Last safe error: node_execution_failed`
- the rendered report route does not reconcile cleanly with the directly queried Preview report state
- evidence download auth behavior is not yet re-verified in the same session
- Production has not yet been promoted from the latest verified Preview state

## What Has Already Been Verified

Verified on Preview on April 26, 2026:

- `/dashboard`
- `/dashboard/reports`
- `/dashboard/evidence`
- `/onboarding`
- `/frameworks/soc-2`
- real evidence upload mutation
- evidence inventory mutation after upload
- SOC 2 downloadable asset links

Preview deployment verified in this state:

- [https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app](https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app)

Known active records:

- assessment id: `cmog8h1pl0001ii04raoytlal`
- rendered report path id: `cmogcyojn0005l104b7e1mofs`
- verified evidence id: `cmogf5tjm0001lf043ehylblc`

## First-Day Orientation

The engineer should read these first:

1. [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\evolve-edge-first-customer-engineer-handoff-2026-04-26.md](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\evolve-edge-first-customer-engineer-handoff-2026-04-26.md)
2. [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\evolve-edge-full-stack-engineer-access-and-remaining-work-2026-04-26.md](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\evolve-edge-full-stack-engineer-access-and-remaining-work-2026-04-26.md)
3. [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\AGENTS.md](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\AGENTS.md)
4. [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\deployment-cicd.md](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\deployment-cicd.md)
5. [C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\vercel-env-fill-sheet.md](C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas\docs\vercel-env-fill-sheet.md)

Then they should inspect these code paths:

- `apps/web/lib/report-records.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/evidence.ts`
- `apps/web/src/server/ai/workflows/audit/checkpoints.ts`

## High-Confidence Current Understanding

The app is no longer suffering from a general frontend navigation problem. The remaining work is concentrated in backend-owned report state and delivery readiness.

This matters because the engineer should not waste time re-auditing:

- dashboard shell routing
- onboarding CTA routing
- demo billing CTA behavior
- SOC 2 website asset rendering
- Preview evidence upload storage

Those areas are already materially hardened.

## Remaining Work In Priority Order

1. Reconcile the current Preview report route with canonical report state.
2. Restore a safe replay or regeneration path for the active assessment.
3. Regenerate or finalize the current Preview report until `Download HTML` is available.
4. Verify evidence download behavior for the newly uploaded evidence item.
5. Promote the verified Preview state to Production.
6. Re-run a narrower Production smoke after promotion.

## The Engineer Should Start Here

Recommended first execution sequence:

1. Confirm the current Preview report page behavior for `cmogcyojn0005l104b7e1mofs`.
2. Confirm whether the report page is reading canonical `Report` state or a fallback path.
3. Restore a mutation-capable report path if the current route is detached from canonical state.
4. Re-run analysis or regeneration from the active assessment `cmog8h1pl0001ii04raoytlal`.
5. Verify report artifact readiness and `Download HTML`.
6. Verify evidence download.
7. Promote to Production only after Preview is fully green.

## Commands And Validation Baseline

The engineer should be able to rerun these locally:

- `corepack pnpm --filter @evolve-edge/web exec tsx test/auth-routing.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/button-routes.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/evidence.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/authority-content.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/report-review.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/executive-delivery.test.ts`
- `corepack pnpm --filter @evolve-edge/web exec tsx test/audit-workflow-checkpoints.test.ts`
- `corepack pnpm --filter @evolve-edge/web typecheck`

## Architecture Boundaries To Preserve

The engineer should not accidentally move ownership out of the app:

- Next.js app owns canonical product logic and customer-visible state
- Neon/Postgres is the system of record
- Stripe is billing authority only
- n8n is orchestration only
- LangGraph is workflow orchestration only
- OpenAI is model execution only
- HubSpot is CRM projection only
- Hostinger is brochure/top-of-funnel only

## Practical Definition Of Done Before Final Handoff

The handoff should be considered truly ready when all of the following are true:

- the current Preview report route is canonical and mutation-capable
- a current Preview report exposes `Download HTML`
- evidence upload and evidence download are both verified
- the exact verified Preview env/application state has been promoted to Production
- Production sign-in, dashboard, reports, and report download smoke are confirmed
- the handoff document is refreshed one final time with those outcomes

## What You Can Tell The Engineer

You are not inheriting a broken product. You are inheriting a product that has been largely stabilized, with one concentrated backend report-delivery issue left to close. Most of the platform is already in a handoff-safe state.
