# Evolve Edge Fast-Delivery Interview Scorecard

Use this version if the main hiring question is:

"Can this person get the final launch-critical work done quickly and safely?"

This is intentionally stricter than a general contractor interview.

## Decision Rule

Do not hire on likability, broad experience, or confidence alone.

Hire only if the candidate can show:

- a realistic short delivery plan
- enough weekly availability to sustain momentum
- strong ownership of similar production work
- comfort with integration-heavy cleanup
- ability to reduce scope without breaking the product

## Core Standard

For Evolve Edge, the final leg is not "build a few screens."

It is:

- launch hardening
- billing and webhook correctness
- workflow callback reliability
- production-safe cleanup
- targeted test and documentation closure

If the candidate cannot explain how they would handle that quickly, they are not the right hire for this phase.

## 60-Minute Founder Interview

### 1. Context Set-Up - 5 minutes

Say this clearly:

"This project is already far along. I do not need a long discovery phase. I need someone who can take a mature codebase, identify the launch-critical path, and finish the remaining work quickly without destabilizing billing, workflow routing, or product state."

Then add:

"The key question for me is not whether you are smart. It is whether you can deliver fast enough, part-time or otherwise, with good judgment."

### 2. Availability Check - 8 minutes

Ask directly:

"How many hours per week can you reliably give this project, not optimistically but consistently?"

"What other client work are you balancing right now?"

"When you say part-time, what does that actually mean in practice across a typical week?"

"How often would I wait more than 24 hours for a meaningful reply or unblock?"

What you want:

- clear numeric availability
- stable schedule
- no vague promises
- evidence that the project will not be squeezed between other clients

Reject if:

- answers are soft or evasive
- availability sounds fragmented
- they cannot define response expectations

### 3. Similar Delivery Proof - 12 minutes

Ask:

"Tell me about a project you personally finished where the hard part was the final integration and launch cleanup, not the initial build."

"What exactly was broken, unfinished, or risky when you joined?"

"What did you personally ship?"

"How long did it take?"

"What nearly slowed the project down, and how did you prevent that?"

Strong answers include:

- concrete ownership
- production examples
- deadlines
- tradeoff decisions
- launch-oriented thinking

Weak answers include:

- team-level vagueness
- feature-heavy stories instead of production-hardening stories
- no dates, no scope, no personal ownership

### 4. Evolve Edge Execution Test - 15 minutes

Ask:

"If you started on Evolve Edge this week, what would you do in the first 3 business days?"

"What would you want to inspect first in a codebase like this?"

"What would your week 1 deliverable be?"

"What would your week 2 deliverable be?"

"What would you explicitly defer so this ships faster?"

"Where do Stripe, n8n, Dify, and HubSpot create risk, and how would you keep them bounded?"

Listen for:

- reads critical flows first
- identifies launch path before editing
- prioritizes billing, webhook, callback, and env integrity
- keeps the app and database as source of truth
- understands fail-closed behavior
- proposes a narrow sequence, not a broad rewrite

Best sign:

They can describe a believable 2 to 3 week launch slice with assumptions.

### 5. Time-Pressure Test - 10 minutes

Ask:

"If I told you I do not have 8 to 12 weeks, what is the smallest realistic scope you would commit to delivering quickly?"

"What would be in that scope?"

"What would be out?"

"What would you need from me to keep that timeline real?"

"What would make you refuse to promise a faster date?"

Strong answers:

- narrow the scope intelligently
- separate must-have from nice-to-have
- protect the production path
- ask for the minimum founder inputs needed

Weak answers:

- instantly promise speed without tradeoffs
- overcommit before seeing the code
- no discussion of dependencies or blockers

### 6. Async Communication Test - 5 minutes

Ask:

"What would your updates look like in a fast-moving engagement where I care about momentum and do not want surprises?"

"How do you report risk early without creating noise?"

"How do you avoid disappearing into the codebase for days?"

What good looks like:

- short written updates
- clear next steps
- explicit blockers
- timeline changes surfaced early

### 7. Close With a Commitment Question - 5 minutes

Ask:

"Based on what you know right now, what timeline would you be comfortable committing to for a launch-critical slice of this project?"

"What assumptions is that estimate based on?"

"What would you deliver by that date?"

Do not help them answer.

The quality of the answer matters as much as the number.

## Hard Questions To Ask If You Are Unsure

- "What part of this project would most likely take longer than expected?"
- "How would you avoid spending too much time in discovery?"
- "What would you do if the codebase has drift between docs and implementation?"
- "How do you approach inherited tests that may be incomplete or brittle?"
- "When do you decide not to refactor?"

## Fast Hire / No-Hire Scorecard

Score each from 1 to 5:

- Reliable weekly availability
- Similar endgame delivery experience
- Speed with discipline
- Integration-risk judgment
- Ability to narrow scope
- Ability to work asynchronously
- Confidence without overpromising
- Likelihood of hitting a tight deadline

## Automatic No-Hire Signals

- cannot commit to consistent weekly hours
- needs a long ramp before contributing
- speaks in broad architecture language but not concrete deliverables
- wants to rewrite instead of finish
- treats launch hardening as secondary
- promises an aggressive timeline without naming tradeoffs
- does not naturally talk about validation, idempotency, tests, or rollback safety

## What A Good Candidate Should Sound Like

"First I would inspect the billing and workflow-critical paths, verify build and test health, confirm env and webhook assumptions, then lock a minimal launch scope. In week one I would aim to remove the riskiest blockers and give you a clear go/no-go list. I would defer non-essential cleanup until after launch."

## Final Hiring Prompt For Yourself

Before hiring, answer this in one sentence:

"If I give this person a tight deadline and minimal supervision, do I believe they will create momentum or create uncertainty?"

If the answer is not clearly "momentum," do not hire for the final leg.
