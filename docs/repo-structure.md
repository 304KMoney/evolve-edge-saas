# Recommended Repo Structure

```text
evolve-edge/
  apps/
    web/
      app/
        dashboard/
      components/
      lib/
    admin/
      app/
      components/
      lib/
  packages/
    db/
      prisma/
      src/
    ui/
      src/
    config/
  docs/
  .github/
```

## Folder roles

- `apps/web`: customer-facing SaaS product
- `apps/admin`: support, QA, and workflow operations
- `packages/db`: Prisma schema, migrations, typed DB helpers
- `packages/ui`: shared layout, cards, badges, and tables
- `docs`: architecture, route maps, and integration contracts

