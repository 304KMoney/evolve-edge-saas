# Operator Workflow Event Records

`OperatorWorkflowEventRecord` is the minimal durable event stream for
first-customer operator visibility.

It is intended to capture the important lifecycle points operators need to
understand without building a full admin workflow product.

Supported event codes:

- `PAYMENT_RECEIVED`
- `RECONCILIATION_COMPLETE`
- `ACCESS_GRANT_ISSUED`
- `INTAKE_RECEIVED`
- `REPORT_PROCESSING`
- `REPORT_READY`
- `REPORT_DELIVERED`
- `DELIVERY_FAILED`

Minimum persisted fields:

- `eventCode`
- `message`
- `createdAt`

Optional linkage:

- `organizationId`
- `customerAccountId`
- `reportId`
- `paymentReconciliationId`
- `eventKey`
- `metadata`

Severity:

- Reuses `CustomerAccountTimelineSeverity` so operator surfaces can distinguish
  informational progress from warnings or critical failures without another
  status taxonomy.

Operational rule:

- Use this record as the durable audit-friendly source for operator workflow
  visibility.
- It can later power dashboard timelines, operator inbox views, or per-customer
  activity feeds without changing the canonical payment/report models.
