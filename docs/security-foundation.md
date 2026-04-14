# Security Foundation

## Overview

Evolve Edge uses the backend as the policy enforcement layer for security-sensitive
decisions. Stripe, HubSpot, n8n, and Dify are treated as integrated systems, not
policy authorities. Security-sensitive routing, report access, and workflow state
changes are normalized and enforced inside the application backend.

Current trust-center, framework, methodology, and security-posture pages should
be understood as implementation-backed product posture scaffolding, not as
completed certifications, external attestations, or finished legal/security
artifact packs. Where the site marks an item as `planned`, that distinction is
intentional and should be preserved.

## Trust-Claim Matrix

Use this matrix when reviewing current trust, security, framework, or buyer
enablement language.

### Implemented and defensible

- App-owned system of record
  - supported by backend-owned billing, routing, delivery, audit, and report
    state in Neon
  - supporting systems:
    - `apps/web/lib/billing.ts`
    - `apps/web/lib/workflow-routing.ts`
    - `apps/web/lib/commercial-routing.ts`
    - `apps/web/lib/executive-delivery.ts`
- Authentication and access control
  - supported by password auth, revocable sessions, org permissions, and
    backend-gated report/evidence access
  - supporting systems:
    - `apps/web/lib/auth.ts`
    - `apps/web/lib/authorization.ts`
    - `apps/web/app/api/reports/[reportId]/export/route.ts`
    - `apps/web/app/api/evidence/[evidenceId]/download/route.ts`
- Tenant isolation and scoped access
  - supported by org-scoped reads/writes and explicit scoped-access helpers in
    the highest-risk mutation paths
  - supporting systems:
    - `apps/web/lib/scoped-access.ts`
    - org-scoped query/service layers across reports, evidence, customer runs,
      delivery packages, and queue mutations
- Auditability and operational traceability
  - supported by `AuditLog`, `DomainEvent`, structured logs, billing receipts,
    customer runs, and admin/operator views
  - supporting systems:
    - `apps/web/lib/audit.ts`
    - `apps/web/lib/monitoring.ts`
    - `apps/web/lib/customer-runs.ts`
    - `apps/web/app/admin/*`
- Stripe-verified billing controls
  - supported by server-side webhook verification, idempotent billing-event
    claiming, app-owned plan mapping, and customer portal flows
  - supporting systems:
    - `apps/web/lib/security-webhooks.ts`
    - `apps/web/app/api/stripe/webhook/route.ts`
    - `apps/web/lib/billing.ts`

### Implemented, but phrase carefully

- Executive delivery discipline
  - supported by versioned report packages, QA review, founder-review flags,
    and delivery progression tracking
  - this is defensible as an internal control and delivery-rigor signal, not as
    a formal assurance certification
- Security posture / compliance posture
  - supported as modular, implementation-backed posture scaffolding and control
    descriptions
  - this should not be phrased as completed certification, external attestation,
    or a full legal/security packet unless those artifacts actually exist
- Data handling and storage practices
  - supported at a technical level through backend-controlled storage/access
    paths and data classification fields
  - should be phrased carefully because formal retention/deletion/legal artifact
    coverage is not yet complete and evidence bytes still live on local disk in
    the current implementation
- Recovery-oriented workflow design
  - supported by customer runs, webhook delivery retries, replay tooling, and
    operator queue surfaces
  - should be phrased as operational recoverability, not as guaranteed
    zero-loss or zero-interruption processing

### Planned or not yet supportable

- Security questionnaire pack
  - intentionally marked `planned`
  - no finished downloadable pack or founder-maintained response library should
    be implied yet
- Data handling and retention summary
  - intentionally marked `planned`
  - current implementation supports internal technical explanation, but not yet
    a finished external legal/privacy artifact set
- Certification or attestation-style claims
  - not supported unless and until the platform has the underlying external
    certification or formal assessment artifacts
- Managed-object-storage-style evidence claims
  - not supported by the current implementation because evidence bytes are
    currently stored under `EVIDENCE_STORAGE_ROOT`, not a public cloud-object
    storage control plane

## Audit Logging

The platform writes audit records to the existing `AuditLog` table. The security
foundation expands that model with:

- `actorType`
- `actorLabel`
- `resourceType`
- `resourceId`
- `dataClassification`
- `requestContext`

Audit logging is used for:

- user actions
- workflow triggers and callbacks
- report export access
- billing and provisioning events

Traceability currently relies on three complementary backend-owned layers:

- `AuditLog` for durable actor/resource actions that matter for customer trust
- `DomainEvent` for lifecycle transitions and downstream automation handoff
- structured server logs plus operational alerts for request-level diagnostics,
  retries, and failure investigation

These layers overlap intentionally. A critical flow may emit more than one of
them, but they do not serve the same purpose.

## RBAC

The canonical customer-facing roles are:

- `admin`
- `analyst`
- `client_viewer`

These map onto persisted organization roles:

- `admin` -> `ADMIN`
- `analyst` -> `ANALYST`
- `client_viewer` -> `VIEWER`

Org-level permissions are enforced through the backend authorization layer. External
systems do not decide access permissions.

## Input Validation

All new inbound API/webhook hardening uses centralized validators in
`apps/web/lib/security-validation.ts`.

These helpers:

- require valid JSON
- reject malformed payloads
- normalize strings and arrays
- constrain enum-like fields
- bound numeric query inputs

## Webhook Security

Stripe webhook verification is centralized in
`apps/web/lib/security-webhooks.ts`.

Security guarantees:

- signature verification is mandatory
- raw request bodies are preserved for verification
- invalid signatures fail closed
- webhook routes are rate limited

## Rate Limiting

Foundational route protection is implemented in
`apps/web/lib/security-rate-limit.ts`.

Current behavior:

- API endpoints use one configurable limit
- webhooks use a stricter configurable limit
- invalid or excess traffic receives a fail-closed response

Current limitation:

- rate limiting is in-memory and process-local
- for multi-instance production scaling, migrate this to shared storage

## Report Access Control

Report export access supports:

- authenticated organization access
- signed download tokens
- authenticated signed download access by default outside local development
- export audit logging

Signed report tokens:

- are HMAC-signed
- include report and organization binding
- expire automatically
- fail closed if invalid or expired
- are only accepted for reports that have actually reached delivery state

Operational default:

- `REPORT_DOWNLOAD_REQUIRE_AUTH` should stay `true` in preview and production
- when the env var is omitted, the backend still requires auth for signed report
  access outside `development`
- set `AUTH_MODE=demo` explicitly if you want demo auth behavior; missing
  `AUTH_MODE` no longer implies demo access

## Artifact Storage And Access Paths

The current artifact model is split between backend-owned metadata and
backend-controlled access paths:

- `Report.reportJson` stores the canonical report body in Neon
- `ReportPackageVersion` stores executive delivery packet snapshots in Neon
- `EvidenceFile` and `EvidenceFileVersion` store metadata in Neon
- evidence file bytes are stored on local disk under `EVIDENCE_STORAGE_ROOT`
  via `storageKey`

Current access paths:

- reports are exported through `/api/reports/[reportId]/export`
- evidence files are downloaded through `/api/evidence/[evidenceId]/download`
- evidence version downloads also use `/api/evidence/[evidenceId]/download`
  with `versionId`
- report and evidence workspace pages link to those backend routes instead of
  exposing direct storage paths

Current control model:

- report export is organization-scoped and can additionally allow signed access
  when the signed token matches both `reportId` and `organizationId`
- evidence download is organization-scoped and requires `evidence.view`
- evidence upload, replacement, review, and processing actions require
  `evidence.manage` plus entitlement checks where applicable

Known boundary notes:

- `Report.pdfUrl` still exists in the schema, but the current workspace export
  path uses backend-rendered HTML downloads instead of direct PDF storage links
- the audited code path still references `Report.pdfUrl` in one dashboard summary
  label, but it does not currently behave like an active artifact access route
- `ReportPackageVersion.packetJson` and related summary JSON fields are persisted
  delivery artifacts in Neon, not direct storage links or public file paths
- evidence bytes are not served from a public object store in the current
  implementation; the app resolves local file paths from tenant-scoped metadata
- artifact ownership is explicit for `Report`, `ReportPackage`, `EvidenceFile`,
  and `EvidenceFileVersion`, but access patterns are not yet uniform because
  report export supports signed delivery access while evidence access does not

## Data Classification

The schema now tracks data classification on persisted records:

- `Organization`
- `WorkflowDispatch`
- `EvidenceFile`
- `EvidenceFileVersion`
- `Report`
- `AuditLog`

Canonical values:

- `NON_SENSITIVE`
- `SENSITIVE`

This gives the platform a base for later retention, export, masking, and storage
policy decisions.

## Secrets Handling

Secrets are accessed through centralized runtime config helpers. Operational logging
uses metadata redaction before writing logs or outbound alerts.

Rules:

- do not log raw secrets
- do not embed webhook secrets in business logs
- do not let downstream tools own trust decisions
- keep `NEXT_PUBLIC_*` usage limited to intentional public site/config values,
  not API keys or shared secrets
- a small number of server-only legacy `process.env` reads still exist for auth
  seed defaults, billing compatibility defaults, and cookie `secure` flags; keep
  those paths server-only until they are folded into the shared runtime boundary

## Environment Variables

Required or security-relevant variables include:

- `AUTH_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `PROVISION_ORG_API_TOKEN`
- `STRIPE_WEBHOOK_SECRET`
- `N8N_CALLBACK_SECRET`
- `DIFY_DISPATCH_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`
- `OPS_READINESS_SECRET`
- `COMMERCIAL_REFERENCE_SECRET`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX_REQUESTS`
- `WEBHOOK_RATE_LIMIT_WINDOW_MS`
- `WEBHOOK_RATE_LIMIT_MAX_REQUESTS`
- `REPORT_DOWNLOAD_REQUIRE_AUTH`

## Secured Routing Decisions

Routing decisions are secured by:

1. validating inbound payloads
2. authenticating internal callers
3. resolving workflow behavior in the backend
4. persisting auditable dispatch state
5. treating downstream workflow systems as executors only

## Safe Workflow Execution

n8n and other workflow systems should only receive normalized and approved payloads.
They must not infer pricing, permissions, or trust state on their own.

## Operational Follow-ups

Recommended next hardening steps:

1. move rate limiting to a shared backing store
2. add signed report link issuance endpoints with explicit operator controls
3. add security-specific dashboard views over audit logs
4. add automated security regression tests for all webhook routes
