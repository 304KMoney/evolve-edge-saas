# Evolve Edge 60-Minute Contractor Interview Guide

Use this version instead of the generic Toptal outline when interviewing a contractor for the final leg of Evolve Edge.

Goal:
- assess whether the candidate can safely finish integration-heavy product work in a part-time engagement
- leave enough room for the candidate to explain how they think, prioritize, communicate, and de-risk delivery

## Recommended Interview Outcome

By the end of the call, you should be able to answer:

- Can this person own the last mile of a production-minded SaaS app without turning n8n, Dify, Stripe, or HubSpot into accidental sources of truth?
- Can this person work part-time without losing momentum across async integrations and handoffs?
- Can this person improve reliability, test coverage, and launch readiness instead of just shipping surface-level features?
- Can this person communicate clearly enough to operate with minimal supervision?

## 60-Minute Agenda

### 1. Company and Product Context - 5 minutes

Share:

- Evolve Edge is an app-owned control plane for AI security, compliance, audit delivery, and customer operations.
- The Next.js app and Neon/Postgres are the source of truth.
- Stripe is billing authority only.
- n8n is orchestration only.
- Dify is AI execution only.
- HubSpot is CRM projection only.

What to say:

"We are in the final stretch. The hard part is not inventing more product. It is finishing safely: tightening the backend-owned commercial model, stabilizing integrations, preserving auditability, and making the launch path reliable."

### 2. Project Overview - 7 minutes

Share the current state:

- The repo is well underway, with working product, domain docs, tests, and launch runbooks.
- The remaining work is mostly production hardening, integration cleanup, callback reliability, env readiness, launch validation, and safe refactors around commercial and workflow ownership.
- The project is not a blank slate. It needs someone who can preserve existing working flows while closing gaps.

Good framing prompt:

"This is a mature in-progress codebase. If you joined part-time, you would be helping close the final 15 to 25 percent, but that last portion is the highest risk because it affects billing, workflow routing, and production reliability."

### 3. Role Expectations - 5 minutes

Clarify expectations:

- strong TypeScript and Next.js backend judgment
- comfortable with Postgres and migration-safe schema changes
- able to reason about Stripe webhooks, explicit mapping layers, and idempotency
- able to keep third-party systems bounded
- able to ship tests and docs with code
- proactive async communicator

Suggested wording:

"I care less about pure speed and more about whether you can safely finish a partially built system without breaking source-of-truth boundaries."

### 4. Candidate Deep Dive - 18 minutes

Use open-ended questions and let the candidate speak.

#### Question 1

"Tell me about the most similar system you have worked on where the product had to integrate with multiple third-party systems, but your app still needed to remain the source of truth."

Listen for:

- concrete ownership of architecture, not just participation
- examples involving payment, workflow, CRM, or AI integrations
- understanding of translation layers, validation, normalization, and fail-closed behavior

Follow-up:

"What were the failure modes, and how did you keep the external systems from leaking business logic into the product?"

#### Question 2

"When you inherit a codebase that already has real users, docs, tests, and some architectural drift, what do you do in your first week?"

Listen for:

- repo-first learning style
- safe sequencing
- reading critical flows before editing
- preserving working behavior
- targeted validation instead of broad rewrites

Follow-up:

"How do you decide what to stabilize first versus what to defer?"

#### Question 3

"Suppose Stripe, n8n, and an AI workflow are all part of the customer flow. Where would you insist on validation, state ownership, and idempotency?"

Listen for:

- app/database as canonical state
- explicit backend mapping of Stripe IDs to internal plans
- normalized writeback contracts
- distrust of raw third-party payloads
- durable audit trails

Follow-up:

"What would you never allow n8n or Dify to own?"

#### Question 4

"What would you do on day one if I gave you Evolve Edge part-time and said the remaining work is integration hardening plus launch readiness?"

Listen for:

- identifies critical files and flows
- starts with build, tests, env, and webhook paths
- makes a small safe execution plan
- thinks in terms of risk reduction, not random feature work

Follow-up:

"What would your first deliverable be by the end of week one?"

### 5. Technical Scenario Discussion - 12 minutes

Use one or two realistic scenarios and let the candidate think out loud.

#### Scenario A

"A Stripe event arrives, but the payload metadata is incomplete and the customer still needs safe internal billing state. How would you design the fallback path?"

Strong signals:

- fail closed where required
- explicit reconciliation path
- operator-readable findings
- no hidden inference from Stripe product names

#### Scenario B

"An n8n callback says a workflow completed, but the payload is malformed or arrives twice. What should happen?"

Strong signals:

- schema validation
- authenticated callback routes
- durable idempotency
- safe retries
- no terminal state corruption

#### Scenario C

"You only have 15 to 20 hours per week. How would you maintain forward motion on a codebase like this without creating idle time for the founder?"

Strong signals:

- structured async updates
- clear checkpoints
- independent execution between check-ins
- visible risks and assumptions
- disciplined scoping

### 6. Communication and Working Style - 8 minutes

Ask:

"What does strong remote collaboration look like when the project owner is moving fast and the codebase has several high-risk integration points?"

Listen for:

- concise written updates
- willingness to surface blockers early
- comfort with documentation and test-backed changes
- clarity around working hours and time-zone overlap

Follow-up:

"What cadence of updates would you give me in a part-time engagement so I always know whether the project is on track?"

### 7. Challenges, Risk, and Self-Awareness - 5 minutes

Ask:

"Based on what you have heard, what parts of this project do you think are straightforward for you, and what parts would you want to inspect before committing to a timeline?"

Listen for:

- honesty
- awareness of integration risk
- respect for production data and live flows
- no overpromising

Follow-up:

"What could slow you down in a project like this, and how would you keep that from becoming my problem?"

## Interviewer Scorecard

Rate each 1 to 5:

- Similarity of past work
- Backend and integration judgment
- Source-of-truth discipline
- Ability to work safely in an existing codebase
- Communication clarity
- Part-time execution reliability
- Testing and documentation habits
- Founder-fit and trust

## Green Flags

- speaks concretely about idempotency, validation, mapping layers, and operational safety
- does not want to push business logic into n8n, Stripe metadata, or AI outputs
- naturally talks about tests, logs, observability, and rollback paths
- can explain how they work asynchronously without supervision
- gives realistic timelines with assumptions

## Red Flags

- proposes broad rewrites before understanding the current system
- treats n8n as the workflow brain or Stripe as the plan engine
- hand-waves schema safety, webhook verification, or callback authentication
- focuses mostly on UI polish instead of production reliability
- gives a very aggressive part-time timeline without discussing risk or unknowns

## Closing Question

"If we worked together, what would your 30-day plan look like, and what would you expect from me to help you succeed?"

## Recommended Close-Out Notes Template

- Overall impression:
- Most relevant past project:
- Confidence in part-time execution:
- Confidence in backend ownership:
- Confidence in launch hardening:
- Main risks:
- Would I hire:
- If yes, ideal starting scope:
- If yes, ideal weekly hours:
- If no, why not:
