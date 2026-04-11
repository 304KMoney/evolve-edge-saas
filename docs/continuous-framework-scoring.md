# Continuous Framework Mapping And Control Scoring

## What existed before

Evolve Edge already had:

- a framework catalog with `Framework`, `FrameworkControl`, and `OrganizationFramework`
- coarse framework monitoring summaries in `MonitoringFramework`
- findings with `impactedFrameworks`
- evidence records with optional `frameworkId` and `frameworkControlId`

What was missing:

- org-scoped control assessments as first-class product state
- explainable, reproducible scoring logic
- durable mappings between findings, evidence, recommendations, and controls
- framework posture history over time
- reviewer-safe override flows for control posture

## What this phase implements

This phase adds the first structured compliance intelligence layer:

- shared framework/control catalog for:
  - SOC 2
  - HIPAA
  - PCI DSS
  - GDPR
  - NIST CSF
  - ISO 27001
- org-scoped `ControlAssessment` records
- `FindingControlMapping`, `EvidenceControlMapping`, and `RecommendationControlMapping`
- `ControlAssessmentSnapshot` and `FrameworkPostureSnapshot` history
- a centralized scoring service in `apps/web/lib/framework-intelligence.ts`
- automatic control sync during report generation
- customer-facing framework overview and framework detail pages
- reviewer overrides for authorized users
- evidence upload support for optional control-code linkage

## Why it matters

This changes framework posture from a coarse heuristic into a traceable product capability.

Leadership and operators can now answer:

- which controls are mapped and scored
- why a framework score changed
- which evidence and findings support a control conclusion
- which controls remain partially implemented or unreviewed
- how posture moved over time

This is important for enterprise trust because the system now distinguishes:

- raw evidence
- mapped findings
- reviewer decisions
- scored control posture
- framework rollups

## Architecture decisions

### Source of truth

The app remains the only owner of control posture state.

- `Framework` and `FrameworkControl` are the canonical control catalog
- `ControlAssessment` is the canonical current state per org/control
- `ControlAssessmentSnapshot` and `FrameworkPostureSnapshot` are the historical record
- `MonitoringFramework` remains a downstream coarse summary and is updated from framework rollups

### Scoring model

Scoring is explainable and deterministic.

Baseline status mapping:

- `NOT_IMPLEMENTED` -> low base score
- `PARTIALLY_IMPLEMENTED` -> mid score
- `IMPLEMENTED` -> high score
- `NEEDS_REVIEW` -> provisional score
- `COMPENSATING_CONTROL` -> high-but-not-perfect score
- `NOT_ASSESSED` -> low-confidence baseline
- `NOT_APPLICABLE` -> excluded from weighted rollups

Signals applied:

- open mapped findings reduce score
- approved evidence raises score
- pending evidence raises confidence that review is needed, but not full implementation
- manual reviewer overrides win over inferred scoring

### Mapping model

Mappings are additive and explicit:

- findings can map to many controls
- evidence can map to many controls
- recommendations can map to many controls

The current v1 inference uses framework scope, risk domain, and keyword matching from the shared framework catalog. This is intentionally transparent and replaceable.

## Reviewer workflow

1. Generate a report from a completed assessment.
2. Open `/dashboard/frameworks`.
3. Open a framework detail page.
4. Review the mapped controls, evidence, findings, and remediation items.
5. If needed, update control status, score, and rationale.
6. The system records:
   - the updated `ControlAssessment`
   - a `ControlAssessmentSnapshot`
   - a new `FrameworkPostureSnapshot`
   - updated coarse framework monitoring summary
   - an audit log entry

## Customer-facing surfaces

- `/dashboard/frameworks`
  - framework cards
  - gap prioritization
  - trend summaries
- `/dashboard/frameworks/[frameworkCode]`
  - control-level detail
  - linked findings
  - linked evidence
  - linked remediation items
  - reviewer overrides for authorized users

## Environment variables required

No new environment variables were added for this phase.

Existing app/database variables still apply:

- `DATABASE_URL`
- auth/session variables already required by the app

## Migrations required

Apply:

- `packages/db/prisma/migrations/20260411020000_framework_control_scoring/migration.sql`

## Test checklist

- run Prisma generate successfully
- verify TypeScript passes in `apps/web`
- verify framework-intelligence tests pass
- generate a report and confirm control assessments are created
- open `/dashboard/frameworks` and confirm framework cards show scores and gaps
- open a framework detail page and confirm controls, findings, evidence, and recommendations render
- perform a manual control review override and confirm:
  - success message appears
  - score/status updates persist
  - history snapshots update

## Manual setup steps

1. Run the migration.
2. Regenerate Prisma client.
3. Seed demo data if you want framework posture visible immediately in local development.
4. Ensure at least one org has selected frameworks and a generated report.
5. Visit the new framework pages in the dashboard.

## Scoring assumptions

Important v1 assumptions:

- this is not an attestation or certification engine
- scores represent platform-observed control posture, not legal or audit conclusions
- inferred mappings are suggestions backed by deterministic rules, not final regulator-grade mappings
- manual reviewer overrides are allowed and are the mechanism for human correction
- framework rollups are weighted averages of current control assessments, excluding `NOT_APPLICABLE`

## Extension points

The model is intentionally ready for future additions:

- OCR and document extraction can attach to `EvidenceFile` and update mappings
- LLM-assisted control suggestions can propose `FindingControlMapping` and `EvidenceControlMapping`
- scheduled reassessment can create additional snapshots without changing the current model
- control-level assignment and remediation ownership can attach to `ControlAssessment`
- export/report pipelines can consume `FrameworkPostureSnapshot` for leadership reporting

## Files touched in this phase

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260411020000_framework_control_scoring/migration.sql`
- `packages/db/src/framework-catalog.ts`
- `packages/db/src/index.ts`
- `packages/db/prisma/seed.ts`
- `apps/web/lib/organization.ts`
- `apps/web/lib/framework-intelligence.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/app/dashboard/frameworks/actions.ts`
- `apps/web/app/dashboard/frameworks/page.tsx`
- `apps/web/app/dashboard/frameworks/[frameworkCode]/page.tsx`
- `apps/web/app/dashboard/evidence/actions.ts`
- `apps/web/app/dashboard/evidence/page.tsx`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/test/framework-intelligence.test.ts`
- `apps/web/package.json`

## Future expansion notes

Deferred on purpose in v1:

- full control-library coverage for every framework clause
- customer-custom control libraries
- workflow assignment per control
- parser-driven evidence extraction
- deep admin console editing for platform operators outside customer org context
- finance-grade regulatory reporting exports
