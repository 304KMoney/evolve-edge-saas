# Incident Response Runbook

**Evolve Edge AI — Internal Operations Document**
Last updated: April 27, 2026

---

## Table of Contents

1. [Severity Levels](#severity-levels)
2. [Detection Sources](#detection-sources)
3. [Response Playbooks](#response-playbooks)
4. [Post-Mortem Template](#post-mortem-template)
5. [Key Contacts](#key-contacts)

---

## Severity Levels

| Level | Name | Description | Response Mode | Acknowledge SLA | Resolve SLA |
|-------|------|-------------|---------------|-----------------|-------------|
| **P0** | Critical | Data breach, complete service outage, payment processing down | Immediate, 24/7 | 15 minutes | 4 hours |
| **P1** | High | Partial outage, AI delivery failures, billing reconciliation errors | Business hours + on-call | 1 hour | 24 hours |
| **P2** | Medium | Single customer issue, non-critical feature broken, slow performance | Business hours | 4 hours | 72 hours |
| **P3** | Low | Cosmetic issues, documentation gaps, minor UX problems | Next sprint | — | Next sprint |

### P0 — Critical (Immediate, 24/7)

Examples:
- Confirmed data breach or unauthorized access to customer data
- Complete service outage (platform unreachable)
- Payment processing down (Stripe webhook failures blocking all billing events)
- Security vulnerability actively being exploited

**Response:** Page [FOUNDER_NAME] and [ENGINEER_NAME] immediately regardless of time zone. Begin incident response within 15 minutes of detection.

### P1 — High (Business Hours + On-Call)

Examples:
- Partial outage affecting a subset of customers or features
- AI delivery pipeline failures (n8n workflows failing, reports not generating)
- Billing reconciliation errors
- Data export failures for customer reports
- Repeated authentication failures at scale

**Response:** Notify on-call team. Begin investigation within 1 hour.

### P2 — Medium (Business Hours)

Examples:
- Single customer experiencing an issue not reproducible system-wide
- Non-critical feature broken (e.g., a minor dashboard widget)
- Slow page loads not causing functional failures
- Failed email notifications for a single customer

**Response:** Standard ticket workflow. Acknowledge within 4 hours, resolve within 72 hours.

### P3 — Low (Next Sprint)

Examples:
- Visual/cosmetic bugs
- Documentation errors
- Minor UX improvements
- Non-blocking deprecation warnings

**Response:** Log issue in project tracker for next sprint.

---

## Detection Sources

| Source | What It Covers | Who Gets Alerted |
|--------|---------------|-----------------|
| **Sentry** | Application errors, exceptions, performance degradation | Engineering |
| **Vercel Deployment Alerts** | Failed deployments, build errors | Engineering |
| **n8n Workflow Failure Webhooks** | AI pipeline failures, workflow errors | Engineering + Operations |
| **Customer Support Reports** | Issues reported by customers via email | Operations |
| **Stripe Webhook Failures** | Billing events not processed, webhook delivery failures | Engineering + Finance |
| **`/api/fulfillment/health`** | Fulfillment pipeline health checks | Engineering (monitoring) |
| **`/api/health/status`** | General application health | Infrastructure |

---

## Response Playbooks

### Playbook 1: Data Breach

**Trigger:** Confirmed or suspected unauthorized access to customer data.

**Steps:**

1. **Isolate** — Immediately revoke any compromised credentials or tokens. If a deployment is implicated, roll back via Vercel dashboard.
2. **Assess scope** — Determine which customers, data categories, and time periods were affected. Review Neon audit logs and application audit logs.
3. **Contain** — Apply patches, force re-authentication for affected users, rotate secrets.
4. **Notify affected customers** — Within 72 hours of becoming aware, send notification to affected customers describing the nature of the breach and remediation steps.
5. **Notify regulators** — If required by applicable law (e.g., GDPR: 72-hour notification to supervisory authority), engage [LEGAL_CONTACT] to file notification.
6. **Document and post-mortem** — Within 5 business days, complete a post-mortem (see template below).

**Contacts:** [FOUNDER_NAME] (executive escalation), [ENGINEER_NAME] (technical response), [LEGAL_CONTACT] (legal/regulatory).

---

### Playbook 2: Service Outage

**Trigger:** Platform is unreachable or critical features are non-functional.

**Steps:**

1. **Check Vercel Status** — Visit [https://www.vercel-status.com](https://www.vercel-status.com) or the Vercel dashboard for deployment or infrastructure alerts.
2. **Check Neon Status** — Visit [https://neonstatus.com](https://neonstatus.com) for database availability.
3. **Check recent deployments** — If a recent deployment is suspected, roll back via the Vercel dashboard:
   - Go to Vercel > Project > Deployments
   - Find the last known-good deployment
   - Click "Rollback to this deployment"
   - Or use CLI: `vercel rollback`
4. **Check application errors** — Review Sentry for error spikes or panics at the time of the outage.
5. **Escalate to infrastructure** — If the issue is not resolvable via rollback or configuration change, escalate to Vercel support or Neon support as appropriate.
6. **Update status** — Communicate status to customers via your support channel.

---

### Playbook 3: Billing Failure

**Trigger:** Stripe webhooks failing, subscriptions not updating, payment events not processed.

**Steps:**

1. **Check Stripe Dashboard** — Review [https://dashboard.stripe.com](https://dashboard.stripe.com) > Developers > Webhooks for failed event deliveries.
2. **Check webhook logs** — Review the `/api/webhooks/stripe` route logs in Vercel for errors.
3. **Re-deliver failed events** — In the Stripe dashboard, you can manually re-deliver failed webhook events.
4. **Manually reconcile** — Use the `/admin` console in the Evolve Edge platform to manually sync subscription state if necessary.
5. **Notify affected customer** — If a specific customer's subscription is affected, notify them directly with an explanation and ETA for resolution.

---

### Playbook 4: AI Delivery Failure

**Trigger:** Reports not generating, n8n workflows failing, AI pipeline errors.

**Steps:**

1. **Check n8n workflow logs** — Log into the n8n instance and review workflow execution history for errors. Look for:
   - HTTP timeout errors (OpenAI, LangGraph)
   - Missing required payload fields
   - Database write failures
2. **Check `/admin/queues`** — Review the operations queue in the Evolve Edge admin console for stalled or failed jobs.
3. **Retry via operator console** — Use the operator console to retry failed AI execution jobs for affected customer runs.
4. **Identify root cause** — Determine if the failure is due to:
   - AI provider outage (check OpenAI status at [https://status.openai.com](https://status.openai.com))
   - Internal workflow bug (check Sentry for errors)
   - Data issue in customer's submission
5. **Notify customer with ETA** — Send the customer an email or message explaining the delay and providing an expected resolution time.

---

## Post-Mortem Template

**Incident ID:** [auto-generated or sequential]
**Date of incident:** YYYY-MM-DD
**Severity:** P0 / P1 / P2
**Duration:** [start time → end time]
**Authored by:** [name]

### Timeline

| Time (UTC) | Event |
|------------|-------|
| HH:MM | Incident detected |
| HH:MM | On-call engineer paged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Customers notified |

### Root Cause

[Description of what caused the incident. Be specific: which system, which component, which change.]

### Impact

- **Customers affected:** [number or "all"]
- **Data affected:** [yes/no, what categories]
- **Duration of impact:** [HH hours MM minutes]
- **Revenue impact:** [if known]

### Resolution

[What was done to resolve the incident. Steps taken, rollbacks, patches applied.]

### Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Specific action to prevent recurrence] | [Owner] | YYYY-MM-DD | Open |
| [Monitoring improvement] | [Owner] | YYYY-MM-DD | Open |
| [Documentation update] | [Owner] | YYYY-MM-DD | Open |

---

## Key Contacts

| Role | Name | Escalation Path |
|------|------|-----------------|
| Engineering Lead | [ENGINEER_NAME] | Primary technical escalation |
| Founder / Executive | [FOUNDER_NAME] | P0 escalation, customer communication approval |
| Legal / Compliance | [LEGAL_CONTACT] | Data breach regulatory notifications |

---

*This runbook should be reviewed and updated after every P0 and P1 incident, and at minimum quarterly.*
