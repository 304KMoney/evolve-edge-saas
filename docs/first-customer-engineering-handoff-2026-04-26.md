# Evolve Edge First-Customer Engineering Handoff

Date: April 26, 2026  
Repo: `C:\Users\kielg\Documents\EvolveEdge\evolve-edge-saas`  
Branch: `codex-launch-hardening-handoff`  
Current handoff commit: `627f6cbed04d299f73d5ab539c67d81144bc3270`

## Executive Summary

The codebase is close to first-customer readiness. The core app-owned architecture is in place, Preview parity has been stabilized for most of the customer path, and the remaining work is now mostly launch hardening, operator verification, and a small number of end-to-end completion steps rather than broad product building.

The realistic state is:

- Roughly 90% of the first-customer engineering work is done.
- Next.js and Neon are now clearly acting as the canonical product control plane for pricing, onboarding, report state, evidence, and customer-visible delivery status.
- The highest-risk ambiguity in report finalization was already cleaned up on this branch.
- The public pricing flow was upgraded so Starter and Scale can start an app-owned access flow instead of dumping the customer onto a generic sign-in page.
- The remaining work is not “build the platform.” It is “finish the last 10% safely, verify Preview end to end, and only then consider production launch.”

## What Has Already Been Completed

### 1. Report finalization path was hardened

The main launch blocker was report state inconsistency. That is now materially improved.

- Canonical path is now:
  - assessment
  - durable report record
  - report view-model
  - report page
  - export route
- Normalized app-owned report content now wins over stale artifact metadata or a later workflow failure.
- Reports with durable normalized content are treated as exportable.
- Reports with no usable content plus failure state are treated as failed/retryable.
- Reports with no usable content and no failure remain pending.
- The ambiguous “Export pending” state was removed when the backend already has enough canonical content to export.
- Raw workflow payloads are no longer the customer-facing truth source for export readiness.

Relevant files already changed:

- `apps/web/lib/report-artifacts.ts`
- `apps/web/lib/report-export.ts`
- `apps/web/lib/report-records.ts`
- `apps/web/lib/report-view-model.ts`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `docs/report-finalization-path.md`

### 2. Export route was hardened

- Export now reads canonical app-owned report data.
- Export returns downloadable HTML when normalized report content exists.
- Export fails closed with API-style responses for invalid, unauthorized, missing, or not-exportable requests.
- Export readiness no longer depends on n8n, Stripe, HubSpot, or raw AI payloads.

### 3. Dashboard SOC 2 visibility was improved

The user flagged that SOC assets were not visible enough from the dashboard. This was improved without redesigning the app.

- Added a dashboard “Framework Resources” section.
- Selected frameworks such as SOC 2 can now surface their linked authority/resource page from the dashboard.
- This makes the existing SOC 2 materials discoverable from the main product surface.

Relevant files already changed:

- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`

### 4. Pricing CTA flow was upgraded

The public pricing page used to send unauthenticated users to generic sign-in first. That was not realistic for first-customer conversion.

The new app-owned flow now does this:

1. Customer chooses Starter or Scale on `/pricing`.
2. CTA routes to `/start?plan=starter` or `/start?plan=scale`.
3. Customer submits work email and company name.
4. The app captures the lead, creates or refreshes the user record, and queues login emails.
5. If the customer does not already have a usable password credential, the app issues a temporary password and sends it in a second email.
6. The sign-in link routes back into canonical onboarding so plan selection carries into workspace creation and first assessment setup.

Safety behavior:

- Existing customers with active workspace access do not get their live password reset from this public flow.
- New or pre-onboarding customers can receive app-owned temporary credentials.
- This remains owned by Next.js plus Neon, not by n8n or HubSpot.

Relevant files already changed:

- `apps/web/lib/pricing.ts`
- `apps/web/lib/pricing-access.ts`
- `apps/web/app/pricing/page.tsx`
- `apps/web/app/start/page.tsx`
- `apps/web/app/start/actions.ts`
- `apps/web/lib/email.ts`
- `docs/pricing-access-workflow.md`

## Tests Already Verified On This Branch

The following commands were run successfully on April 26, 2026:

```powershell
corepack pnpm --filter @evolve-edge/web exec tsx test/button-routes.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/auth-routing.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/pricing-access.test.ts
corepack pnpm --filter @evolve-edge/web typecheck
```

Earlier validated launch-hardening coverage on this branch also included:

```powershell
corepack pnpm --filter @evolve-edge/web exec tsx test/evidence.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/authority-content.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/report-review.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/executive-delivery.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/audit-workflow-checkpoints.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/report-view-model.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/report-artifacts.test.ts
corepack pnpm --filter @evolve-edge/web exec tsx test/report-export.test.ts
```

## Current Realistic Launch State

### Green or Mostly Green

- Button route coverage
- Onboarding structure
- Dashboard framework resource visibility
- Evidence upload path
- App-owned report exportability mapping
- Report page state handling
- Auth/session routing fundamentals
- Pricing-to-onboarding lead carry-forward

### Still Needs Explicit First-Customer Verification

- Same-session evidence download on Preview after upload
- New `/start` pricing access flow against the actual Preview environment
- Real email dispatch verification for the two-email pricing access path
- Full report regeneration/retry replay in Preview after a failed state
- Final report HTML download from the latest Preview deployment after fresh run
- Production-readiness checklist review before any launch decision

## Remaining Work To Get To First Customer

This is the realistic “last 10%” list.

### Priority 1: Verify the new pricing access flow in Preview

Goal: confirm the public conversion path is real, not just locally typed.

Required checks:

1. Open `/pricing`.
2. Confirm Starter and Scale buttons route to `/start?plan=...`, not generic sign-in.
3. Submit a real test email and company on `/start`.
4. Confirm:
   - user record is created or updated
   - lead capture is persisted
   - login guide email is queued
   - credentials email is queued when needed
5. Trigger email dispatch and verify both emails render correctly.
6. Use the emailed credentials and confirm sign-in lands in onboarding or dashboard as intended.

If there is a break here, the likely files are:

- `apps/web/app/start/actions.ts`
- `apps/web/lib/email.ts`
- `apps/web/lib/auth.ts`
- `apps/web/app/sign-in/actions.ts`
- `apps/web/app/onboarding/page.tsx`

### Priority 2: Re-verify report finalization end to end in Preview

Goal: ensure the cleaned-up canonical mapping really resolves the stuck Preview report scenario.

Required checks:

1. Open the known Preview report record.
2. Confirm the page shows one of these states only:
   - `Download HTML`
   - clear retry/regeneration action
   - clear processing state
3. Confirm it does not show ambiguous “Export pending” when durable report content exists.
4. Confirm customer UI does not expose raw AI payloads.
5. Hit the export route while authenticated and confirm HTML download succeeds when expected.

If it breaks:

- `apps/web/lib/report-artifacts.ts`
- `apps/web/lib/report-export.ts`
- `apps/web/lib/report-view-model.ts`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`

### Priority 3: Verify safe retry/regeneration on Preview

Goal: prove a failed report can be replayed safely without duplicate uncontrolled records.

Required checks:

1. Start from a failed or retryable report state.
2. Trigger the regeneration path.
3. Confirm the same assessment/report lineage is reused.
4. Confirm operator-visible metadata updates for debugging.
5. Confirm final report state transitions reconcile cleanly.

Do not move any of this logic into n8n. The app must remain the routing and business-logic owner.

### Priority 4: Verify same-session evidence download

Goal: confirm a customer can upload evidence and then immediately retrieve it in the same authenticated org-scoped session.

Required checks:

1. Upload a file as an authenticated org user.
2. Open the evidence detail or download action immediately after upload.
3. Confirm:
   - org-scoped access is preserved
   - auth is required
   - no permission weakening occurred

If it breaks:

- `apps/web/lib/evidence.ts`
- evidence route/action files
- authorization/session helpers

### Priority 5: Perform final first-customer preflight

Before first customer, the assigned engineer should explicitly walk this checklist:

- Preview env vars are correct
- Resend credentials are correct
- Stripe is configured for the intended environment
- auth bootstrap behavior is understood and acceptable
- no unresolved broken customer-facing CTAs remain
- report export works
- evidence download works
- onboarding completes
- billing handoff is correct
- no production promotion happens until Preview is fully green

