# Evolve Edge Fast-Delivery Interview Scorecard

Use this scorecard when the real hiring question is:

"Can this engineer safely finish the narrow launch-critical slice that gets
Evolve Edge to its first paying client?"

This version reflects Evolve Edge's current state: a mature in-progress
control-plane codebase with substantial billing, routing, dispatch, writeback,
dashboard, operator, and launch-runbook groundwork already in place.

## How To Score

Score each category from 1 to 5.

- `5` = strong hire signal
- `3` = mixed or unclear
- `1` = weak signal

Recommended weighting:

- use equal weights by default
- double-weight `Scope Judgment`, `Architecture Discipline`, and
  `Production Safety`

## Decision Rule

Do not hire on confidence, pedigree, or general full-stack fluency alone.

Hire only if the candidate shows that they can:

- narrow scope intelligently
- preserve app-owned truth and explicit integration boundaries
- improve first-customer reliability without broad rewrites
- communicate clearly enough to execute part-time with minimal founder drag

## Category 1: Problem Framing And Current-State Assessment

What to look for:

- recognizes that Evolve Edge is not a greenfield build
- separates "already implemented" from "trusted for launch"
- focuses quickly on the payment-to-fulfillment path

Strong signals:

- says the main job is risk reduction, not platform invention
- looks first at billing, routing, dispatch, writeback, dashboard visibility,
  and operator recovery
- treats docs and runbooks as part of product readiness

Weak signals:

- assumes major subsystems are missing without checking
- jumps into redesign or feature ideation
- focuses on UI polish or growth features first

Score:

- `5`: crisp, realistic framing
- `3`: partly right but scattered
- `1`: misreads the assignment

## Category 2: Scope Judgment

What to look for:

- chooses a narrow 18 to 24 hour slice with direct first-revenue impact
- explicitly says what stays out of scope

Strong signals:

- picks one high-leverage slice such as Stripe/webhook hardening, commercial
  mapping correctness, workflow dispatch reliability, writeback reliability,
  operator visibility, or launch preflight/runbook hardening
- explains why that slice reduces first-customer risk fastest
- avoids schema churn unless absolutely necessary

Weak signals:

- turns the sprint into a roadmap
- wants to touch billing, admin, onboarding, UI, and integrations all at once
- cannot define non-goals

Score:

- `5`: narrow and finishable
- `3`: useful but still broad
- `1`: unrealistic or undisciplined

## Category 3: Architecture Discipline

What to look for:

- preserves source-of-truth boundaries under delivery pressure

Strong signals:

- keeps the Next.js app and Neon/Postgres as the canonical source of product
  logic and customer-visible state
- keeps Stripe as billing authority only
- keeps n8n orchestration-only
- keeps Dify execution-only
- insists on explicit backend mapping from Stripe identifiers to internal plans

Weak signals:

- wants Stripe product names to drive downstream routing
- treats n8n as the commercial or lifecycle engine
- trusts Dify or HubSpot outputs as canonical internal state

Score:

- `5`: strong boundary discipline throughout
- `3`: mostly aligned but slips on details
- `1`: violates core architecture assumptions

## Category 4: Production Safety And Risk Management

What to look for:

- additive, reversible, fail-closed changes
- awareness of idempotency, auditability, replay safety, and operator recovery

Strong signals:

- mentions webhook and callback idempotency
- talks about durable operator-visible failure paths
- wants validation and normalization at the backend boundary
- prefers compatibility-safe refactors over rewrites

Weak signals:

- hand-waves duplicate deliveries or callback retries
- ignores recovery and operator visibility
- proposes risky schema churn casually
- assumes happy-path integrations are enough

Score:

- `5`: strong production instincts
- `3`: generally safe but misses some risk
- `1`: unsafe or naive

## Category 5: Implementation Plan Quality

What to look for:

- practical execution sequence, not just themes

Strong signals:

- breaks work into inspection, implementation, test, docs, and manual
  verification
- sequences by dependency and risk
- keeps the critical path moving

Weak signals:

