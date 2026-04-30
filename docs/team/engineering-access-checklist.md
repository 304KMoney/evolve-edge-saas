# Engineering Access Checklist

Use this before Harshay starts and check off each item.

## Identity And Communication

- company email created or confirmed not needed
- calendar access granted
- chat access granted
- emergency contact path established for launch-critical incidents

## Code And Delivery

- GitHub repository access granted
- branch and pull request workflow explained
- deployment workflow explained
- Vercel access granted
- hosted environments identified: local, preview, production

## Data And Infrastructure

- Neon access granted
- database role and permissions confirmed
- Prisma migration expectations explained
- seed data expectations explained

## Integrations

- Stripe access granted
- n8n access granted
- Dify access granted
- HubSpot access granted if needed for the current slice
- password manager or secret vault access granted

## Local Environment

- `.env.example` shared
- required local secrets identified
- hosted-only secrets identified
- install command shared:

```powershell
pnpm install
```

- database and generation commands shared:

```powershell
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

- verification commands shared:

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
Set-Location ../..
pnpm test
pnpm preflight:first-customer:env
pnpm preflight:first-customer
```

## Product And Operating Context

- first-customer offer explained
- canonical plans explained
- workflow codes explained
- source-of-truth boundaries explained
- operator runbook shared
- first-customer launch checks shared
- paid flow smoke test shared

## Security And Compliance

- NDA signed
- device expectations explained
- credential handling expectations explained
- no-sharing / no-copying / no-personal-storage rule explained
- incident reporting path explained

## First Milestone

- first 2-week milestone defined
- first 2-day slice defined
- success criteria written down
- async update cadence agreed
- code review expectations agreed
