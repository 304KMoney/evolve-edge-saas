# Enterprise Authorization Model

## What existed before

Before this phase, Evolve Edge had two separate access patterns:

- customer workspace access was driven by `OrganizationMember.role`
- internal admin access was mostly inferred from the `INTERNAL_ADMIN_EMAILS` allowlist

That worked for an early founder-led operating model, but it created three scale risks:

1. internal privileges were not first-class application state
2. permission decisions were spread across direct role checks in pages and actions
3. the boundary between internal operators and customer roles was harder to reason about and test

## What changed

This phase adds a centralized authorization model with:

- a persisted `User.platformRole`
- one policy layer in `apps/web/lib/authorization.ts`
- permission-aware session helpers in `apps/web/lib/auth.ts`
- admin UI support for internal platform-role assignment
- policy-driven checks on the highest-risk flows:
  - internal admin console access
  - internal role assignment
  - billing entry points
  - customer member/invite management
  - monitoring finding updates
  - executive report QA, delivery, and founder-review actions

## Why it matters

This makes authorization:

- explicit instead of hidden in founder memory
- safer to evolve as internal roles increase
- testable at the policy layer
- easier to audit for regulated customers and future enterprise reviews

## Architecture decisions

### 1. The app remains the source of truth

Internal platform roles now live in the product database on `User.platformRole`.

External systems still do not own product access or authorization behavior.

### 2. Backward compatibility is preserved

`INTERNAL_ADMIN_EMAILS` still works as a bootstrap and recovery mechanism.

If a signed-in internal email has `platformRole=NONE`, the policy layer treats that user as an effective `SUPER_ADMIN` for compatibility. That preserves existing internal access while the new platform roles are rolled out intentionally.

### 3. Default deny is the baseline

Customer permissions are granted only when the workspace role explicitly maps to a capability.

Platform permissions are granted only when the effective platform role explicitly maps to a capability.

### 4. Platform and customer scopes stay separate

Customer org permissions and internal platform permissions are evaluated independently through one shared policy layer, but they are not collapsed into one flat role list.

## Role model

### Platform roles

- `NONE`
- `SUPER_ADMIN`
- `OPERATOR`
- `REVIEWER`
- `EXECUTIVE_ADMIN`

### Customer organization roles

- `OWNER`
- `ADMIN`
- `ANALYST`
- `MEMBER`
- `VIEWER`

## Permission model

### Customer organization permissions

- `organization.view`
- `organization.manage`
- `members.view`
- `members.manage`
- `engagements.view`
- `engagements.manage`
- `reports.view`
- `reports.review`
- `reports.deliver`
- `findings.view`
- `findings.manage`
- `evidence.view`
- `evidence.manage`
- `jobs.view`
- `jobs.manage`
- `billing.view`
- `billing.manage`
- `inventory.manage`

### Platform permissions

- `platform.console.view`
- `platform.accounts.view`
- `platform.accounts.manage`
- `platform.analytics.view`
- `platform.audit.view`
- `platform.billing.view`
- `platform.jobs.view`
- `platform.jobs.manage`
- `platform.reviews.manage`
- `platform.roles.manage`

## Source of truth by permission area

- internal admin console: `platform.console.view`
- internal role assignment: `platform.roles.manage`
- customer member/invite management: `members.manage`
- customer billing checkout + portal: `billing.manage`
- inventory management: `inventory.manage`
- monitoring finding updates: `findings.manage`
- report QA actions: `reports.review`
- report delivery actions: `reports.deliver`
- founder review clearance: `organization.manage`

## Environment variables required

No new environment variables were added in this phase.

Existing environment variables still used by the authorization system:

- `INTERNAL_ADMIN_EMAILS`
- `AUTH_MODE`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`

## Migrations required

This phase adds one migration:

- `packages/db/prisma/migrations/20260410193000_enterprise_authorization_platform_roles/migration.sql`

Schema change:

- `User.platformRole`
- enum `PlatformUserRole`

## Manual setup steps

1. Run the database migration.
2. Regenerate Prisma client.
3. Keep current internal users in `INTERNAL_ADMIN_EMAILS` during rollout.
4. Sign in to `/admin` as an existing internal admin.
5. Assign explicit platform roles to the internal team from the Users and memberships panel.
6. After internal roles are verified, the allowlist can remain as a recovery layer or be tightened carefully.

## Test checklist

1. Confirm existing internal allowlist users can still reach `/admin`.
2. Confirm a non-allowlisted customer user cannot reach `/admin`.
3. Confirm a `SUPER_ADMIN` can assign platform roles.
4. Confirm a non-super-admin internal role cannot assign platform roles.
5. Confirm workspace admins can manage members.
6. Confirm analysts can still perform report QA and delivery actions.
7. Confirm analysts cannot manage workspace billing.
8. Confirm owners can still launch checkout and billing portal routes.
9. Confirm viewers cannot update monitoring findings.
10. Confirm audit logs are written for platform role changes.

## Threat and risk notes

- The current bootstrap fallback means an allowlisted email still has effective `SUPER_ADMIN` access even if its persisted role is `NONE`. This is intentional for safe rollout, but the allowlist should be kept small.
- Platform-role assignment currently lives inside the existing admin console rather than a separate identity administration system.
- Impersonation or “view as customer” was intentionally not added in this phase. It is safer to defer that until a read-only, fully auditable implementation is designed.

## Future expansion notes

- add fine-grained internal RBAC or policy objects if platform teams split further
- support custom customer roles backed by policy data instead of enum-only role maps
- add audited impersonation with explicit start/stop records and bannered session state
- add policy coverage to more customer-facing pages that still rely on legacy helper functions for UI-only rendering