## What I Would Actually Ask The Next Full-Stack Engineer To Do

This is the realistic work order, in sequence.

### Day 1

1. Pull `codex-launch-hardening-handoff` at commit `627f6cb`.
2. Run the targeted tests above and confirm local parity.
3. Validate the `/start` pricing workflow in Preview using a real test inbox.
4. Validate the two-email path:
   - login instructions
   - temporary credentials
5. Confirm sign-in from the email lands in onboarding or dashboard correctly.

### Day 2

1. Re-run the known stuck report scenario in Preview.
2. Confirm export/download behavior is now deterministic.
3. Confirm failed/retryable and pending states render correctly.
4. Run retry/regeneration on a failed report.
5. Verify same-session evidence download.

### Day 3

1. Close any Preview-only regressions uncovered in the above flows.
2. Re-run focused tests plus typecheck.
3. Document exact Preview verification results.
4. Hand back a go/no-go launch recommendation based on Preview only.

## What Should Not Be Rebuilt

The next engineer should avoid wasting time in these areas unless new evidence shows regression:

- broad frontend routing re-audit
- major dashboard redesign
- replacing app-owned report state with workflow state
- moving business logic into n8n
- moving commercial logic into Stripe
- moving canonical state into HubSpot
- broad auth rewrite
- schema churn without a concrete blocker

This repo is already at the phase where unnecessary rewrites create more launch risk, not less.

## Architecture Rules That Must Stay Intact

- Next.js owns product logic and customer-visible state.
- Neon/Postgres is the source of truth.
- Stripe is billing authority only.
- n8n is orchestration only.
- LangGraph is workflow orchestration only.
- OpenAI is model execution only.
- HubSpot is CRM projection only.
- Hostinger is brochure/top-of-funnel only.

Implication:

- Pricing, onboarding state, report state, export readiness, evidence access, and customer-visible delivery status should remain app-owned.

## Important Files For The Next Engineer

### Report/export slice

- `apps/web/lib/report-artifacts.ts`
- `apps/web/lib/report-export.ts`
- `apps/web/lib/report-records.ts`
- `apps/web/lib/report-view-model.ts`
- `apps/web/app/api/reports/[reportId]/export/route.ts`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`

### Pricing/start/auth/email slice

- `apps/web/lib/pricing.ts`
- `apps/web/lib/pricing-access.ts`
- `apps/web/app/pricing/page.tsx`
- `apps/web/app/start/page.tsx`
- `apps/web/app/start/actions.ts`
- `apps/web/lib/email.ts`
- `apps/web/lib/auth.ts`
- `apps/web/app/sign-in/actions.ts`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/app/onboarding/page.tsx`

### Evidence slice

- `apps/web/lib/evidence.ts`
- related dashboard evidence routes and actions

### Supporting docs

- `docs/report-finalization-path.md`
- `docs/pricing-access-workflow.md`

## Known Operational Notes

- The local worktree may contain many untracked smoke files and temporary artifacts. Those are not part of the intended code changes.
- Do not reset or wipe the worktree casually.
- The branch was committed and pushed, but the new pricing-access flow still needs explicit Preview runtime verification.
- No schema migration was added for the work completed here.
- No production promotion was performed.

## Concrete Go / No-Go Criteria For First Customer

### Go only if all are true

- Starter and Scale public CTAs start the app-owned access flow
- customer receives the correct login email path
- temporary credentials are sent when required
- onboarding completes
- first assessment is created or queued correctly
- report page shows deterministic state
- report HTML export works
- evidence upload and download both work in the same authenticated session
- Preview env behaves consistently across repeated runs

### No-Go if any of these remain broken

- customer gets stranded at generic sign-in with no access path
- report page still shows ambiguous export state
- export route fails for contentful reports
- evidence download is broken
- retry/regeneration duplicates records or loses lineage
- email dispatch is not verified

## Final Recommendation

The repo is in a good position for a short, disciplined final pass to first customer. The correct move now is not a rewrite. It is a focused Preview verification sprint with small fixes only, centered on:

1. pricing access and login emails
2. deterministic report export/finalization
3. evidence download verification
4. safe retry/regeneration validation

If the next engineer stays inside those boundaries, first-customer readiness is realistic from this branch.
