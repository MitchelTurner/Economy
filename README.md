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

**Phase 0:** auth, household scoping, presigned upload, extraction job (mock/real), review UI, confirm, receipt list, spend-by-category.

**Phase 1:** product/alias matching pipeline (`receipt.match`), review-screen product chips + alias learning, price history charts (per base UOM), store comparison matrix.

**Phase 2:** insight rule engine (8 rules + fixture tests), nightly staples index rollup, baseline prices, weekly digest, behavior-vs-inflation split, 6-month synthetic seed.

**Phase 3:** public anonymized island index (≥3 household gate), price-drop alerts, mainland delivered-cost comparison, household invites, JSON/CSV export + hard delete.

**Phase 4:** extraction eval harness (`data/extraction-fixtures`), upload→confirm integration test, optional insight LLM narration, Resend/log email for digests/alerts/invites, real IndexedDB capture outbox, budgets UI (category/period/edit/delete).

**Phase 5:** zoomable receipt image on review, header + line add/delete, suspect-line highlight, HEIC conversion, dashboard index/habits/review queue, receipt filters, PWA shell cache, invite peek/revoke + move confirmation.

**Phase 6:** store picker on review, manual receipt entry, alerts search/target $, receipt store filter/delete, same-as-last reason copy, Prices→Alerts links, eval fixture image placeholder.

**Phase 7:** safe receipt delete, auto-rematch on store change, budgets/delivered discoverability, dashboard insight dismiss + deep links, seed rollups/insights, public index polish, household wipe confirm, shell a11y.

**Phase 8:** Docker/Railway deploy pack (`DEPLOY.md`, `docker-compose.prod.yml`), env validation + health ready probe, GitHub CI, logout session revoke, toast/loading polish, public staples/prices on `/island`, eval fixture template.

**Phase 9:** multi-store mock eval corpus, extraction usage in Settings, rate limits, request-id logs, outbox offline/error polish + shell flush, broader insight evidence charts.

**Phase 10:** Helmet/body limit, owner-only rollup, Redis rate limits, orphan upload cleanup, job tests + schedule docs, PWA runtime cache + outbox badge, budgets/dashboard CTAs.

**Phase 11:** email digest/alert prefs, reference seed (`db:seed:reference`), nginx CSP + backup runbook, Node healthcheck, Prices island premium, toast polish, eval corpus status + refund fixture.

**Phase 12:** alert pause/resume, HTML emails, Insights dismissed filter, `SEED_ON_BOOT` + lean image, change password, PWA PNGs, lazy routes, §13 fixture scaffold.

**Phase 13:** insight restore, password change revokes all sessions, budget week/month windows + duplicate guard, validated `SEED_ON_BOOT` + rollback docs, alert PATCH + a11y/safe-area polish.

**Phase 14:** receipts search + load more, dashboard pace/loading, review bulk toasts, single-flight refresh + logout-all, clearer API errors, public index region privacy gate.

**Phase 15:** invite accept verifies existing passwords, inviteUrl copy in Settings, outbox retries stuck uploads + Capture discard, shell sync toasts.

**Phase 16:** habits cadence + store mix/recurring on Home, spend Category/Store/Month toggle, analytics helpers tests + query validation.

**Phase 17:** rematch clears stale auto-matches + review toasts, Login/Capture a11y, Capture file reset, ESLint + CI lint step.

**Phase 18:** household rename/leave/remove, invite rate limits, accept returns tokens, empty vacated-household cleanup, owner-gated wipe.

**Phase 19:** ownership transfer (`POST /household/transfer` + Settings Make owner), change-password rate limit, 429 retryAfter in client errors.

**Phase 20:** household export/wipe/transfer rate limits, wipe session revoke, refresh deleted-user guard, FAILED re-extract + Review retry CTA, Settings busy/error polish.

**Phase 21:** extract fail-closed, stale EXTRACTING reextract + cleanup, reextract rate limit, Review poll, Receipts list Retry.

**Phase 22:** confirm status lock + confirmed mutate lock, register/manual/insights/leave rate limits, Review read-only + Receipts in-flight poll.

**Phase 23:** in-flight mutate lock, confirm 409, confirm/delete + alerts/rename/revoke rate limits, Review delete + Budgets/Alerts error polish.

**Phase 24:** confirmed reopen/unlock, budgets/alerts/insights/rollup rate limits, Insights/Settings/Review error polish.

**Phase 25:** catalog + review-edit + auth me/logout-all rate limits; Review create toasts; Settings/Manual busy; Prices/Delivered/Index/Public error polish.

**Phase 26:** invite orphan guard + session revoke on move; logout + list/compare/delivered query bounds; Review/Receipts/Budgets/Alerts/Insights busy UX; shared outbox flush; public product-price errors.

### Production notes

- See [`DEPLOY.md`](./DEPLOY.md) for Railway/compose deploy, health probes, backup, and reference vs demo seed.
- Set `EXTRACTION_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` outside local mock mode.
- Production refuses silent mock unless `ALLOW_MOCK_EXTRACTION=true`.
- Optional: `RESEND_API_KEY` + `MAIL_FROM` for real email; otherwise mail is logged.
- Optional: `INSIGHT_NARRATION=on|auto|off` (default `auto` — uses Anthropic when a key is present).