- gives only abstract ideas
- cannot turn judgment into steps
- starts with lower-value work

Score:

- `5`: executable and founder-friendly
- `3`: mostly workable but fuzzy
- `1`: no practical plan

## Category 6: Code-Level Judgment

What to look for:

- knows where and how to change a mature codebase safely

Strong signals:

- names likely seams such as Stripe webhook handling, billing/commercial
  mapping, workflow dispatch, workflow writeback, delivery-state tracking,
  launch preflight, and runbooks
- centralizes logic in backend/domain modules
- avoids scattering business rules across UI and third parties

Weak signals:

- suggests broad edits across many high-risk files at once
- cannot identify sensible module boundaries
- proposes "cleanup" without a concrete seam

Score:

- `5`: specific and surgical
- `3`: some specificity, limited confidence
- `1`: hand-wavy or reckless

## Category 7: Testing Strategy

What to look for:

- targeted launch-critical verification, not generic "run tests"

Strong signals:

- covers Stripe mapping and webhook behavior
- covers entitlement or routing computation
- covers n8n payload normalization and callback/writeback reliability
- covers reconciliation and delivery-state progression
- separates local verification from live environment validation

Weak signals:

- says only "I would run the full suite"
- ignores live validation needs for Stripe and n8n
- focuses on cosmetic tests instead of critical path behavior

Score:

- `5`: focused and credible
- `3`: basic but generic
- `1`: weak or missing test strategy

## Category 8: Documentation And Operational Readiness

What to look for:

- treats docs and runbooks as part of launch safety

Strong signals:

- updates launch docs when behavior or requirements change
- mentions env/config expectations
- includes troubleshooting and founder fallback notes
- distinguishes code complete from launch operable

Weak signals:

- treats docs as optional cleanup
- assumes the founder can infer recovery procedures
- ignores setup and troubleshooting notes

Score:

- `5`: strong ops-minded documentation instincts
- `3`: mentions docs but lightly
- `1`: ignores documentation and runbooks

## Category 9: Founder-Operated Fallback Thinking

What to look for:

- can explain what the founder should inspect and do if automation partially
  fails

Strong signals:

- starts from durable app records, not third-party dashboards
- mentions reconciliation, routing snapshot, workflow dispatch, delivery state,
  report state, and operator findings
- knows when to inspect first versus replay

Weak signals:

- says "just rerun the workflow"
- treats Stripe or n8n dashboards as the real operator console
- has no concrete recovery path

Score:

- `5`: practical recovery mindset
- `3`: some awareness, not enough detail
- `1`: no usable fallback thinking

## Category 10: Communication And Seniority

What to look for:

- can communicate tradeoffs clearly under time pressure

Strong signals:

- structured and concise
- surfaces unknowns without spiraling
- sounds like someone who can send a founder a trustworthy sprint note

Weak signals:

- overly abstract
- hides uncertainty behind jargon
- cannot prioritize out loud

Score:

- `5`: clear senior-level communication
- `3`: understandable but uneven
- `1`: hard to trust or follow

## Overall Recommendation Bands

- `45-50`: strong hire
- `38-44`: hire or strong maybe
- `30-37`: mixed
- `20-29`: weak maybe or no-hire
- `10-19`: no-hire

## Automatic Red Flags

- wants to redesign architecture in a launch sprint
- moves source-of-truth logic into Stripe, n8n, Dify, or HubSpot
- cannot define a narrow launch slice
- ignores idempotency, auditability, replay safety, or operator recovery
- focuses more on polish than first revenue
- suggests schema churn casually
- has no clear test or validation strategy

## Strong Green Flags

- picks a small but high-leverage slice
- hardens a real failure seam instead of broadening scope
- protects architecture boundaries instinctively
- separates local verification from live validation
- updates docs and runbooks alongside code
- communicates like an owner

## Final Hiring Prompt For Yourself

Before hiring, answer this in one sentence:

"If I give this person a tight deadline and minimal supervision, do I believe
they will create momentum or create uncertainty?"

If the answer is not clearly "momentum," do not hire for the final pre-launch
leg.
