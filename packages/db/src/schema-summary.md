# Initial Database Schema Summary

The schema is designed around one rule:

- every customer-facing record belongs to an `organization`

## Core domains

- Identity: `User`, `Organization`, `OrganizationMember`
- Billing: `Plan`, `Subscription`
- Assessment engine: `Assessment`, `AssessmentSection`, `EvidenceFile`, `AnalysisJob`
- Outcomes: `Finding`, `Recommendation`, `Report`
- Governance extensions: `Framework`, `FrameworkControl`, `OrganizationFramework`
- Platform trust: `Notification`, `AuditLog`
- AI inventory: `Vendor`, `AIModel`

