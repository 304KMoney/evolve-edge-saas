# Admin System State Debugger

Route: `/admin/system-state`

This internal page gives operators support-safe visibility into launch-critical
state without turning Stripe, n8n, HubSpot, or AI providers into sources of
truth.

## Access Control

- Requires `platform.audit.view`.
- Access is resolved through the existing platform role system and
  `INTERNAL_ADMIN_EMAILS` allowlist fallback.
- The page writes an `admin.system_state_viewed` audit log entry when viewed.

## Visible State

- Users and organization memberships
- Organizations, onboarding state, subscription status, latest routing snapshot
- Audits and lifecycle status
- Routing snapshots and routing decision JSON
- Workflow dispatches and last errors
- AI analysis job attempts and last errors
- Reports, delivery state, and briefing availability
- Audit logs and operator workflow events

## Debug Fields

The UI intentionally highlights:

- current status
- last error
- last workflow run
- `snapshot_id`
- dispatch id
- provider request id
- report and briefing readiness

## Safety Notes

- Do not add raw passwords, secrets, card data, or full AI payloads here.
- Keep this page read-only unless a separate reviewed recovery action is added.
- Treat it as a support/debug view, not a customer-facing source of truth.

## Manual QA

1. Sign in as an internal admin or allowlisted admin email.
2. Open `/admin/system-state`.
3. Search by organization name.
4. Search by `snapshot_id`.
5. Confirm users, organizations, audits, routing snapshots, reports, and logs render.
6. Confirm a non-admin user is redirected away from the route.
7. Confirm no passwords, secrets, or raw payment data are displayed.
