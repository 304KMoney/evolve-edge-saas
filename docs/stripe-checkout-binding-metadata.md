# Stripe Checkout Binding Metadata

Use Stripe Checkout Session metadata as the first reconciliation bridge between
payment activity and protected customer/report access.

Recommended metadata fields:

- `org_id`
- `customer_email`
- `customer_id`
- `plan_code`
- `revenue_plan_code`
- `correlation_id`
- `source`
- `workflow_type`

Field expectations:

- `org_id`: internal organization identifier when the checkout is workspace-owned
- `customer_email`: normalized customer email used for fallback reconciliation
- `customer_id`: internal user/customer identifier when available
- `plan_code`: canonical public plan code: `starter`, `scale`, or `enterprise`
- `revenue_plan_code`: internal billing plan code used by the app billing layer
- `correlation_id`: app-generated payment/binding correlation key for later webhook joins
- `source`: checkout initiation source such as `app.checkout`
- `workflow_type`: narrow billing flow label such as `subscription_checkout`

Where to attach later:

- Attach these fields in the Stripe Checkout Session creation path in
  [apps/web/lib/billing.ts](C:/Users/kielg/OneDrive/Desktop/Evolve%20Edge/apps/web/lib/billing.ts)
  via `buildStripeContextMetadata(...)`.
- Keep webhook-driven reconciliation responsible for reading that metadata and
  populating the internal payment/customer/report binding record.

Implementation note:

- `plan_code` should always use the canonical internal public commercial model:
  `starter`, `scale`, `enterprise`.
- `correlation_id` should be app-generated and stable for the checkout/binding
  lifecycle; it should not be inferred from raw Stripe product names later.
