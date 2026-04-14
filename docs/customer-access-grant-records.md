# Customer Access Grant Records

`CustomerAccessGrantRecord` is the durable app-owned record for protected report access.

It is intentionally narrow and should represent only the backend access decision,
not a full auth or identity platform.

Minimum persisted fields:

- `userId`
- `customerEmail`
- `organizationId`
- `selectedPlan`
- `scopeType`
- `reportId`
- `grantStatus`
- `issuedAt`
- `expiresAt`

Optional linkage:

- `paymentReconciliationId`
- `customerAccountId`

Operational rule:

- Protected report routes should eventually read durable grant state from this
  model before falling back to broader organization-scoped access.
- Stripe payment reconciliation may issue a grant at organization scope first,
  then later narrow access to a specific report once delivery artifacts exist.
