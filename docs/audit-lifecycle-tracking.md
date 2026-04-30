# Audit Lifecycle Tracking

Evolve Edge tracks audit progress in an app-owned lifecycle model.

## States

- `intake_pending`
- `intake_complete`
- `routing_complete`
- `analysis_pending`
- `analysis_running`
- `analysis_complete`
- `report_ready`
- `briefing_ready`
- `delivered`
- `failed_review_required`

## Source Of Truth

- Next.js owns lifecycle transitions and validation.
- Neon/Postgres stores the current lifecycle and transition log.
- n8n, Stripe, HubSpot, LangGraph, and OpenAI do not own lifecycle state.

## Database

Migration:

- `packages/db/prisma/migrations/20260429170000_audit_lifecycle/migration.sql`

Models:

- `AuditLifecycle`: one current lifecycle row per assessment.
- `AuditLifecycleTransition`: append-only transition log for debugging and operator visibility.

## Transition Rules

- Stages must move in order.
- Replays of already-passed stages are no-ops.
- Terminal states cannot move forward.
- `failed_review_required` requires a safe failure reason.
- Completion stages require backing data:
  - intake completion requires valid intake
  - routing completion requires a routing snapshot
  - analysis stages require an analysis job
  - report readiness requires a report
  - briefing readiness requires a briefing
  - delivery requires a delivery timestamp

## Dashboard

The main dashboard renders an audit lifecycle tracker with:

- current status
- completed/active/failed visual states
- timestamps for completed stages

## Manual QA

1. Complete onboarding intake.
2. Confirm dashboard shows `intake_complete`.
3. Trigger controlled audit execution.
4. Confirm lifecycle advances through routing and analysis states.
5. Confirm report generation marks `report_ready`.
6. Open the executive briefing and confirm `briefing_ready`.
7. Mark the report delivered and confirm `delivered`.
8. Force a validation failure in a safe test environment and confirm `failed_review_required`.
