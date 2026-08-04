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
JWT_SECRET=<long random ≥32 chars, not containing "change-me">
JWT_REFRESH_SECRET=<different long random ≥32 chars>
CORS_ORIGIN=https://your-web-origin
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
EXTRACTION_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ALLOW_MOCK_EXTRACTION=false
RESEND_API_KEY=...   # optional; else mail logs (needed for forgot-password emails)
MAIL_FROM=Island Ledger <noreply@yourdomain>
PUBLIC_MIN_HOUSEHOLDS=3
```

Boot fails fast if production secrets are weak/missing or `CORS_ORIGIN` is unset.

**Railway Variables (API service) — required for boot:**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | From Railway Postgres plugin |
| `REDIS_URL` | From Railway Redis plugin |
| `JWT_SECRET` | `openssl rand -base64 48` — must not contain `change-me`, ≥32 chars |
| `JWT_REFRESH_SECRET` | Another `openssl rand -base64 48` — **must differ** from `JWT_SECRET` |
| `CORS_ORIGIN` | Public web origin, e.g. `https://your-app.up.railway.app` |
| `ALLOW_MOCK_EXTRACTION` | `true` until Anthropic is wired; else set `ANTHROPIC_API_KEY` |

Generate secrets locally:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Paste each into a separate Railway variable on the **API** service.

**Railway Variables gotcha:** new/edited variables often appear with a **purple / staged** background and are **not** injected until you click **Deploy** (or Apply) on that service. Saving alone is not enough. After deploy, API logs must show `JWT_SECRET=yes JWT_REFRESH_SECRET=yes`. If they show `MISSING`, the vars are on the wrong service or still staged.

Web build:

```
VITE_API_URL=https://your-api.example.com npm run build -w @island-ledger/web
```

## Railway sketch

1. Provision Postgres + Redis plugins (or external).
2. Create **API** service from the monorepo root (Railpack or Dockerfile).
   - **Railpack (default):** root directory `.`, build `npm run build --workspace=@island-ledger/api`, start `npm run start --workspace=@island-ledger/api`. Build runs `prisma generate`; start runs `docker-entrypoint.sh` (`migrate deploy` → optional seed → `node dist/main.js`). The process listens on Railway’s `PORT` (falls back to `API_PORT`, default 3000) on `0.0.0.0`.
   - **Dockerfile:** path `apps/api/Dockerfile`, root directory `.` (same entrypoint).
3. Set env vars above. Repo `railway.toml` uses health check **`/health`** (liveness). Do **not** point Railway’s healthcheck at `/health/ready` unless Redis is linked — ready returns 503 without Redis and the edge will 502.
4. Networking: leave the public domain **target port empty** (auto) so it follows Railway’s `PORT`. If you hard-code target port `3000` while the app listens on another `PORT`, you get **Application failed to respond**.
5. Attach **Postgres + Redis** plugins and reference their `DATABASE_URL` / `REDIS_URL` on the API service. Without Redis, HTTP can still come up, but queues/schedulers/auth refresh won’t work.
6. Create **Web** as a **separate** Railway service (same repo). Critical settings:
   - **Builder:** Dockerfile (not Railpack — root `railway.toml` is for the API)
   - **Root directory:** `apps/web` (build context is the web app only)
   - **Dockerfile path:** `Dockerfile` (not `apps/web/Dockerfile` — that doubles the path when root is already `apps/web`)
   - Optional: Config-as-code path `apps/web/railway.toml`
   - **Variable / build-arg `VITE_API_URL`:** `https://<your-api-public-host>` with **no trailing slash**  
     Example: `https://island-ledger-api-production.up.railway.app`  
     Do **not** use `/api` on Railway (that only works in docker-compose with the nginx proxy).
   - Networking: public domain, **target port empty** (nginx listens on Railway `PORT`)
   - Web nginx is **SPA-only** (no `/api` proxy). The browser calls `VITE_API_URL` directly.
7. On the **API** service set `CORS_ORIGIN` to the **web** public origin (e.g. `https://island-ledger-web-production.up.railway.app`). Redeploy API after changing CORS.
8. After first deploy run **reference seed** (catalog, baselines, shipping lanes) without wiping real households:
   `railway run -s api npm run db:seed:reference -w @island-ledger/api`
   Or set `SEED_ON_BOOT=reference` once on the API service (runs after migrate on container start; leave `off` afterward).
9. Optional demo household + 6 months of synthetic history: `npm run db:seed` (`SEED_DEMO=1`, default) or `SEED_ON_BOOT=demo`

