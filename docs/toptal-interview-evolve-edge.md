# Evolve Edge 60-Minute Contractor Interview Guide

Use this interview guide for Evolve Edge as it exists now: a mature in-progress
launch candidate with substantial billing, routing, orchestration, dashboard,
operator, and runbook groundwork already in place.

This is not a greenfield product interview.

The goal is to determine whether the candidate can safely finish the narrow,
launch-critical last mile for the first paying customer.

## Interview Goal

By the end of the call, you should be able to answer:

- Can this person identify the narrowest high-leverage launch slice instead of
  broadening scope?
- Can this person preserve Evolve Edge's source-of-truth boundaries under
  delivery pressure?
- Can this person improve first-customer readiness across payment,
  reconciliation, dispatch, writeback, dashboard visibility, and operator
  recovery without rewriting the platform?
- Can this person operate part-time with enough clarity and momentum to support
  a founder-led launch?

## Current Repo Context To Share

Give the candidate a short, concrete version of the current state:

- Evolve Edge is an app-owned control plane for AI security, compliance, audit
  delivery, and customer operations.
- The Next.js app is the canonical system of record for product logic and
  customer-visible state.
- Neon/Postgres is the canonical persistence layer.
- Stripe is billing authority and payment-event source only.
- n8n is orchestration and async execution only.
- Dify is AI execution only.
- HubSpot is CRM projection only.
- Hostinger is brochure and top-of-funnel only.

What already appears to exist in the repo:

- launch-oriented docs and first-customer runbooks
- Stripe checkout and webhook processing
- explicit backend plan mapping
- payment reconciliation and access-grant records
- commercial routing and workflow dispatch
- n8n callback and report writeback handling
- delivery-state tracking and operator workflow events
- dashboard report visibility and protected report access
- admin and ops readiness surfaces
- targeted tests across billing, routing, workflow, Dify, HubSpot, and delivery

What to emphasize:

"The hard part is not inventing more platform. The hard part is finishing the
first-customer path safely: payment to canonical internal state to workflow
dispatch to durable writeback to dashboard visibility to operator recovery."

## Recommended 60-Minute Agenda

### 1. Context and Boundaries - 5 minutes

Share:

- this is a launch-readiness and execution-judgment interview
- this is not a rewrite role
- architecture boundaries are non-negotiable unless changed safely in code and
  docs

Suggested wording:

"We already have a substantial control plane in place. What I need is someone
who can inspect a real codebase, identify the narrowest safe slice for first
revenue, and execute without causing architecture drift."

### 2. Candidate Background - 10 minutes

Ask:

"Tell me about the closest project you personally owned where the final work was
integration hardening, billing or webhook correctness, launch readiness, or
operational cleanup rather than greenfield feature building."

Listen for:

- concrete ownership
- mature-system experience
- examples involving payments, workflow systems, CRM projections, or AI
  integrations
- practical launch risk management

Follow-up:

"What was still risky when you joined, and what did you do first to reduce that
risk?"

### 3. Inheriting a Mature Codebase - 8 minutes

Ask:

"If you inherited Evolve Edge tomorrow, what would you inspect in your first
three business days before proposing changes?"

Strong answers should include things like:

- launch docs and runbooks
- build and targeted test health
- environment and preflight checks
- Stripe webhook and reconciliation path
- commercial mapping and routing logic
- workflow dispatch, callback, and writeback reliability
- dashboard and operator visibility for first-customer support

Follow-up:

"How would you distinguish code gaps from ops gaps or documentation gaps?"

### 4. Launch-Slice Scenario - 15 minutes

Give this prompt:

"You have 18 to 24 hours of focused work to materially improve first-customer
readiness. The success path is: pricing to checkout, Stripe payment into
canonical internal state, correct workflow dispatch, durable writeback and
report state, dashboard visibility, and founder-operated recovery if automation
partially fails.

What slice would you choose, what would you not touch, and how would you
sequence the work?"

Listen for:

- narrow scope selection
- explicit non-goals
- launch-critical prioritization
- backend-owned validation and fail-closed behavior
- operator recovery and documentation

Best sign:

The candidate naturally treats this as a risk-reduction sprint, not a product
expansion sprint.

### 5. Technical Risk Scenarios - 12 minutes

Use one or two scenarios and ask the candidate to think out loud.

#### Scenario A: Stripe mapping or context failure

"A Stripe event is verified, but the metadata is incomplete or the plan mapping
cannot be resolved cleanly. What should happen?"

Strong signals:

- fail closed when commercial mapping is missing
- durable operator-readable finding
- explicit backend reconciliation path
- no downstream inference from Stripe product names

#### Scenario B: n8n callback or writeback issue

"n8n says the workflow completed, but the callback payload is malformed,
unauthenticated, or duplicated. What should happen?"

Strong signals:

- authenticated callback boundary
- payload validation and normalization
- idempotent callback handling
- no duplicate terminal side effects
- app and database remain canonical

#### Scenario C: first-customer supportability

"Payment succeeded, but workflow dispatch or writeback partially failed. What
should the founder be able to inspect and recover from the app?"

Strong signals:

- starts from durable app records
- mentions reconciliation, routing snapshot, workflow dispatch, delivery state,
  report state, and operator findings
- does not rely on third-party dashboards as the system of record

### 6. Working Style and Async Execution - 5 minutes

Ask:

"What would your update cadence look like in a fast-moving part-time engagement
where I care about momentum and I do not want surprises?"

Listen for:

- concise written updates
- visible assumptions and blockers
- steady progress checkpoints
- realistic part-time communication expectations

### 7. Close With Judgment - 5 minutes

Ask:

"Based on what you know now, what would you want to inspect before committing to
a launch-critical milestone and what would make you push back on timeline or
scope?"

Listen for:

- honesty
- respect for production risk
- ability to say no to unsafe scope
- no overpromising

## What Good Candidates Sound Like

Strong candidates usually sound like this:

"I would first inspect the payment-to-fulfillment critical path rather than
starting with surface features. I would validate the Stripe mapping and webhook
boundary, the canonical internal records created from payment, the workflow
dispatch and callback path, and the founder's recovery visibility in the app. I
would choose one narrow slice that reduces the highest first-revenue risk, ship
tests and docs with it, and leave the architecture boundaries intact."

## What Weak Candidates Sound Like

Weak candidates often sound like this:

- they treat this like a fresh build
- they propose broad rewrites before reading critical flows
- they want to move logic into Stripe, n8n, or AI outputs
- they talk about polish more than reliability
- they cannot separate must-have launch work from nice-to-have cleanup

## Suggested Closing Notes Template

- Overall impression:
- Most relevant past project:
- Confidence in source-of-truth discipline:
- Confidence in launch-slice judgment:
- Confidence in production-safe execution:
- Confidence in async communication:
- Main risks:
- Would I hire:
- If yes, best initial sprint:
- If yes, ideal weekly hours:
- If no, why not:

## Use With

- [toptal-interview-fast-delivery-scorecard.md](/C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/toptal-interview-fast-delivery-scorecard.md)
- [contractor-launch-scope.md](/C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/contractor-launch-scope.md)
- [first-customer-launch-checks.md](/C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/first-customer-launch-checks.md)
- [end-to-end-paid-flow-smoke-test.md](/C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/end-to-end-paid-flow-smoke-test.md)
