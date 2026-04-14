# Canonical Commercial Consistency

This document defines the current canonical commercial model for Evolve Edge.

## Canonical plan codes

Use these plan codes at commercial and customer-facing boundaries:

- `starter`
- `scale`
- `enterprise`

Use these display names:

- `Starter`
- `Scale`
- `Enterprise`

## Public pricing model

The canonical public pricing model is:

- `Starter`: `$2,500 one-time`
- `Scale`: `$7,500 one-time`
- `Enterprise`: `Custom`

Important:

- The app still contains legacy internal revenue plan records for compatibility.
- Public commercial plan selection is normalized before billing and workflow routing decisions are made.
- `enterprise` remains sales-led and should not be routed to self-serve checkout.

## Internal compatibility layer

The current backend uses an internal revenue-plan layer for billing records and entitlement resolution.

Compatibility rules:

- `starter` -> `starter-annual`
- `scale` -> `scale-annual`
- `enterprise` -> `enterprise-annual`
- legacy `growth-*` revenue plans normalize to canonical commercial plan `scale`

Boundary rule:

- customer-facing and support-facing app surfaces should accept or display only
  `starter`, `scale`, or `enterprise`
- legacy `growth` identifiers remain backend compatibility inputs only and
  should be normalized before they reach checkout, support summaries, or
  customer-visible UX

This keeps existing data and subscription logic stable while exposing one commercial model everywhere outward-facing.

## Billing identifier layers

Evolve Edge now uses three distinct billing identifier layers. Keeping them separate is important for both operator trust and implementation correctness.

- Stripe identifiers
  - examples: `stripeEventId`, `stripeCheckoutSessionId`, `stripePaymentIntentId`, `stripeCustomerId`, `stripeSubscriptionId`
  - purpose: external provider references only
- Canonical commercial plan codes
  - values: `starter`, `scale`, `enterprise`
  - purpose: customer-facing and support-safe plan naming
- Internal revenue-plan codes
  - examples: `starter-annual`, `scale-annual`, `enterprise-annual`
  - purpose: persisted billing compatibility and subscription resolution

Important rule:

- `BillingEventLog.planCodeSnapshot` should store the internal revenue-plan code layer
- `BillingEventLog.canonicalPlanKey` should store the canonical plan enum layer
- support and customer-facing read models should normalize those stored values back to canonical commercial names before display

This means a checkout for `scale` may persist:

- canonical commercial plan: `scale`
- internal billing plan snapshot: `scale-annual`

That is expected and intentional.

## Canonical workflow codes

Use these workflow codes:

- `audit_starter`
- `audit_scale`
- `audit_enterprise`
- `briefing_only`
- `intake_review`

## Canonical report templates

Use these report template identifiers:

- `starter_snapshot`
- `scale_operating_report`
- `enterprise_operating_report`
- `briefing_pack`
- `intake_review_summary`

## Routing lifecycle

Canonical routing order:

1. Stripe or app input arrives
2. Backend normalizes the commercial plan
3. Backend resolves entitlements and limits
4. Backend selects workflow code
5. Backend persists `RoutingSnapshot`
6. Backend queues `WorkflowDispatch`
7. n8n receives normalized execution hints only

## Stripe metadata

Required metadata keys:

- `org_id`
- `customer_email`
- `plan_key`
- `plan_code`
- `revenue_plan_code`
- `environment`
- `source`
- `workflow_type`

Meaning:

- `plan_key`: canonical public commercial plan code
- `plan_code`: canonical public commercial plan code
- `revenue_plan_code`: internal revenue plan used to resolve the billing record safely

## n8n payload contract

`audit.requested` payload includes:

- `routing_snapshot_id`
- `dispatch_id`
- `correlation_id`
- `execution_context`
- `routing.plan_code`
- `routing.workflow_code`
- `routing.report_template`
- `routing.processing_depth`
- `routing.entitlement_summary`
- `routing.quota_state`
- `routing.feature_flags`
- `routing.reason`

n8n must not infer plan logic from Stripe product names or price IDs.

## Dify field conventions

Canonical Dify field names:

- `company_name`
- `contact_name`
- `contact_email`
- `industry`
- `top_concerns`
- `frameworks`
- `plan_code`
- `workflow_code`
- `report_template`
- `processing_depth`

The app now sends canonical `commercial_context` and `routing_context` fields in addition to the existing compatibility payload.

## HubSpot mapping

HubSpot receives normalized values from backend mapping.

Important rule:

- `evolve_edge_plan_code` should receive the canonical commercial plan code, not raw internal revenue-plan drift such as `growth-annual`.

## Environment and deployment

Required env additions for commercial consistency:

- `NEXT_PUBLIC_CONTACT_SALES_URL`
- `HOSTINGER_REFERENCE_URL`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`

## Deferred items

Intentionally deferred:

- first-class HubSpot deal ownership
- one-time billing lifecycle replacement for the existing subscription domain
- hard deletion of legacy `growth-*` revenue plans from persisted data
- speculative add-on packaging

## Rollout notes

1. Set Stripe price and product env vars for Starter, Scale, and Enterprise.
2. Verify `scale-annual` and `starter-annual` are the intended live internal mappings.
3. Update Hostinger pricing and CTA content from the canonical reference.
4. Update n8n workflow nodes to consume canonical routing fields only.
5. Verify HubSpot custom properties exist before rollout.
