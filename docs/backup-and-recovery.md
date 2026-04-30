# Backup and Recovery Policy

**Evolve Edge AI — Internal Operations Document**
Last updated: April 27, 2026

---

## Overview

This document describes the backup strategy, recovery procedures, and verification processes for Evolve Edge AI. The primary data store is a Neon Postgres database hosted on the Neon serverless platform.

---

## Recovery Objectives

| Metric | Target |
|--------|--------|
| **RPO** (Recovery Point Objective) | 1 hour — Neon provides continuous WAL (Write-Ahead Log) archiving, enabling point-in-time recovery with sub-hour granularity |
| **RTO** (Recovery Time Objective) | 4 hours — Time to restore service from a backup or point-in-time recovery |

---

## Neon Postgres Backup and Point-in-Time Recovery (PITR)

### How It Works

Neon provides built-in continuous WAL archiving. This means every transaction is durably written to storage in near-real-time, enabling recovery to any point in time within the retention window (typically 7 days on paid plans).

### Verifying PITR is Enabled

1. Log into the [Neon Console](https://console.neon.tech)
2. Navigate to your project
3. Go to **Settings → Backups**
4. Confirm that "Point-in-Time Recovery" is shown as **Enabled**
5. Note the retention window (should be ≥ 7 days for production)

### Restoring to a Point in Time

**Via Neon Console:**
1. Go to [https://console.neon.tech](https://console.neon.tech)
2. Select your project
3. Navigate to **Branches**
4. Click **"Restore"** on the main branch
5. Select the target date and time (within the retention window)
6. Click **"Restore branch"** — Neon creates a new branch from that point in time
7. Validate the restored data in the new branch
8. If correct, promote the restored branch to primary

**Via Neon CLI:**
```bash
neon branches restore main --timestamp "2026-04-27T10:00:00Z"
```

### Database Connection String Rotation

If the database connection string (e.g., `DATABASE_URL`) is compromised or needs rotation:

1. Log into the Neon Console
2. Navigate to **Settings → Connection Details**
3. Reset the database password
4. Update the `DATABASE_URL` environment variable in:
   - Vercel Environment Variables (Production, Preview, Development)
   - Any `.env.local` files on developer machines
   - n8n workflow environment settings
   - Any other services using the connection string
5. Redeploy the Vercel application to pick up the new connection string
6. Verify connectivity with a health check at `/api/health/status`

---

## Vercel Deployment Rollback

If a production deployment causes an incident, roll back immediately:

**Via Vercel Dashboard:**
1. Go to [https://vercel.com](https://vercel.com) → Your Project → Deployments
2. Find the last known-good deployment
3. Click the **three-dot menu** → **"Promote to Production"** (or "Rollback")

**Via Vercel CLI:**
```bash
vercel rollback [deployment-url]
```

After rollback, investigate the root cause before re-deploying.

---

## Evidence File Backup

Evidence files are currently stored as metadata and file references in the Neon Postgres database. If files are referenced externally (e.g., stored in object storage), the following applies:

- **Database metadata:** Covered by Neon PITR (see above)
- **External file storage:** Document storage location and backup procedures here once an object storage provider is configured (e.g., S3, Cloudflare R2)
- **Current status:** All evidence file data is stored within the Neon database; PITR covers full evidence recovery

---

## Monthly Backup Verification Checklist

Run this checklist on the first Monday of each month:

- [ ] **Neon PITR enabled** — Log into Neon Console and confirm PITR is active with ≥ 7-day retention
- [ ] **Test restore** — Create a test branch from a 24-hour-old snapshot and verify data integrity (sample 10 records from key tables: `User`, `Organization`, `CustomerRun`, `ReportPackage`)
- [ ] **Connection string validity** — Confirm `DATABASE_URL` is not expired or blocked
- [ ] **Vercel deployment history** — Confirm at least one prior known-good deployment exists in the Vercel dashboard for rollback
- [ ] **n8n workflow continuity** — Confirm n8n instance has recent successful workflow executions
- [ ] **Sentry error baseline** — Review Sentry for any persistent unresolved errors
- [ ] **Recovery documentation** — Confirm this document is up to date

**Sign off:** [Engineer name + date]

---

## Secret Rotation Schedule

| Secret | Location | Recommended Rotation |
|--------|----------|---------------------|
| `DATABASE_URL` | Neon + Vercel env | On suspected compromise; otherwise annually |
| `SESSION_SECRET` | Vercel env | Annually (causes all sessions to invalidate) |
| `CRON_SECRET` | Vercel env | Annually |
| `STRIPE_SECRET_KEY` | Vercel env | On suspected compromise |
| `RESEND_API_KEY` | Vercel env | Annually |
| `OPENAI_API_KEY` | Vercel env | Annually |

---

## Contacts

For backup/recovery incidents, refer to the [Incident Response Runbook](./incident-response-runbook.md).
