# Evolve Edge First-Customer Engineer Handoff

Prepared: April 26, 2026  
Audience: incoming full-stack engineer  
Purpose: capture the exact engineering state after Preview hardening, workflow repair, evidence verification, and live operator validation on April 26, 2026

## Executive Summary

Evolve Edge is no longer blocked by broad surface instability. The current state is much narrower:

- Preview env parity is green.
- Core CTA and button routing regressions are fixed.
- The onboarding route, dashboard navigation, settings billing CTA behavior, evidence page, and SOC 2 website asset surfaces are working.
- The Preview evidence upload path is now verified end to end on the latest deployment.
- The assessment flow now progresses far enough to queue analysis and render a report route.

The remaining blocker is concentrated in the report-generation path:

- the current Preview report route still ends in `Export pending`
- the report page still shows `Last safe error: node_execution_failed`
- the rendered report route does not reconcile cleanly with the current Preview database view
- no visible regeneration or approval controls are exposed on that rendered route
- Production has not yet been intentionally promoted from the latest verified Preview state

This is not a whole-app outage. It is a report data-source / replay / artifact-finalization problem with one secondary auth-follow-up on evidence download behavior.

## Current State

### Product surface

Working and recently hardened:

- dashboard shell and navigation
- onboarding route from dashboard CTA
- settings billing CTA behavior in demo mode
- report-center stale-link handling
- evidence page rendering and upload mutation
- SOC 2 framework marketing page and downloadable SVG assets

What this means:

- most remaining work is backend workflow and data-source reconciliation
- generic navigation debugging should be treated as lower priority unless a new regression appears

### Latest Preview deployment

Latest verified Preview deployment on April 26, 2026:

