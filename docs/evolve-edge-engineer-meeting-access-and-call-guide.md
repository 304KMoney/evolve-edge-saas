# Evolve Edge Engineer Meeting Access And Call Guide

Prepared: April 26, 2026
Audience: hiring manager, founder, or technical lead
Use case: 1-2 hour onboarding and production-readiness review call with a senior full-stack engineer

## Goal Of The Call

Use the call to set the engineer up for fast, safe review work without wasting time on hidden permissions gaps or unclear architecture.

By the end of the call, the engineer should know:

- what Evolve Edge owns
- what each external system owns
- what access they have
- what they do not have yet
- what success looks like in the first 22 hours
- what would count as `GO`, `PARTIAL`, or `NO-GO`

## Access To Grant Before The Call

### Required Repo And Runtime Access

- [ ] Git repository access with clone, branch, and pull request permissions
- [ ] Access to the deployment workspace used for Evolve Edge
- [ ] Access to local environment variable handoff materials or the secure secret manager
- [ ] Permission to install dependencies and run local scripts
- [ ] Permission to run Prisma generation and type checks

### Required Platform Access

- [ ] Neon project access
- [ ] Vercel project access
- [ ] Stripe dashboard access with webhook and product-price visibility
- [ ] n8n workspace access
- [ ] OpenAI project or API-key provisioning path

### Required Delivery And Ops Access

- [ ] Access to Resend or the active email provider
- [ ] Access to the source of cron and ops secrets
- [ ] Access to the source of report signing and notification secrets

### Optional But Helpful Access

- [ ] HubSpot access if CRM projection review is in scope
- [ ] Apollo access if enrichment review is in scope
- [ ] Access to prior launch notes, incident notes, or environment docs

## Minimum Safe Permission Level

For a first review pass, the engineer should have enough access to inspect and validate, but not necessarily to make irreversible production changes alone.

Recommended starting level:

- repository write access
- deployment and env read access
- third-party dashboard read access
- ability to propose changes or prepare changes for approval

Escalate to direct production mutation access only if:

- the person is definitely taking ownership of launch execution
- an approver is available
- rollback ownership is clear

## Systems Ownership Explanation

Explain these boundaries clearly on the call:

- Next.js app is the source of truth for product logic and customer-visible state
- Neon is the system of record
- Stripe is billing authority only
- n8n is orchestration only
- LangGraph is workflow orchestration only
- OpenAI is model execution only
- HubSpot is projection only
- Apollo is optional enrichment only
- Dify is deprecated compatibility only

Also explain what this means in practice:

- pricing, plans, entitlements, routing, audit lifecycle, and delivery state belong in the app and database
- n8n should not own pricing rules, entitlements, or final state
- HubSpot should not be treated as the source of truth
- external systems can trigger or project, but the app must own the canonical outcome

## What To Explain In The First 15-20 Minutes

- [ ] What Evolve Edge does in one sentence
- [ ] What the current production goal is
- [ ] Whether this is a launch-readiness review, a stabilization pass, or a go-live assignment
- [ ] What has already been fixed in the repo
- [ ] What is still blocked by missing environment or third-party access
- [ ] What success looks like by the end of the first 22 hours

Suggested summary:

"The repo-side readiness picture is much better now, but live launch is still blocked mostly by environment and external-system configuration. Your first job is to verify truth, not to guess."

## What To Explain In The Architecture Section

- [ ] Walk through the canonical source-of-truth boundaries
- [ ] Call out the high-risk files and integrations
- [ ] Explain which compatibility layers still exist and why
- [ ] Explain that additive and fail-closed fixes are preferred over rewrites
- [ ] Explain that they should not casually reopen stabilized integration work unless they find a concrete defect

## What To Explain About Current Known Gaps

The engineer should hear this plainly:

- the repo can now report readiness more honestly
- local validation still shows launch-critical env gaps
- code-level ambiguity is lower than it was before
- the remaining work is mostly environment completion and live verification

Current missing launch-critical items to mention:

- `AUTH_SECRET`
- canonical Stripe secret, webhook, price, and product envs
- `N8N_WORKFLOW_DESTINATIONS`
- n8n callback and outbound dispatch secrets
- OpenAI/LangGraph execution envs
- report signing, email, notification, cron, ops, and public intake secrets

## 60-Minute Call Agenda

### 0-10 Minutes: Context

- [ ] Introductions
- [ ] Role expectations
- [ ] Clarify whether the assignment is review, fix, or full launch ownership

### 10-25 Minutes: Product And Architecture

- [ ] Explain the product and customer flow
- [ ] Explain source-of-truth boundaries
- [ ] Explain the external system roles

### 25-40 Minutes: Repo And Environment Reality

- [ ] Walk through the current readiness summary
- [ ] Show the missing-env categories
- [ ] Show the current go or no-go posture

### 40-50 Minutes: Working Norms

- [ ] Explain branch and review expectations
- [ ] Explain how environment requests should be made
- [ ] Explain what can be changed without extra approval

### 50-60 Minutes: First-Day Plan

- [ ] Confirm the 22-hour deliverables
- [ ] Confirm which access gaps still need to be granted
- [ ] Confirm who approves production-facing changes

## 90-120 Minute Extended Call Agenda

If you have more time, add:

### Environment Walkthrough

- [ ] Show where envs are managed
- [ ] Explain which secrets are canonical
- [ ] Explain preview versus production differences

### Integration Walkthrough

- [ ] Stripe mapping and webhook expectations
- [ ] n8n workflow destination and callback expectations
- [ ] OpenAI/LangGraph execution path
- [ ] delivery and report-signing path

### Q And A

- [ ] Ask what still feels ambiguous
- [ ] Ask what access is still missing
- [ ] Ask what they would validate first

## Questions You Should Be Ready To Answer

- [ ] Which environment is canonical right now
- [ ] Which secrets exist already and where
- [ ] Who owns Stripe configuration
- [ ] Who owns n8n workflow edits
- [ ] Who can approve Vercel production changes
- [ ] Whether HubSpot is in scope for launch
- [ ] Whether Apollo is in scope for launch
- [ ] Whether there is any pending production incident or deadline

## Questions You Should Ask The Engineer

- [ ] Do you have enough access to verify the critical path
- [ ] Which blocker do you expect first
- [ ] Would you classify this first pass as review or execution
- [ ] What would you need to make a trustworthy go or no-go call
- [ ] What would make the 22-hour window unrealistic

## What Deliverables To Request After The Call

- [ ] a short repo-health summary
- [ ] a missing-env and missing-access list
- [ ] exact commands run
- [ ] exact tests run
- [ ] lane-by-lane readiness status
- [ ] a final recommendation: `GO`, `PARTIAL`, or `NO-GO`

## Practical Meeting Notes Template

- Engineer:
- Date:
- Role scope:
- Repo access granted:
- Neon access granted:
- Vercel access granted:
- Stripe access granted:
- n8n access granted:
- OpenAI access granted:
- Resend or email access granted:
- HubSpot access granted:
- Apollo access granted:
- Known missing access:
- First-day deadline:
- Agreed deliverables:
- Decision owner for production changes:
- Next checkpoint:

## Recommended Closing Script

Use a close like this:

"Your first responsibility is to verify what is true, separate code issues from environment issues, and leave us with a trustworthy next-step recommendation. If something is blocked by access or missing secrets, call that out directly rather than working around it."
