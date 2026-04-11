# Phase 59 — Product Surface Integration

## Purpose

Phase 59 exposes pricing, plan visibility, and limits inside the product without
moving pricing logic into UI components.

The backend remains authoritative:

- `getOrganizationEntitlements()` resolves plan-backed feature access
- `getOrganizationUsageMeteringSnapshot()` resolves long-lived capacity metrics
- `getUsageRemaining()` resolves monthly quota windows from usage-metering records

The UI only renders those resolved decisions.

## What changed

This phase adds a shared product-surface layer used by:

- dashboard overview
- reports
- evidence ingestion
- monitoring

The shared layer is implemented in:

- `apps/web/lib/product-surface.ts`
- `apps/web/components/product-surface-panel.tsx`

It provides:

- current plan visibility
- workspace billing mode visibility
- relevant capacity cards
- one contextual callout at a time
- plan-locked and read-only messaging

## Surface rules

### 1. Backend enforcement first

This phase does not move any gating into the UI.

Feature and quota enforcement still happens through:

- entitlement guards
- quota checks
- permission checks

The new UI only reflects those server-side decisions.

### 2. Low-noise upgrade prompts

Each page shows at most one primary pricing/capacity callout.

Callout priority:

1. plan/workspace locked state
2. exceeded limit
3. warning threshold
4. no callout

This avoids stacking multiple upgrade prompts on a single page.

### 3. Page-specific relevance

Each page only shows pricing data that is relevant to the work being done there.

- Dashboard:
  - monthly audits
  - monthly evidence uploads
  - active assessments
  - monitored assets
- Reports:
  - reports generated
  - AI processing runs
  - monthly documents processed
- Evidence:
  - monthly evidence uploads
  - monthly documents processed
  - tracked storage
- Monitoring:
  - monitored assets
  - monitoring availability state

## Operator and product assumptions

- Workspace billing state should remain visible inside the product, not only in settings.
- Read-only states should explain what is still available versus what is locked.
- Role-based limits and plan-based limits are distinct.
  - Example: a user may have a plan that supports evidence management but still lack the role permission to upload.

## Extension points

If future phases add more gated surfaces, use `buildProductSurfaceModel()` instead
of creating new ad hoc pricing banners.

Recommended future additions:

- roadmap surface integration
- frameworks/control-scoring surface integration
- customer-facing billing usage history
- explicit overage preview once overage billing exists
