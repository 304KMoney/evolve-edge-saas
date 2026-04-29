# Plan-Based Access Control

Evolve Edge enforces commercial access in the app backend. Stripe is only the billing event source; it never owns feature access, audit routing, AI execution, report generation, or dashboard state.

## Canonical Plans

The app-owned commercial model is:

- `starter`: one limited-scope audit, concise report depth, no executive briefing, no priority features.
- `scale`: expanded audit scope and deeper analysis, no executive briefing or priority access.
- `enterprise`: full audit scope, executive briefing, priority access, and enterprise-level delivery controls.

Legacy `growth` subscriptions are normalized through the backend canonical mapping layer to `scale` compatibility. Downstream systems must use the normalized app-owned plan, not Stripe product or price names.

## Enforcement Points

The shared backend guard lives in `apps/web/lib/plan-enforcement.ts`.

It is called before:

- commercial routing snapshot creation
- OpenAI/LangGraph audit execution
- validated report generation
- executive briefing generation

The guard fails closed when:

- no backend-mapped canonical plan exists
- subscription/access state is inactive, canceled, paused, past due, incomplete, or read-only
- the requested workflow exceeds the active plan
- the plan's audit quota is exhausted
- the requested feature is not allowed for the plan

## Stripe Sync

Stripe webhook and checkout sync continue to update app-owned subscription records:

- `Subscription.planId`
- `Subscription.planCodeSnapshot`
- `Subscription.canonicalPlanKeySnapshot`
- `Subscription.accessState`

Plan access is derived from those persisted backend fields plus app-owned entitlement resolution. Stripe metadata remains mapping input only, not the source of truth.

## Test Commands

Targeted:

```bash
cd apps/web
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js test/plan-enforcement.test.ts
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js test/entitlements.test.ts
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js test/commercial-routing.test.ts
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js test/audit-execution.test.ts
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js test/ai-execution-worker.test.ts
```

Full local suite:

```bash
cd apps/web
node ./node_modules/tsx/dist/cli.mjs --require ./scripts/shims/server-only.js scripts/run-tests.ts
```

## Manual QA Checklist

1. Subscribe or trial a Starter workspace and confirm only `audit_starter` can be routed.
2. Confirm Starter blocks a second audit after one active audit exists.
3. Confirm Starter cannot trigger Scale or Enterprise workflows.
4. Confirm Scale routes to `audit_scale` and receives expanded/deeper analysis controls.
5. Confirm Scale cannot generate an executive briefing.
6. Confirm Enterprise can generate the full audit and executive briefing.
7. Cancel or expire a subscription and confirm write actions are blocked.
8. Confirm dashboard/report read behavior remains scoped to authenticated organization access.