- [https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app](https://evolve-edge-saas-a58z80mjl-kielgrn-5786s-projects.vercel.app)

Preview readiness:

- required Preview envs for auth, AI execution, email delivery, n8n routing, and readiness protection are present
- earlier `/api/health/status` verification was green before the latest deploy and no new env regressions appeared during this pass

Key active records and identifiers:

- assessment id: `cmog8h1pl0001ii04raoytlal`
- rendered report path id: `cmogcyojn0005l104b7e1mofs`
- verified evidence id: `cmogf5tjm0001lf043ehylblc`

### Production

Production was not promoted from this latest Preview state in this pass.

Practical implication:

- Production should still be treated as behind Preview
- do not assume the current Preview evidence fix or latest button/report hardening is live in Production

## What Was Verified On April 26, 2026

### Preview surface verification

Verified live or through protected Preview fetch/curl on April 26, 2026:

- `/dashboard` renders
- `/dashboard/reports` renders
- `/dashboard/evidence` renders
- `/onboarding` renders from the fixed dashboard CTA path instead of dumping to sign-in
- the SOC 2 framework page renders with both downloadable asset links
- the latest Preview deployment serves the new evidence storage fallback and website/button fixes

### Assessment workflow verification

Verified on April 26, 2026:

- the active assessment page loaded for `cmog8h1pl0001ii04raoytlal`
- saving real intake content changed server-side state enough to unlock `Queue analysis`
- queueing analysis succeeded and a report route was then rendered for the same assessment path

This matters because earlier in the day the UI and backend disagreed about when an assessment was ready enough to submit.

### Workflow compatibility fixes confirmed

The following Preview workflow failures were confirmed and addressed in code on April 26, 2026:

1. Missing checkpoint table

- Preview runtime behavior previously failed on `AuditWorkflowCheckpoint`
- the workflow checkpoint store now falls back to in-memory checkpointing when the live database lacks that table

2. Report status enum drift

- Preview runtime behavior previously failed when persisting `ReportStatus = GENERATED`
- the report persistence path now preflights the live enum and falls back safely when `GENERATED` is unsupported

3. Evidence storage on Vercel

- Preview evidence upload previously failed trying to create `apps/web/.data` under `/var/task`
- evidence storage now falls back to a writable temp root on Vercel when no explicit storage root is configured

These were real runtime issues, not speculative cleanup.

### Evidence mutation verified end to end

Verified on April 26, 2026 against the latest Preview deployment:

- a real multipart upload succeeded for `tmp-smoke/evidence-upload-smoke.txt`
- the upload redirected to `/dashboard/evidence?uploaded=1`
- monthly evidence usage changed from `0 of 50` to `1 of 50`
- evidence inventory changed from `0` items to `1`
- tracked storage changed from `0 B` to `113 B`
- the uploaded record rendered with title, MIME type, assessment context, framework context, and detail/download links

Verified evidence record:

- evidence id: `cmogf5tjm0001lf043ehylblc`
- title: `Preview evidence smoke upload 2026-04-26`

## What Is Still Broken Or Incomplete

### 1. The current rendered report route is still not finalized

Current rendered Preview report path:

- `cmogcyojn0005l104b7e1mofs`

Current user-visible state on the latest Preview deployment:

- report page still shows `Export pending`
- no `Download HTML` button is available
- artifact state still shows `Not Ready`
- findings, posture, and roadmap sections remain placeholder or pending
- the page shows `Last safe error: node_execution_failed`

This remains the main launch blocker.

### 2. The rendered report route does not reconcile with the current Preview database view

Using a fresh Preview env pull from Vercel and direct Prisma inspection on April 26, 2026:

- `cmogcyojn0005l104b7e1mofs` is not present in the currently queried Preview `Report` table
- the latest directly visible report records are older records such as `cmog4w10n000fkz04qsysxv78`
- despite that, the deployed app still renders a full report page for `cmogcyojn0005l104b7e1mofs`

Practical implication:

- the remaining issue is not just "click replay"
- there is a report data-source / fallback / compatibility inconsistency that should be reconciled before trusting the rendered route as canonical

### 3. The queue is idle and the report is not self-healing

Earlier internal dispatch replay behavior on the Preview path returned an idle result:

- `processed: 0`
- `started: 0`
- `completed: 0`
- `failed: 0`

Practical implication:

- the current report path is not self-recovering automatically
- a safe regeneration or replay path is still required after the data-source inconsistency is understood

### 4. Regeneration / approval controls are not exposed on the rendered report route

Current rendered behavior:

- top navigation links render
- no `Request regeneration`
- no `Retry approval sync`
- no `Approve for delivery`

Possible explanations:

- the route is in a fallback state that is no longer tied to a mutable canonical report record
- the current operator context lacks the permission/state combination needed to expose those controls
- both may be true

### 5. Evidence download still needs a same-session verification

What is verified:

- real evidence upload mutation
- evidence inventory mutation
- detail/download links render

What still needs verification:

- whether the intended operator session can download the new evidence artifact without an unexpected sign-in redirect
- whether the final customer/operator auth behavior for evidence downloads matches product intent

### 6. Production parity is still unfinished

Still not completed:

- intentional promotion of the latest verified Preview state to Production
- Production rerun after the latest Preview evidence fix and workflow hardening
- Production downloadable report verification

## Website / UX State

The current website/app UX state to assume is:

- dashboard CTA routing is repaired
- `Finish onboarding` now leads to `/onboarding`
- SOC 2 framework pages expose downloadable framework assets
- the SOC 2 public page is live and renders both SVG asset links
- evidence upload works on Preview after the storage-root fix

Important nuance:

- the report path is still not a reliable sign-off surface
- the remaining issue is backend/canonical-state oriented, not a generic broken button problem

## Highest-Priority Remaining Verification Punch List

1. Reconcile the rendered Preview report route with the canonical Preview database state.

Success means:

- identify why `cmogcyojn0005l104b7e1mofs` renders in the deployed app but is absent from direct Preview Prisma reads
- confirm which data source is canonical for the report page

2. Create or unlock a safe replayable report-generation path for the active assessment.

Likely paths:

- reviewer/operator session with regeneration controls
- direct privileged app context using the existing helper path
- or a new canonical report generation path once the data-source mismatch is resolved

3. Re-run the current assessment/report flow until a finalized artifact exists.

Success means:

- report no longer shows `Needs Attention`
- artifact state becomes ready
- `Download HTML` appears
- findings, posture, and roadmap sections render validated content instead of placeholders

4. Verify same-session evidence download behavior for `cmogf5tjm0001lf043ehylblc`.

Success means:

- the actual artifact downloads
- auth behavior matches intended operator/customer experience

5. Only after Preview is fully verified, promote the verified state to Production and rerun a narrower Production smoke.

Minimum Production rerun:

- sign-in
- dashboard
- reports
- current downloadable report path
- evidence slice if Production is the intended launch environment

## Recommended Next Work Order

1. Inspect the report-loading path and reconcile the current rendered report route with the canonical Preview database state.
2. Obtain a reviewer/operator-capable path for regeneration if the rendered route is still expected to mutate.
3. Queue or request a fresh report-generation run for `cmog8h1pl0001ii04raoytlal`.
4. Re-run internal analysis dispatch and confirm the new report job completes on the latest Preview deployment.
5. Verify that the regenerated report exposes `Download HTML`.
6. Verify evidence download behavior for `cmogf5tjm0001lf043ehylblc`.
7. Promote the verified Preview state to Production intentionally.
8. Re-run the smaller Production smoke.

## Code Areas Changed Or Relevant

Files touched or especially relevant to this state:

- `apps/web/lib/conversion-funnel.ts`
- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/assessments/[assessmentId]/page.tsx`
- `apps/web/src/server/ai/workflows/audit/checkpoints.ts`
- `apps/web/lib/report-records.ts`
- `apps/web/lib/evidence.ts`
- `apps/web/lib/ai-execution.ts`
- `apps/web/src/server/ai/providers/openai-langgraph.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `apps/web/app/dashboard/reports/[reportId]/actions.ts`
- `apps/web/test/button-routes.test.ts`
- `apps/web/test/evidence.test.ts`
- `docs/evolve-edge-first-customer-engineer-handoff-2026-04-26.md`

## Validation Run In This Pass

Validated on April 26, 2026:

- `apps/web/test/auth-routing.test.ts`
- `apps/web/test/authority-content.test.ts`
- `apps/web/test/button-routes.test.ts`
- `apps/web/test/evidence.test.ts`
- `corepack pnpm --filter @evolve-edge/web typecheck`

Live operator verification completed in this pass:

- deployed Preview build `a58z80mjl`
- successful real Preview evidence upload
- live evidence inventory mutation confirmed
- live SOC 2 website route confirmed
- live onboarding route confirmed
- live report route still blocked on canonical-state / replay resolution
