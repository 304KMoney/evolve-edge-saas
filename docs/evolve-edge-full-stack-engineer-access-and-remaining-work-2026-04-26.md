# Evolve Edge Full-Stack Engineer Access And Remaining Work

Prepared: April 26, 2026  
Audience: incoming full-stack engineer  
Purpose: define required access, exact remaining work, and the expected implementation path

## Required Access On Day One

### Must Have

1. GitHub repository access with push rights

- repository: `304KMoney/evolve-edge-saas`
- branch visibility for `codex-launch-hardening-handoff`
- ability to open PRs and review commit history

2. Vercel project access

- access to Preview and Production deployments
- ability to view deployments, runtime logs, project settings, and environment variables
- ability to redeploy Preview and Production

3. Preview and Production environment variable access

- read access at minimum
- write access strongly preferred for final promotion and replay validation

4. Database access for the active environments

- direct Neon/Postgres access or equivalent safe Prisma/operator path
- enough access to inspect `Report`, `Assessment`, `AnalysisJob`, and delivery-state records

5. Runtime log access

- Vercel function logs
- app/server logs if mirrored elsewhere

### Strongly Recommended

6. n8n access

- enough visibility to confirm orchestration handoff, workflow routing, and failures

7. OpenAI usage visibility

- enough access to confirm whether report-generation failures are provider-side, app-side, or orchestration-side

8. Stripe read access

- useful for billing-path verification, even though current blocker is not billing-led

9. HubSpot read access

- lower priority, but useful for confirming projection boundaries if needed

### Nice To Have

10. Sentry or equivalent application monitoring access

- helpful if `node_execution_failed` traces are mirrored there

## Access The Engineer Does Not Need To Start

The engineer does not need day-one ownership of:

- Hostinger website administration
- broad business/admin tooling outside product operations
- CRM workflow editing if Preview report replay can be resolved inside app + Vercel + DB + n8n

## Current Remaining Work

### 1. Reconcile report canonical state in Preview

Current problem:

- Preview renders report route `cmogcyojn0005l104b7e1mofs`
- that route still shows `Export pending`
- it also shows `Last safe error: node_execution_failed`
- prior direct DB inspection did not cleanly reconcile that rendered report with the current Preview report table view

What to inspect:

- `apps/web/lib/report-records.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- any writeback paths that update `Report`, `AnalysisJob`, and delivery-state records

Acceptance criteria:

- identify the canonical state source for the live Preview report page
- explain why the current rendered route exists if it is not present in expected direct report reads
- remove or repair any fallback behavior that creates a misleading report detail view

### 2. Restore a safe replay or regeneration path

Current problem:

- the queue is not self-healing
- visible reviewer/operator controls are not currently exposed on the rendered route
- internal dispatch attempts previously returned idle results

What to inspect:

- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/report-review.ts`
- `apps/web/app/dashboard/reports/[reportId]/actions.ts`
- analysis job creation and dispatch linkage

Acceptance criteria:

- an operator-capable path exists to replay or regenerate the current assessment report
- the replay path is tied to canonical report state
- the path is safe to use without creating duplicate or orphaned report records

### 3. Finalize a Preview report artifact

Current target:

- active assessment: `cmog8h1pl0001ii04raoytlal`

Success criteria:

- a current Preview report completes successfully
- the report page no longer shows `Last safe error: node_execution_failed`
- `Download HTML` is available
- findings, posture, and roadmap sections render validated content

### 4. Verify evidence download

Already verified:

- Preview evidence upload works end to end
- verified evidence id: `cmogf5tjm0001lf043ehylblc`

Still required:

- confirm same-session download behavior for the uploaded evidence item
- confirm there is no incorrect sign-in bounce or broken artifact route

Success criteria:

- the evidence artifact downloads successfully
- auth behavior matches intended operator/customer rules

### 5. Promote the verified state to Production

Do this only after Preview is green.

Success criteria:

- Production envs match the verified Preview set where appropriate
- Production deploy is intentional and tracked
- Production smoke confirms sign-in, dashboard, reports, and current report download path

## Suggested Implementation Order

1. Reproduce the current Preview report behavior.
2. Inspect canonical data state for the report, assessment, delivery-state, and analysis-job records.
3. Fix or remove any compatibility/fallback path that lets a non-canonical report detail route render as if it were final.
4. Restore a replay/regeneration path on canonical state.
5. Generate a fresh valid report artifact.
6. Verify `Download HTML`.
7. Verify evidence download.
8. Promote to Production.
9. Refresh the handoff package with final green results.

## Files Most Likely To Matter

- `apps/web/lib/report-records.ts`
- `apps/web/lib/report-view-model.ts`
- `apps/web/lib/executive-delivery.ts`
- `apps/web/lib/report-review.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `apps/web/app/dashboard/reports/[reportId]/actions.ts`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- `apps/web/lib/evidence.ts`
- `apps/web/src/server/ai/workflows/audit/checkpoints.ts`

## Current Verified Preview Reference

Latest verified Preview deployment in this handoff state:

- [https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app](https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app)

Verified current state includes:

- fixed onboarding CTA behavior
- fixed button-route coverage
- live SOC 2 downloadable website assets
- successful Preview evidence upload

## What Success Looks Like For You

If this access is granted and this sequence is followed, the engineer should not need to spend their first day figuring out what the product is, where the systems live, or what still matters. They should be able to spend their time executing the final 10% instead of doing discovery.
