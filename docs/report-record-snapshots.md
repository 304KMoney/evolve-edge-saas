# Report Record Snapshots

The existing `Report` model is the durable report record for the dashboard and
delivery layer.

For first-customer operations, the model now carries a small set of snapshot
fields so report delivery does not have to re-derive core customer-facing
metadata from upstream workflow payloads on every read.

Snapshot fields:

- `organizationNameSnapshot`
- `customerEmailSnapshot`
- `selectedPlan`
- `executiveSummary`
- `overallRiskPostureJson`
- `artifactMetadataJson`

Linkage:

- `customerAccountId` links a report to the app-owned customer record when one
  exists.

Storage strategy:

- `executiveSummary` is stored directly for fast dashboard/detail reads.
- `overallRiskPostureJson` stores normalized posture summary data.
- `reportJson` remains the practical first-customer container for findings,
  gaps, actions, and roadmap sections.
- `artifactMetadataJson` is the placeholder storage seam for durable artifact
  metadata beyond the current `pdfUrl`.

Operational rule:

- Dashboard report pages should continue reading from `Report`.
- Delivery/report generation can progressively populate these snapshot fields
  without breaking current route behavior.
