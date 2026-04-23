# Evolve Edge Contractor Launch Scope

Use this as the handoff brief for a contractor joining Evolve Edge during the final pre-launch phase.

## Role Summary

Evolve Edge is already far along. This is not a greenfield build.

The contractor is being hired to help finish the last pre-launch engineering slice safely:

- operator polish
- reliability cleanup
- targeted test expansion
- launch-readiness hardening
- small, production-safe refactors

This is not a rewrite role.

## Architecture Boundaries

These are non-negotiable unless explicitly changed in code and docs:

- the Next.js app owns product logic and customer-visible state
- Neon/Postgres is the source of truth
- Stripe is billing authority only
- n8n is orchestration only
- Dify is AI execution only
- HubSpot is CRM projection only

The contractor must preserve these boundaries.

## What The Contractor Should Own

Good ownership areas:

- admin and operator surface polish
- fulfillment and reconciliation visibility
- route-level and integration-style tests
- callback, replay, and webhook safety cleanup
- documentation and runbook alignment
- focused bug fixes in launch-critical flows
- small migration-safe backend refactors

## What The Contractor Should Not Own Initially

Not for the first engagement phase:

- architecture redesign
- billing model redesign
- changing source-of-truth boundaries
- moving logic into Stripe, n8n, Dify, or HubSpot
- broad schema churn
- unsupervised production cutover decisions

## Initial Engagement Shape

Recommended starting shape:

- 15 to 25 hours per week
- 2-week initial milestone
- async written updates at least once per workday
- explicit risk flags early, not late

## First 2-Week Scope

The contractor should aim to complete a narrow, test-backed polish slice.

Recommended scope:

1. Improve operator surfaces where reconciliation or fulfillment state is still hard to read.
2. Add route-level or snapshot-style tests for admin, readiness, or fulfillment endpoints.
3. Clean up one or two launch-critical rough edges without broad rewrites.
4. Update docs and runbooks for every meaningful operational change.

## Paid Trial Task

Use this as the first paid validation task.

### Goal

Prove the contractor can work safely inside the repo without destabilizing launch-critical flows.

### Trial Deliverables

Ask for all of the following in one small slice:

- fix 1 real admin or operator visibility issue
- add 1 route-level or snapshot-style test
- make 1 small reliability-safe backend refactor
- update 1 corresponding runbook in `docs/`

### Trial Constraints

- no architecture rewrites
- no unreviewed schema changes
- no source-of-truth changes
- no moving logic into third-party systems
- all changes must be test-backed where reasonable
- contractor must document what they ran locally

### Trial Success Criteria

The contractor passes the trial if they:

- choose a sensible narrow scope
- read the surrounding code before editing
- preserve architecture boundaries
- ship clean, understandable code
- include tests
- update documentation
- communicate clearly and asynchronously

## Definition Of Success

The contractor is succeeding if they create momentum without creating uncertainty.

That means:

- launch-critical surfaces get clearer
- tests get stronger
- reliability gets safer
- docs stay current
- no accidental architecture drift

## Red Flags During Engagement

Watch for:

- proposing rewrites before understanding the current system
- weak respect for app-owned state boundaries
- hand-waving around idempotency, replay safety, or webhook correctness
- poor async communication
- disappearing into discovery without visible progress
- broad changes without tests or docs

## Weekly Update Template

Ask the contractor to send updates in this shape:

- completed this week
- currently in progress
- risks or blockers
- decisions needed from founder
- next planned slice

## Suggested First Milestone

Suggested milestone wording:

"Improve launch-week operator confidence by tightening fulfillment/admin visibility, expanding route-level verification around readiness or callback surfaces, and updating the related runbooks without changing architecture boundaries."
