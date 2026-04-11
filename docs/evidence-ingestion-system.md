# Evidence Ingestion System

## What existed before

Before this phase, Evolve Edge had a very thin `EvidenceFile` attachment model:

- assessment-only linkage
- filename, storage key, mime type, size
- no review workflow
- no provenance beyond upload timestamp
- no version history
- no annotations
- no structured evidence library UI

That was enough for intake-era attachments, but not enough for a real audit evidence operating system.

## What was implemented

This phase upgrades evidence into a real domain with:

- evidence items scoped to organization and optionally linked to:
  - engagement
  - assessment
  - report
  - finding
  - monitoring finding
  - framework
  - framework control
- evidence processing state
- evidence review state
- evidence version history
- internal annotations
- duplicate detection metadata
- downloadable stored files
- a customer workspace evidence library
- an evidence detail page with review and version controls
- a file-storage abstraction based on local server disk with a future adapter path

## Why it matters

This makes Evolve Edge materially closer to a compliance operating system:

- evidence is auditable and reviewable
- artifacts can outlive a single report cycle
- evidence can be linked to the broader engagement and monitoring model
- future OCR, parsing, control mapping, and reviewer workflows have a clean place to attach

## Architecture decisions

### 1. Extend the existing `EvidenceFile` model instead of replacing it

This preserves:

- storage usage metering continuity
- existing assessment attachment references
- simpler migration and rollout behavior

### 2. Keep storage and metadata separate

The app stores evidence metadata in Prisma and file bytes in a storage adapter.

The first adapter is local-disk storage configured by `EVIDENCE_STORAGE_ROOT`. That is intentional and explicit. It keeps the upload path real and testable now, while leaving room for a future S3, Blob, or signed-upload adapter.

### 3. Keep parsing and review separate

Processing state and review state are tracked independently:

- processing tracks ingestion/parsing pipeline progress
- review tracks analyst or reviewer approval state

### 4. Internal notes are separated from customer-visible summary metadata

- `visibleSummary` is workspace-visible metadata
- `EvidenceAnnotation` is for reviewer/operator notes
- current annotation creation is internal-only by default

## Domain model

### `EvidenceFile`

Owns the current evidence item state:

- org scope
- links to engagement / assessment / report / finding / framework
- upload provenance
- category and source
- current storage metadata
- processing and review state
- duplicate reference

### `EvidenceFileVersion`

Owns historical file revisions for an evidence item.

### `EvidenceAnnotation`

Owns internal reviewer notes and future customer-visible annotation support.

## Processing and review states

### Processing

- `UPLOADED`
- `PROCESSING`
- `PARSED`
- `FAILED`

### Review

- `NEEDS_REVIEW`
- `APPROVED`
- `REJECTED`
- `SUPERSEDED`

## Supported file types

Current supported extensions and MIME families include:

- PDF
- Word documents
- Excel / spreadsheets
- CSV
- JSON
- plain text
- markdown
- PNG / JPG / WEBP screenshots

This first version intentionally excludes arbitrary binary uploads.

## Access control

Customer-facing permissions use the centralized authorization model:

- evidence library/detail access: `evidence.view`
- upload, review, processing updates, version replacement, internal notes: `evidence.manage`

This keeps tenant isolation and role behavior consistent with the new enterprise authz layer.

## Environment variables

### New optional environment variables

- `EVIDENCE_STORAGE_ROOT`
- `EVIDENCE_MAX_UPLOAD_BYTES`

### Defaults

- storage root defaults to `.data/evidence` under the app workspace
- upload size defaults to `25 MB`

## Migrations required

- `packages/db/prisma/migrations/20260410203000_evidence_ingestion_foundation/migration.sql`

## Manual setup steps

1. Run the new migration.
2. Regenerate Prisma client.
3. Set `EVIDENCE_STORAGE_ROOT` if the default local storage path is not appropriate for the deployment target.
4. Ensure the app process can write to the chosen storage directory.
5. Visit `/dashboard/evidence` as a workspace role with `evidence.manage`.
6. Upload a sample PDF or spreadsheet.
7. Open the evidence detail page and test:
   - review status update
   - processing status update
   - internal annotation
   - version replacement
   - download current file
   - download older version

## Security and antivirus notes

This phase adds a safe baseline, but not a full malware scanning pipeline.

Current safety measures:

- extension / MIME allowlist
- upload size limit
- sanitized filenames
- storage path isolation under an evidence root
- tenant-scoped metadata access
- audited download and review actions

Recommended next step:

- add an async antivirus / malware scan stage before evidence can move to `APPROVED`

## Future extension notes

- direct-to-object-storage uploads for large files
- OCR and text extraction workers
- structured document parsing
- control-level evidence mapping UI
- customer-visible annotation support where appropriate
- secure preview rendering instead of download-only access
- malware scanning and DLP checks
- automated duplicate clustering by semantic metadata, not only file hash

## Test checklist

1. Upload a supported file type and confirm it appears in the evidence library.
2. Upload an unsupported file type and confirm the upload is rejected.
3. Open an evidence detail page and confirm metadata and linkage render.
4. Update processing status and confirm auditability and persistence.
5. Update review status and confirm auditability and persistence.
6. Add an internal annotation and confirm it is visible only on the detail page.
7. Upload a replacement version and confirm version history grows.
8. Download both current and historical versions.
9. Confirm viewer-role users can browse but cannot mutate evidence.
10. Confirm storage usage grows in the usage metering surface after uploads.
