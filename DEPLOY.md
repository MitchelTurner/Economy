# Deploying Island Ledger

SPEC [§3](./SPEC.md) targets **Railway** (or any Node + Postgres + Redis + S3-compatible host). Local infra stays in `docker-compose.yml`; full stack smoke uses `docker-compose.prod.yml`.

## Services

| Service | Role |
|---|---|
| **API** (`apps/api`) | NestJS on `:3000`. Runs `prisma migrate deploy` then `node dist/main.js`. |
| **Web** (`apps/web`) | Vite SPA. Set `VITE_API_URL` at **build** time to the public API origin (or `/api` behind nginx). |
| **Postgres** | Prisma `DATABASE_URL` |
| **Redis** | JWT refresh sessions + BullMQ |
| **S3 / R2 / MinIO** | Receipt images |

Health probes:

- `GET /health` — liveness
- `GET /health/ready` — Postgres + Redis (use this for deploy readiness)

## Environment (production checklist)

Copy from `.env.example`, then set:

```
NODE_ENV=production
DATABASE_URL=...
REDIS_URL=...
JWT_SECRET=<long random>
JWT_REFRESH_SECRET=<different long random>
CORS_ORIGIN=https://your-web-origin
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
EXTRACTION_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ALLOW_MOCK_EXTRACTION=false
RESEND_API_KEY=...   # optional; else mail logs
MAIL_FROM=Island Ledger <noreply@yourdomain>
PUBLIC_MIN_HOUSEHOLDS=3
```

Boot fails fast if production secrets are weak/missing or `CORS_ORIGIN` is unset.

Web build:

```
VITE_API_URL=https://your-api.example.com npm run build -w @island-ledger/web
```

## Railway sketch

1. Provision Postgres + Redis plugins (or external).
2. Create **API** service from repo root, Dockerfile path `apps/api/Dockerfile`, root directory `.`
3. Set env vars above; health check path `/health/ready`
4. Create **Web** service with Dockerfile `apps/web/Dockerfile`, build arg `VITE_API_URL=https://<api-public-url>`
5. Point custom domains; ensure `CORS_ORIGIN` matches the web origin
6. After first deploy run **reference seed** (catalog, baselines, shipping lanes) without wiping real households:
   `railway run -s api npm run db:seed:reference -w @island-ledger/api`
   Or set `SEED_ON_BOOT=reference` once on the API service (runs after migrate on container start; leave `off` afterward).
7. Optional demo household + 6 months of synthetic history: `npm run db:seed` (`SEED_DEMO=1`, default) or `SEED_ON_BOOT=demo`

## Compose smoke

```bash
docker compose -f docker-compose.prod.yml up --build
# Web http://localhost:8080  API http://localhost:3000/health/ready
# API healthcheck uses Node fetch (no wget on alpine)
```

## Backup & migrate runbook

- **Migrate on boot:** API container CMD runs `prisma migrate deploy` then `node dist/main.js`.
- **Postgres backup:** `pg_dump "$DATABASE_URL" -Fc -f island-$(date +%F).dump`  
  Restore: `pg_restore --clean --if-exists -d "$DATABASE_URL" island-YYYY-MM-DD.dump`
- **Receipt images:** back up the S3/R2/MinIO bucket (`S3_BUCKET`) separately from the DB.
- **Reference vs demo seed:** production should use `db:seed:reference` (`SEED_DEMO=0`) for categories/staples/aliases/stores/baselines/shipping lanes. Full `db:seed` also creates `demo@islandledger.local` and synthetic history — fine for local/dev only.
- **`SEED_ON_BOOT`:** `off` (default) | `reference` | `demo` — API entrypoint runs migrate, optional seed, then `node dist/main.js`. Prod compose sets `SEED_ON_BOOT=off`. Prod images install runtime deps only (`npm ci --omit=dev`) plus `tsx` for seed.

## Rollback

1. **App image:** redeploy the previous API/web image tag (Railway previous deploy, or `docker compose … up` with the prior build). Schema-compatible releases should start cleanly.
2. **Failed migration:** restore Postgres from the latest `pg_dump` (see above), then redeploy the last known-good API image that matches that schema. Do not leave a half-applied migration against production data.
3. **Accidental seed:** if `SEED_ON_BOOT=demo` ran in prod, restore DB from backup; leave `SEED_ON_BOOT=off` afterward. Reference seed is upsert-only for catalog/baselines and is safer, but still prefer explicit `db:seed:reference` once.
4. **Web-only rollback:** ship the previous web image; API need not move if contracts are unchanged.

## Web security headers

`apps/web/nginx.conf` sets `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a tight CSP (self + Google Fonts). Enable **HSTS** only on the TLS terminator (Railway/CDN), e.g. `Strict-Transport-Security: max-age=31536000; includeSubDomains` — do not set HSTS on plain HTTP compose.

## Observability

- Liveness: `GET /health`
- Readiness: `GET /health/ready` (Postgres + Redis) — use this as the Railway health check
- Every response includes `x-request-id` (echoes inbound header when present). API logs: `METHOD path status duration requestId=…` (health probes omitted)
- Extraction success/failure and daily-cap hits are logged at info/warn with receipt + household ids
- Railway/compose: scrape container stdout; no separate metrics sidecar in v1

## Rate limits (Redis-backed when available)

Counters use Redis (`ratelimit:*` keys) so multi-replica Railway deploys share limits. Falls back to in-process memory if Redis is unreachable.

| Env | Default | Applies to |
|---|---|---|
| `RATE_LIMIT_AUTH` | 30 / min / IP | `POST /auth/login\|register\|refresh` |
| `RATE_LIMIT_UPLOAD` | 60 / min / IP+household | `POST /receipts/upload-url` |
| `RATE_LIMIT_PUBLIC` | 120 / min / IP | `GET /public/*` |
| `JSON_BODY_LIMIT` | `6mb` | Express JSON parser (imageBase64 fallback) |

## Scheduled jobs (BullMQ)

Registered at API boot (`SchedulersService`):

| Job | Cron (UTC) | Behavior |
|---|---|---|
| `price.index` nightly | `0 8 * * *` | Staples index rollup for all regions |
| `insights.generate` weekly | `0 14 * * 0` | Fan-out per household with `sendDigest: true` |
| `receipt.cleanup` daily | `0 3 * * *` | Delete orphan `receipts/*` object keys with no receipt row |

Manual index rollup: `POST /prices/index/rollup` (household **owner** JWT only).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs generate → lint → test → build → extraction eval smoke, then validates Dockerfiles via `docker build`.
