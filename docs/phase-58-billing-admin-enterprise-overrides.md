# Phase 58 - Billing Admin and Enterprise Overrides

## What existed before

- Canonical plan keys and subscription snapshots existed through the subscription domain.
- Entitlements already resolved from plan state and supported override records in the database.
- Billing visibility and mutation permissions were tied mostly to workspace role checks, with owners as the only billing managers.
- Settings showed billing state and usage, but there was no dedicated billing-admin designation, no override management workflow, and no clear org-level billing-owner control plane.

## What was implemented

- Added `OrganizationMember.isBillingAdmin` and `OrganizationInvite.isBillingAdmin`.
- Extended authorization so billing admins can:
  - view billing
  - manage billing
  - view usage
- Kept broader org role behavior intact for existing admin and analyst flows where already supported.
- Added a centralized billing administration service in [billing-admin.ts](/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/billing-admin.ts) for:
  - billing owner assignment
  - billing admin assignment
  - entitlement breakdown generation
  - usage quota visibility
  - manual, enterprise, and promo override creation
  - override expiration
- Added audit logging for:
  - billing owner assignment
  - billing admin grant/revoke
  - entitlement override creation
  - entitlement override expiration
- Updated settings to expose:
  - billing owner controls
  - billing admin assignment
  - entitlement breakdown
  - active override list
  - quota window visibility
- Updated the internal org admin detail view to expose:
  - billing owner and billing admins
  - usage quota windows
  - entitlement breakdown
  - active billing overrides
- Updated invite acceptance so staged billing-admin access survives the invite flow.

## Why it matters

- Enterprise customers often separate product admins from finance or procurement contacts.
- Billing ownership is now explicit at the org level instead of being implied by whoever originally provisioned the workspace.
- Entitlement overrides can now be managed in a supportable, auditable way without hiding plan exceptions in Stripe metadata or founder memory.
- Operators and founders can inspect billing state, entitlements, and quota posture without querying the database directly.

## Architecture decisions

- Billing admin is implemented as a membership-level flag instead of a new org role enum.
  - This keeps the existing role model stable.
  - It avoids broad downstream refactors across report, evidence, and monitoring permissions.
- Override logic remains data-driven through `EntitlementOverride`.
  - The resolver stays the source of truth.
  - The new service layer only manages lifecycle and presentation of overrides.
- Billing owner assignment is restricted to members who are either workspace owners or billing admins.
- Internal admin views are read-only in this phase.
  - Customer settings owns the mutation path.
  - Internal admin pages provide safe visibility first.

## Environment variables required

- No new environment variables.
- Existing billing/admin env still matters:
  - `INTERNAL_ADMIN_EMAILS`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`

## Migrations required

- `packages/db/prisma/migrations/20260411060000_billing_admin_enterprise_overrides/migration.sql`

## Test checklist

- Authorization test covers a billing admin member receiving billing and usage permissions without broader org management privileges.
- Billing admin service test covers entitlement breakdown override attribution.
- Run:

```powershell
pnpm db:generate
Set-Location "C:\Users\kielg\OneDrive\Desktop\Evolve Edge\apps\web"
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

## Manual setup steps

1. Apply the Prisma migration and regenerate the client.
2. Sign in as a workspace owner.
3. Open `/dashboard/settings`.
4. Grant billing admin access to a member.
5. Assign a billing owner.
6. Create a manual override for a feature key such as `custom.frameworks` or a limit key such as `users`.
7. Expire that override and verify it no longer appears as active.
8. Open `/admin/accounts/[organizationId]` and verify the new read-only billing visibility sections render.

## Future expansion notes

- Add an internal admin mutation flow for overrides once there is stronger maker/checker policy.
- Add invite editing so pending invites can have billing-admin access toggled before acceptance.
- Add override scoping beyond organization level if enterprise packaging later needs per-engagement exceptions.
- Add customer-facing billing contacts history if the sales and finance workflow needs ownership transitions tracked over time.
