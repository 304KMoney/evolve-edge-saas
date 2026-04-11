# Entitlement Resolution System

## What existed before

Evolve Edge already had a useful `getOrganizationEntitlements()` helper, but it mostly acted as a UI-facing snapshot:

- plan features were inferred from plan records and revenue catalog entries
- some backend paths relied on those booleans indirectly
- plan capability checks were not yet a first-class backend policy surface

That meant pricing behavior existed, but the enforcement model was not yet explicit enough for long-term growth.

## What this phase implements

This phase adds a backend-first entitlement system that translates plans into product capabilities.

Core additions:

- canonical entitlement feature keys
- canonical entitlement limit keys
- centralized resolution logic in [entitlements.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/entitlements.ts)
- guard helpers for:
  - `hasFeature()`
  - `requireEntitlement()`
  - `requirePlanAtLeast()`
- org-scoped override scaffolding through `EntitlementOverride`
- backend enforcement updates across key server actions and internal routes

## Entitlement keys

### Feature keys

- `workspace.access`
- `assessments.create`
- `reports.view`
- `reports.generate`
- `roadmap.view`
- `members.manage`
- `billing.portal`
- `evidence.view`
- `evidence.manage`
- `uploads.manage`
- `monitoring.view`
- `monitoring.manage`
- `executive.reviews`
- `executive.delivery`
- `frameworks.view`
- `frameworks.manage`
- `custom.frameworks`
- `api.access`
- `priority.support`

### Limit keys

- `users`
- `audits`
- `uploads`
- `monitoring_assets`
- `frameworks`
- `reports_generated`
- `storage_bytes`
- `ai_processing_runs`

## Plan to entitlement mapping

The app now resolves entitlements from:

1. canonical plan key
2. revenue-plan variant, when present
3. workspace mode
4. active entitlement overrides

Rules:

- canonical plan defaults provide the baseline
- revenue-plan variants refine the baseline with current packaged limits and premium features
- read-only workspaces automatically lose mutating capabilities
- demo workspaces still resolve through backend logic, but get demo-safe workspace access

## Override scaffolding

`EntitlementOverride` supports future enterprise and promo exceptions without scattering special cases.

Fields include:

- `organizationId`
- `entitlementKey`
- `enabled`
- `limitOverride`
- `source`
- `reason`
- `expiresAt`

Current sources:

- `ENTERPRISE`
- `PROMO`
- `MANUAL`

This phase adds the data model and resolver support only. It does not yet add admin mutation UI for overrides.

## Backend enforcement added

The following paths now use backend entitlement checks directly:

- assessment creation and submission
- report generation
- evidence upload and review actions
- monitoring finding update actions
- membership and invite actions
- vendor/model inventory actions
- billing portal route

This keeps UI rendering downstream of backend decisions instead of making the page layer the real authority.

## Architecture decisions

### Keep the compatibility snapshot

`EntitlementSnapshot` still returns legacy fields used by current pages:

- `canCreateAssessment`
- `canAccessReports`
- `canManageBilling`
- `features`

That preserves current working flows while moving enforcement into a stronger backend model.

### Use explicit entitlement keys instead of scattered plan checks

The app should ask:

- “does this org have `reports.generate`?”

not:

- “is this plan growth annual?”

That keeps pricing packages flexible.

### Overrides are org-scoped and time-aware

Overrides are resolved only when active:

- `expiresAt` in the future, or unset

This keeps promo and enterprise exceptions explicit and safely removable.

## Environment variables required

No new environment variables are required for this phase.

## Migrations required

- `20260411050000_entitlement_resolution_system`

## Manual setup steps

1. Apply the Prisma migration.
2. Regenerate Prisma client.
3. If you want local override fixtures, insert `EntitlementOverride` rows manually or via a local script.
4. Verify backend-enforced flows:
   - create assessment
   - generate report
   - upload evidence
   - update monitoring finding
   - create invite
   - open billing portal

## Test checklist

1. Confirm canonical plan comparison behaves predictably.
2. Confirm revenue-plan variants resolve expected features and limits.
3. Confirm read-only mode strips mutating entitlements.
4. Confirm expired overrides do not apply.
5. Confirm active overrides can grant premium features or raise limits.
6. Confirm backend routes and server actions still typecheck and pass tests.

## Future expansion notes

- Add internal UI for creating and expiring entitlement overrides.
- Move more backend flows to explicit entitlement checks as additional capabilities are added.
- Add audit-log emission for entitlement override create/update/delete actions when the admin surface is built.
- If custom roles grow, keep authorization and entitlements separate:
  - authorization decides who may act
  - entitlements decide what the org has purchased or been granted
