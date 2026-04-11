# Demo Mode Environment

## What existed before

Evolve Edge already had:

- a lightweight auth fallback when `AUTH_MODE` was not `password`
- a single seeded workspace for local exploration
- strong internal product surfaces for reports, evidence, monitoring, KPI views, and operations

What was missing was a real demo environment contract:

- no clear environment-level labeling
- no central safeguard to suppress live external side effects
- no guided founder demo route
- no explicit demo seed/reset workflow

## What changed

- Added a centralized demo policy layer in `apps/web/lib/demo-mode.ts`
- Added a top-level demo banner in `apps/web/components/demo-mode-banner.tsx`
- Added a guided demo route at `/dashboard/demo`
- Added deterministic demo catalog content in `packages/db/src/demo-catalog.ts`
- Added a dedicated demo seed entrypoint in `packages/db/prisma/demo-seed.ts`
- Added demo reset/seed scripts in `package.json` and `packages/db/package.json`
- Added demo-mode guards to Stripe checkout, Stripe portal, outbound webhook dispatch, HubSpot sync, and email dispatch
- Updated the main dashboard nav so demo environments can reach the guided demo route directly

## Architecture decisions

- Demo mode is an environment policy, not a hidden UI-only toggle.
- Product state still lives in the normal application database and code paths.
- External side effects are blocked centrally by policy in demo mode unless explicitly re-enabled.
- Demo seeding is deterministic and driven by fixed sample definitions rather than ad hoc manual edits.
- Demo routing stays inside the authenticated app so the founder can move directly from buyer-facing pages into the seeded workspace.

## Environment variables

- `DEMO_MODE_ENABLED`
  - Optional
  - Forces demo mode on even when `AUTH_MODE=password`
- `DEMO_EXTERNAL_SIDE_EFFECTS`
  - Optional
  - Defaults to `false` when demo mode is enabled
  - Keep `false` for investor and prospect demos
- `DEMO_RESET_COMMAND`
  - Optional
  - Cosmetic label shown in the demo banner
- `DEMO_MODE_LABEL`
  - Optional
  - Cosmetic label shown in the demo banner

## Migrations required

None

## Commands

Standard local demo seed:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed:demo
```

Reset and reseed the entire demo dataset:

```powershell
pnpm db:reset:demo
```

Validate the web app:

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

## Manual setup

1. Set `AUTH_MODE=demo` or `DEMO_MODE_ENABLED=true`.
2. Keep `DEMO_EXTERNAL_SIDE_EFFECTS=false`.
3. Run `pnpm db:seed:demo`.
4. Start the app with `pnpm dev`.
5. Open `/dashboard/demo` for the presentation guide.
6. Use `/admin` and `/admin/kpis` during the operator and leadership sections of the demo.

## Recommended presentation flow

1. Start on `/` and `/pricing`
2. Open `/trust`, `/frameworks`, and `/methodology`
3. Move into `/dashboard`
4. Show `/dashboard/evidence`, `/dashboard/frameworks`, `/dashboard/monitoring`, and `/dashboard/reports`
5. Finish in `/admin` and `/admin/kpis`

## Safety behavior

In demo mode with external side effects disabled:

- Stripe checkout and portal launches are blocked
- outbound webhook dispatch is suppressed
- HubSpot sync destinations are suppressed
- email dispatch is suppressed

This keeps demos believable without risking real customer communication or billing calls.

## Future expansion notes

- Move demo storage and demo database provisioning into a dedicated hosted staging workflow
- Add a separate demo login identity if hosted investor demos need password auth instead of auto-access
- Add richer demo analytics snapshots if leadership dashboards need longer fake time series
