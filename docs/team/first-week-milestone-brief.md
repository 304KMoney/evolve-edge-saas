# First-Week Milestone Brief

Use this as Harshay's initial working brief.

## Objective

Improve first-customer readiness without rewriting the system.

The first week should focus on the narrowest launch-critical engineering slice
that increases confidence in:

- checkout completion
- Stripe webhook processing
- reconciliation persistence
- workflow routing and dispatch
- n8n callback and writeback reliability
- report visibility in the dashboard
- operator ability to diagnose and recover failures

## Guardrails

Harshay should not do the following in the first week unless explicitly asked:

- redesign architecture
- redesign billing or plan structure
- move business logic into Stripe, n8n, Dify, HubSpot, or Hostinger
- make broad schema changes
- refactor unrelated modules for style reasons
- start with broad discovery loops without selecting a narrow slice

## Expected First-Week Shape

### Day 1

- read launch-critical docs
- review high-risk modules
- set up local environment
- identify the smallest safe implementation sequence
- propose a written first slice for approval

### Day 2-3

- implement one launch-critical polish or reliability slice
- add targeted tests
- update corresponding docs or runbooks
- document local verification and remaining live checks

### Day 4-5

- close out the slice fully
- support review feedback
- identify the next highest-value narrow slice
- hand off operational notes clearly

## What Good Work Looks Like

- small, understandable diffs
- strong typing
- fail-closed behavior when mappings or identifiers are missing
- explicit tenant scoping
- durable operator visibility
- tests around the changed path
- docs updated with what changed and how to operate it

## Suggested First Slice

Recommended starting milestone:

> Improve launch-week operator confidence by tightening fulfillment or
> reconciliation visibility, expanding route-level verification around a
> readiness or callback surface, and updating the related runbooks without
> changing architecture boundaries.

## Deliverables For The First Slice

- 1 narrow launch-critical improvement
- 1 targeted test addition or expansion
- 1 production-safe backend cleanup if needed
- 1 related documentation update
- 1 written note listing:
  - what changed
  - what was verified locally
  - what still needs live environment validation
  - what remains deferred
