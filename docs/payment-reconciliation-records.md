# Payment Reconciliation Records

`PaymentReconciliationRecord` is the durable app-owned record for verified Stripe payment reconciliation.

It exists to bridge:

- raw Stripe webhook receipts in `BillingEvent`
- normalized reconciliation decisions in the app backend
- future customer/report access-grant issuance

Minimum persisted fields:

- `stripeEventId`
- `stripeEventType`
- `checkoutSessionId`
- `stripePaymentReference`
- `customerEmail`
- `selectedPlan`
- `reconciliationStatus`
- `correlationId`

Optional linkage fields keep the model auditable without forcing early hard binding:

- `billingEventId`
- `organizationId`
- `customerAccountId`
- `reportId`

Operational rule:

- Stripe remains the payment-event source only.
- The app must persist reconciliation outcomes here before protected access depends on them.
- Report access issuance should later reference this record instead of deriving authorization from raw webhook payloads.
