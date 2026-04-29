# Onboarding and Audit Intake Flow

## Purpose

Evolve Edge treats onboarding intake as the control point before any audit analysis, report generation, n8n dispatch, LangGraph run, or OpenAI execution can begin.

The app owns this state. Stripe can reconcile billing, HubSpot can receive projections, n8n can execute after backend dispatch, and OpenAI/LangGraph can execute analysis only after the app has persisted completed intake in Neon.

## Routes

- `/signup` creates an authenticated user session and sends new users to `/onboarding`.
- `/onboarding` is the authenticated onboarding/intake route.
- `/dashboard` remains protected by `requireCurrentSession({ requireOrganization: true })`.
- `/api/automation/intake-to-n8n` is intentionally disabled with HTTP 410 to prevent direct n8n dispatch.
- `/api/automation/intake-to-app-dispatch`, `/api/internal/workflows/bootstrap-dispatch`, `/api/internal/workflows/dispatch`, and `/api/internal/workflows/audit/execute` are gated by app-owned intake readiness.

## Data Model

No Prisma migration is required for this slice.

The implementation reuses existing Neon-backed fields:

- `User.onboardingCompletedAt`
- `Organization.onboardingCompletedAt`
- `Organization.regulatoryProfile`
- `Organization.aiUsageSummary`
- `Organization.dataClassification`
- `Assessment.status`
- `Assessment.submittedAt`
- `AssessmentSection.responses`

The structured intake payload is stored at:

```json
{
  "regulatoryProfile": {
    "frameworks": ["soc2", "hipaa", "nist-csf"],
    "auditIntake": {
      "version": 1,
      "intakeCompleted": true,
      "intakeCompletedAt": "ISO-8601 timestamp",
      "readyForAudit": true,
      "readyForAuditAt": "ISO-8601 timestamp",
      "status": "ready_for_audit"
    }
  }
}
```

## Required Intake Fields

- Company name
- Industry
- Company size
- Whether the company uses AI tools
- AI tool details, optional
- Tools/platforms used, optional comma-separated list
- Top concerns, at least one selected or described
- Data sensitivity
- Optional notes

## Readiness Gate

The shared helper in `apps/web/lib/audit-intake.ts` validates and reads readiness.

A workspace is ready for audit only when:

- the organization has `onboardingCompletedAt`
- `regulatoryProfile.auditIntake.intakeCompleted === true`
- `regulatoryProfile.auditIntake.readyForAudit === true`
- `regulatoryProfile.auditIntake.status === "ready_for_audit"`
- intake completion/readiness timestamps are present

If this state is missing or corrupted, the app fails closed.

## Workflow Behavior

- Onboarding persists structured intake and creates or updates the first assessment as `INTAKE_SUBMITTED`.
- No n8n, LangGraph, OpenAI, or report workflow is triggered by onboarding.
- Stripe checkout completion can reconcile billing and access grants, but audit dispatch remains blocked until intake readiness is true.
- `queueAuditRequestedDispatch` refuses to create `audit.requested` workflow dispatches when intake is incomplete.
- Pending workflow dispatch delivery also re-checks intake readiness before contacting n8n.
- AI execution endpoints and queued analysis workers re-check intake readiness before OpenAI/LangGraph execution.
- Prebuilt AI execution payloads are still blocked at the worker boundary if intake readiness is false.
- Deprecated Dify rollback execution also checks app-owned intake readiness before calling Dify.
- Report regeneration refuses to queue analysis unless intake readiness is still valid.
- The legacy non-production Stripe webhook route can reconcile local checkout test state, but it does not queue workflow dispatch when intake is incomplete.

## Environment Variables

No new environment variables were added.

Existing related variables still apply:

- `DATABASE_URL`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `N8N_CALLBACK_SHARED_SECRET`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`

## Test Commands

Targeted tests:

```powershell
cd apps/web
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\audit-intake.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\auth-routing.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\workflow-dispatch.test.ts
```

Broader local check:

```powershell
cd apps/web
.\node_modules\.bin\tsc.CMD --noEmit --pretty false
```

The broader typecheck currently also reports pre-existing missing dependency/type issues for Sentry, zod/OpenAI/LangGraph, Resend, and existing implicit-any sites.

## Manual QA Checklist

1. Sign up or log in.
2. Confirm users without completed intake redirect to `/onboarding`.
3. Submit onboarding with valid required intake fields.
4. Confirm `Organization.regulatoryProfile.auditIntake.status` is `ready_for_audit`.
5. Confirm `User.onboardingCompletedAt` and `Organization.onboardingCompletedAt` are set.
6. Confirm redirect to `/dashboard`.
7. Confirm dashboard shows `Intake complete - analysis pending`.
8. Confirm logged-out users cannot access dashboard routes.
9. Confirm users with missing/corrupt `auditIntake` are sent back to `/onboarding`.
10. Confirm onboarding does not create reports or fake findings.
11. Confirm Stripe checkout reconciliation does not dispatch audit workflows when intake is incomplete.
12. Confirm `/api/automation/intake-to-n8n` returns HTTP 410.
13. Confirm pending workflow dispatches do not call n8n if intake readiness is missing.
14. Confirm AI execution returns blocked/409 or fails closed if intake is incomplete.

## Follow-Ups

- Consider adding a first-class `Intake` or `AuditRequest` table if operators need version history or multiple concurrent intake submissions.
- Add browser-level tests once the dev server is available.
- Add HubSpot intake projection only if CRM field mappings are finalized; CRM must remain non-blocking and projection-only.