### Web service checklist (Railway)

| Setting | Value |
|---|---|
| Builder | Dockerfile |
| Root directory | `apps/web` |
| Dockerfile path | `Dockerfile` |
| `VITE_API_URL` | Full public API URL, no trailing slash |
| Target port | **Empty (auto)** — do not hard-code 80 or 3000 |
| Healthcheck | `/` (optional) |

If the web service was created with Railpack, open **Settings → Build** and switch to Dockerfile, set root directory + Dockerfile path above, set `VITE_API_URL`, then **Redeploy**. Rebuild is required after changing `VITE_API_URL` (it is baked into the JS bundle).

**Build error `/apps/web: not found`:** the Dockerfile expects context `apps/web`, but Railway is using the monorepo root (or the reverse mismatch). Set **Root directory = `apps/web`** and **Dockerfile path = `Dockerfile`**, then redeploy with a clean build.

If the public URL shows **Application failed to respond**:

**Web service**
1. Deploy logs must show `Configuration complete; ready for start up` with **no** `[emerg]`.
2. Settings → Networking → **target port empty** (nginx listens on Railway `$PORT`, not necessarily 80).
3. `VITE_API_URL` must be the public API origin; rebuild after changing it.
4. If Capture says **API unreachable** while your phone has internet: the SPA cannot call the API (wrong/missing `VITE_API_URL`, or API `CORS_ORIGIN` is not the web origin). Settings shows the baked-in API base URL.

**API service**
1. Deploy logs must show `Island Ledger API listening on 0.0.0.0:<port>` — if not, boot crashed (JWT / CORS / migrate) or hung before listen.
2. Settings → Networking → **target port empty** (or equal to the logged port — not a hard-coded `3000` unless that is the logged port).
3. Variables: distinct ≥32-char `JWT_SECRET` + `JWT_REFRESH_SECRET`, `CORS_ORIGIN` = web origin (not `localhost`), `DATABASE_URL`, `REDIS_URL`, `TRUST_PROXY=1`.
4. Hit `https://<api>/health` (should return `{"ok":true,...}`).

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

IP-keyed limits use Express `req.ip` only — never raw `X-Forwarded-For`. Set `TRUST_PROXY` when the API sits behind a reverse proxy (compose nginx sets `X-Forwarded-For`; Railway/edge usually needs `TRUST_PROXY=1`). Default `false` ignores spoofed forwarding headers.

| Env | Default | Applies to |
|---|---|---|
| `TRUST_PROXY` | `false` locally / `1` in production when unset | Express trust-proxy for `req.ip` (`false` / `1` / hop count / proxy CIDRs) |
| `PORT` | set by Railway | Listen port (wins over `API_PORT`) |
| `API_PORT` | `3000` | Listen port when `PORT` is unset |
| `RATE_LIMIT_AUTH` | 30 / min / IP (user id for me/change-password/logout-all) | `POST /auth/login\|register\|refresh\|logout\|change-password\|logout-all`, `PATCH /auth/me` |
| `RATE_LIMIT_UPLOAD` | 60 / min / IP+household | receipt upload/register/manual/confirm/reextract/reopen/delete + review patch/line/same-as-last/rematch/apply-category |
| `RATE_LIMIT_PUBLIC` | 120 / min / IP | `GET /public/*` |
| `RATE_LIMIT_INVITE` | 30 / min / IP (+ household for create/revoke) | `POST /household/invites`, `GET …/peek`, `POST …/accept`, `DELETE …/invites/:id` |
| `RATE_LIMIT_HOUSEHOLD` | 20 / min / user+household | household mutates; budgets/alerts/insights; catalog store/product/alias creates; `POST /prices/index/rollup` |
| `JSON_BODY_LIMIT` | `6mb` | Express JSON parser (imageBase64 fallback) |

## Scheduled jobs (BullMQ)

Registered at API boot (`SchedulersService`):

| Job | Cron (UTC) | Behavior |
|---|---|---|
| `price.index` nightly | `0 8 * * *` | Staples index rollup for all regions |
| `insights.generate` weekly | `0 14 * * 0` | Fan-out per household with `sendDigest: true` |
| `receipt.cleanup` daily | `0 3 * * *` | Delete orphan `receipts/*` keys; mark `EXTRACTING` older than 5m as `FAILED` |

Manual index rollup: `POST /prices/index/rollup` (household **owner** JWT only).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs generate → lint → test → build → extraction eval smoke, then validates Dockerfiles via `docker build`.
