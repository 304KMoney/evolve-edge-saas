# Phase 60 Incident Handling Guide

This guide covers commercial incidents affecting billing correctness, entitlement access, or quota enforcement.

## Incident classes

### Class A: Billing correctness risk

Examples:

1. Stripe paid subscription but workspace access is incorrect
2. internal subscription moved to the wrong state
3. multiple orgs show stale billing after webhook failures

Immediate actions:

1. stop risky manual overrides unless explicitly approved
2. inspect Stripe webhook failures and replay backlog
3. use org-level manual resync only after verifying Stripe truth
4. capture affected org ids and Stripe ids

### Class B: Revenue recovery risk

Examples:

1. payment failed and customer is not being followed up
2. cancellation state is unclear
3. repeated retryable webhook failures are building up

Immediate actions:

1. review `/admin/accounts/[organizationId]`
2. review `/admin/replays`
3. confirm retryable vs terminal failure classification
4. create operator follow-up using the customer control plane if customer outreach is needed

### Class C: Quota/access confusion

Examples:

1. customer hits quota unexpectedly
2. quota appears exceeded but usage logs do not match expected actions
3. enterprise override expired unexpectedly

Immediate actions:

1. inspect usage event log
2. inspect active overrides
3. confirm monthly window boundaries in UTC
4. verify whether the issue is enforcement, visibility, or customer expectation mismatch

## Triage evidence to capture

For every incident, capture:

1. organization id
2. customer account id if present
3. Stripe customer id
4. Stripe subscription id
5. billing event ids or replay ids when relevant
6. screenshots or copied state from the admin billing snapshot

## Recovery guardrails

Do:

1. trust Stripe for payment truth
2. trust the app for entitlement/access truth after sync
3. prefer replay for failed idempotent receipts
4. use manual resync when Stripe state is known-good and app state is stale

Do not:

1. change database records manually
2. “retry everything” without checking eligibility
3. use entitlement overrides to hide a broken billing sync without documenting it

## Follow-up after resolution

1. confirm the account timeline reflects the resolved commercial state
2. confirm billing event logs and usage logs are readable for support
3. document root cause and whether replay, resync, or override was used
4. add engineering follow-up if the incident exposed a missing guardrail
