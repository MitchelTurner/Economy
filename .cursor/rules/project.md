# Island Ledger — project rules

## Stack

- **Backend:** NestJS, one module per domain (`auth`, `receipts`, `extraction`, `catalog`, `prices`, `budgets`, `insights`, `analytics`, `jobs`)
- **ORM/DB:** Prisma + PostgreSQL
- **Queue:** BullMQ on Redis
- **Frontend:** React + Vite + Tailwind, mobile-first PWA
- **Auth:** email + password (argon2), JWT access + refresh, sessions in Redis
- **Validation:** zod for all external input (HTTP bodies, extraction model output)

## Money & numbers

- Money is **integer cents** (`Int`) everywhere. Never `Float` for money.
- Per-unit comparable prices use `Decimal(12, 4)`.
- Format currency only via the shared cents helper on the frontend; never render raw cents.

## Schema

Consult `SPEC.md` §4 before changing the Prisma schema. Schema changes require a migration in the same commit.

## File layout

```
/
  SPEC.md
  package.json                 # npm workspaces root
  docker-compose.yml           # postgres + redis (+ minio for local S3)
  apps/
    api/                       # NestJS
      prisma/
        schema.prisma
        seed.ts
        migrations/
      src/
        main.ts
        app.module.ts
        common/                # guards, pipes, decorators, money utils
        prisma/
        auth/
        receipts/
        extraction/
        catalog/
        prices/
        budgets/
        insights/
        analytics/
        jobs/
        storage/               # S3/R2 client
    web/                       # React + Vite + Tailwind PWA
      src/
        main.tsx
        App.tsx
        lib/                   # api client, money, image preprocess
        pages/
        components/
        hooks/
  packages/                    # shared types/utils if needed
  data/
    abbreviations.json         # receipt abbreviation dictionary (seedable)
    baskets/
      staples-25.json
```

## Conventions

- Every authenticated query is **household-scoped**. Use the household guard; do not trust client-supplied `householdId` for authorization.
- Extraction and analytics run out-of-band via BullMQ — never block the request path on the vision model.
- Human-in-the-loop review is a feature: corrections write `ProductAlias` rows.
- Tests first for money math, unit/alias normalization, and insight rule thresholds.
- Prefer mocked extraction provider in tests and local default; wire Anthropic via env.
