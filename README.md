# Island Ledger

Receipt scanning, island cost-of-goods tracking, and spending insights.

See [`SPEC.md`](./SPEC.md) for the full product and technical specification.

## Stack

- **API:** NestJS + Prisma + PostgreSQL + BullMQ/Redis
- **Web:** React + Vite + Tailwind (mobile-first PWA)
- **Extraction:** Vision LLM (Anthropic) with a deterministic mock for local/dev

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api   # :3000
npm run dev:web   # :5173
```

Demo login (after seed): `demo@islandledger.local` / `demo-password-123`

Set `EXTRACTION_PROVIDER=mock` (default when no `ANTHROPIC_API_KEY`) to run the upload → extract → review loop without a vision model.

## Monorepo layout

```
apps/api     NestJS backend (domain modules per SPEC §5)
apps/web     React PWA
data/        abbreviation dictionary + staple basket seed data
```

## Phase status

**Phase 0** (this branch): auth, household scoping, presigned upload, extraction job (mock/real), review UI, confirm, receipt list, spend-by-category.

Phase 1+ (catalog matching, price intelligence, insight rules beyond budget pace) is scaffolded with schema and endpoints; deepen per `SPEC.md` §11.
