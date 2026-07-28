# Island Ledger — Build Spec

_Receipt scanning, island cost-of-goods tracking, and spending insights. Written to be dropped into a repo as `SPEC.md` and worked through with Cursor._

---

## 1. Problem

Groceries and household goods on an island cost more than the mainland, prices move unpredictably with barge schedules and season, and the same item can differ meaningfully between stores. Households have no visibility into any of it — the receipt goes in the trash and the data dies with it.

This app turns a photo of a receipt into structured, queryable data: what was bought, where, for how much, per unit. From that it builds a per-item price history, a local cost-of-goods index, spending habits by category, and concrete suggestions.

## 2. Product summary

**Core loop:** photograph receipt → automatic extraction → user confirms/corrects → data persists → insights accumulate.

**Three value layers, in build order:**

1. **Bookkeeping** — where does the money go, by category and store.
2. **Price intelligence** — per-unit price history for a canonical item, across stores and over time. "Milk is $2.40/gal more than in March" and "this store is 14% cheaper on staples."
3. **Advice** — rules-driven and LLM-narrated suggestions: switch stores for this category, stock up now, this recurring charge doubled, this budget is off-pace.

**Non-goals for v1:** bank/card sync, tax prep, receipt storage for warranty purposes, multi-currency, investments.

## 3. Stack

| Layer | Choice |
|---|---|
| Backend | NestJS (modular, one module per domain below) |
| ORM/DB | Prisma + PostgreSQL |
| Queue | BullMQ on Redis — all extraction and analytics run out-of-band |
| Frontend | React + Vite + Tailwind, mobile-first PWA (camera capture is the primary entry point) |
| Object storage | S3-compatible bucket (R2 or Railway volume for dev) for receipt images |
| Extraction | Vision LLM with structured JSON output (see §6) |
| Hosting | Railway |
| Auth | Email + password w/ argon2, JWT access + refresh; sessions in Redis |

## 4. Domain model

Money is stored as **integer cents** (`Int`) everywhere. Per-unit prices, which need fractions, use `Decimal(12, 4)`. Never `Float`.

```prisma
// ---------- identity ----------

model Household {
  id        String   @id @default(cuid())
  name      String
  users     User[]
  receipts  Receipt[]
  budgets   Budget[]
  createdAt DateTime @default(now())
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  displayName  String?
  householdId  String
  household    Household @relation(fields: [householdId], references: [id])
  receipts     Receipt[]
  insights     Insight[]
  createdAt    DateTime  @default(now())
}

// ---------- places ----------

model Store {
  id          String   @id @default(cuid())
  name        String
  chain       String?
  address     String?
  latitude    Float?
  longitude   Float?
  region      String   // e.g. "ketchikan" — enables island vs. mainland comparison
  isOnline    Boolean  @default(false)
  receipts    Receipt[]
  prices      PriceObservation[]
  aliases     StoreAlias[]

  @@unique([name, address])
}

model StoreAlias {
  id      String @id @default(cuid())
  raw     String @unique   // normalized header text seen on receipts
  storeId String
  store   Store  @relation(fields: [storeId], references: [id])
}

// ---------- receipts ----------

enum ReceiptStatus {
  UPLOADED
  EXTRACTING
  NEEDS_REVIEW
  CONFIRMED
  FAILED
}

model Receipt {
  id            String        @id @default(cuid())
  householdId   String
  household     Household     @relation(fields: [householdId], references: [id])
  uploadedById  String
  uploadedBy    User          @relation(fields: [uploadedById], references: [id])
  storeId       String?
  store         Store?        @relation(fields: [storeId], references: [id])

  status        ReceiptStatus @default(UPLOADED)
  imageKey      String        // object storage key
  imageHash     String        // sha256 of bytes — dedupe re-uploads
  purchasedAt   DateTime?
  subtotalCents Int?
  taxCents      Int?
  totalCents    Int?
  paymentMethod String?

  rawExtraction Json?         // full model output, kept for debugging + re-processing
  extractionModel String?
  confidence    Float?
  reviewedAt    DateTime?
  failureReason String?

  lines         ReceiptLine[]
  createdAt     DateTime      @default(now())

  @@unique([householdId, imageHash])
  @@index([householdId, purchasedAt])
}

model ReceiptLine {
  id             String   @id @default(cuid())
  receiptId      String
  receipt        Receipt  @relation(fields: [receiptId], references: [id], onDelete: Cascade)

  lineNumber     Int
  rawText        String   // exactly as printed: "GV MLK WHL 1GA"
  quantity       Decimal  @db.Decimal(10, 3) @default(1)
  unitPriceCents Int?
  extendedCents  Int      // what this line actually added to the total
  discountCents  Int      @default(0)
  isTaxable      Boolean  @default(false)
  isRefund       Boolean  @default(false)

  productId      String?
  product        Product? @relation(fields: [productId], references: [id])
  matchConfidence Float?
  matchMethod    String?  // "alias" | "gtin" | "embedding" | "manual"
  categoryId     String?
  category       Category? @relation(fields: [categoryId], references: [id])

  @@index([receiptId])
  @@index([productId])
}

// ---------- canonical catalog ----------

model Category {
  id       String     @id @default(cuid())
  name     String
  slug     String     @unique
  parentId String?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  products Product[]
  lines    ReceiptLine[]
  budgets  Budget[]
}

model Product {
  id         String   @id @default(cuid())
  name       String   // "Whole milk, 1 gal"
  brand      String?
  gtin       String?  @unique
  sizeValue  Decimal? @db.Decimal(10, 3)
  sizeUom    String?  // "gal", "oz", "ct", "lb"
  baseUom    String?  // normalized for comparison: "L", "kg", "ct"
  baseFactor Decimal? @db.Decimal(12, 6) // sizeValue * baseFactor = quantity in baseUom
  isStoreBrand Boolean @default(false)
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])

  aliases    ProductAlias[]
  lines      ReceiptLine[]
  prices     PriceObservation[]
  baselines  BaselinePrice[]
}

/// The learning layer. Every confirmed manual match writes a row here,
/// so the same cryptic receipt string auto-resolves next time.
model ProductAlias {
  id         String  @id @default(cuid())
  normalized String  // uppercased, punctuation-stripped rawText
  storeId    String?
  productId  String
  product    Product @relation(fields: [productId], references: [id])
  hitCount   Int     @default(1)
  source     String  // "manual" | "seed" | "model"

  @@unique([normalized, storeId])
}

// ---------- price intelligence ----------

model PriceObservation {
  id            String   @id @default(cuid())
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  storeId       String
  store         Store    @relation(fields: [storeId], references: [id])
  observedAt    DateTime
  unitPriceCents Int
  pricePerBaseUom Decimal @db.Decimal(12, 4) // the comparable number
  isPromo       Boolean  @default(false)
  receiptLineId String?  @unique
  householdId   String   // for privacy scoping; never exposed in aggregates

  @@index([productId, storeId, observedAt])
  @@index([productId, observedAt])
}

/// Mainland/national reference price, for computing the island premium.
model BaselinePrice {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id])
  region          String   // "us-national" | "seattle" | "anchorage"
  pricePerBaseUom Decimal  @db.Decimal(12, 4)
  source          String
  effectiveOn     DateTime

  @@unique([productId, region, effectiveOn])
}

/// Nightly rollup: fixed-basket cost index per store and region.
model PriceIndexPoint {
  id            String   @id @default(cuid())
  basketSlug    String   // "staples-25"
  storeId       String?
  region        String
  periodStart   DateTime
  indexValue    Decimal  @db.Decimal(10, 4)
  basketCostCents Int
  coverage      Float    // fraction of basket items with fresh observations

  @@unique([basketSlug, storeId, region, periodStart])
}

// ---------- budgeting + advice ----------

enum BudgetPeriod { WEEKLY MONTHLY }

model Budget {
  id          String       @id @default(cuid())
  householdId String
  household   Household    @relation(fields: [householdId], references: [id])
  categoryId  String?
  category    Category?    @relation(fields: [categoryId], references: [id])
  period      BudgetPeriod @default(MONTHLY)
  amountCents Int
  startsOn    DateTime
  endsOn      DateTime?
}

enum InsightSeverity { INFO OPPORTUNITY WARNING }

model Insight {
  id          String          @id @default(cuid())
  householdId String
  userId      String?
  user        User?           @relation(fields: [userId], references: [id])
  type        String          // "store_switch" | "price_spike" | "stock_up" | ...
  severity    InsightSeverity @default(INFO)
  title       String
  body        String
  estimatedSavingsCents Int?
  data        Json            // structured evidence used to render charts
  periodStart DateTime
  periodEnd   DateTime
  dedupeKey   String
  dismissedAt DateTime?
  createdAt   DateTime        @default(now())

  @@unique([householdId, dedupeKey, periodStart])
  @@index([householdId, createdAt])
}
```

## 5. Backend modules (NestJS)

One module per bounded concern; each owns its own service, controller, and queue processors.

- `auth` — register, login, refresh, household invite
- `receipts` — upload, list, get, confirm, delete; enqueues extraction
- `extraction` — vision-model client, prompt, schema validation, retry, cost accounting
- `catalog` — products, categories, alias resolution, match candidate search
- `prices` — price observations, per-item history, store comparison, index rollups
- `budgets`
- `insights` — rule engine + narration
- `analytics` — spending by category/store/period, habit metrics
- `jobs` — BullMQ registration and schedulers

### API surface

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh

POST   /receipts/upload-url          -> { uploadUrl, imageKey }   (presigned PUT)
POST   /receipts                     -> { receiptId }             (register uploaded key)
GET    /receipts?from=&to=&storeId=&status=&cursor=
GET    /receipts/:id                 -> receipt + lines + match candidates
PATCH  /receipts/:id                 -> edit header fields
PATCH  /receipts/:id/lines/:lineId   -> correct qty/price/product/category
POST   /receipts/:id/confirm         -> validates totals, writes PriceObservations
DELETE /receipts/:id

GET    /catalog/products?q=
POST   /catalog/products             -> create canonical product
POST   /catalog/aliases              -> bind rawText -> product

GET    /prices/product/:id/history?storeId=&from=&to=
GET    /prices/compare?productIds=   -> per-store current price matrix
GET    /prices/index?basket=staples-25&region=ketchikan
GET    /prices/premium/:productId    -> local vs. baseline delta

GET    /analytics/spend?groupBy=category|store|month&from=&to=
GET    /analytics/habits             -> cadence, basket size, store mix, recurring items

GET    /budgets  POST /budgets  PATCH /budgets/:id
GET    /insights?active=true
POST   /insights/:id/dismiss
```

### Background jobs

| Queue | Trigger | Work |
|---|---|---|
| `receipt.extract` | on upload | call vision model, validate JSON, create lines, set `NEEDS_REVIEW` |
| `receipt.match` | after extract, after confirm | resolve each line to a Product via alias → GTIN → fuzzy/embedding → null |
| `price.observe` | on confirm | write `PriceObservation` rows, compute `pricePerBaseUom` |
| `price.index` | nightly cron | recompute `PriceIndexPoint` for each basket/store/region |
| `insights.generate` | weekly cron + on confirm (debounced) | run rule set, upsert by `dedupeKey` |
| `receipt.cleanup` | daily | purge failed uploads with no receipt row |

## 6. Extraction pipeline

Do **not** use classic OCR (Tesseract) as the primary path. Crumpled thermal receipts wreck it. Send the image to a vision model and ask for structured JSON directly; treat OCR as an optional fallback.

**Client-side pre-processing before upload:** downscale longest edge to 1600px, convert HEIC→JPEG, quality 0.8, strip EXIF GPS. This cuts token cost and upload time substantially.

**Prompt contract** — model returns only JSON matching this shape, validated with zod on receipt:

```ts
{
  store: { name: string | null, address: string | null },
  purchasedAt: string | null,        // ISO 8601
  paymentMethod: string | null,
  currency: "USD",
  subtotalCents: number | null,
  taxCents: number | null,
  totalCents: number | null,
  lines: Array<{
    lineNumber: number,
    rawText: string,                 // verbatim, do not clean
    quantity: number,
    unitPriceCents: number | null,
    extendedCents: number,
    discountCents: number,
    isTaxable: boolean,
    isRefund: boolean,
    guessedCategory: string | null
  }>,
  confidence: number                 // 0..1, model's own assessment
}
```

**Validation gate before `NEEDS_REVIEW`:**
- `sum(extendedCents) - sum(discountCents) + taxCents` must equal `totalCents` within ±2 cents. If not, flag the receipt and highlight lines whose parsed price is furthest from a plausible value.
- Retry once with a "your previous output failed arithmetic check" follow-up before giving up.
- On repeated failure → `FAILED` with reason; user can still enter the receipt manually.

**Human-in-the-loop is a feature, not a fallback.** The review screen is where alias learning happens. Every correction the user makes writes a `ProductAlias`, which is what makes the second month of use dramatically less work than the first.

**Cost control:** hash the image and dedupe; cap per-household extractions per day; log token usage per receipt so unit economics are visible from day one.

## 7. Product normalization

This is the hard part and the actual moat. Resolution order for each line's `rawText`:

1. **Exact alias hit** on `(normalized, storeId)` → confidence 1.0, done.
2. **Store-agnostic alias hit** on `(normalized, null)` → 0.9.
3. **GTIN** if the receipt printed one → 1.0.
4. **Fuzzy/vector match** — trigram similarity (`pg_trgm`) over product names + aliases; take the top candidate if score > threshold, else return top 5 as *suggestions* and leave `productId` null.
5. **Unmatched** — line still counts toward spend and category totals, just not toward price history.

Normalization function: uppercase, strip punctuation, collapse whitespace, expand a small abbreviation dictionary (`WHL`→`WHOLE`, `MLK`→`MILK`, `GA`/`GAL`→`GALLON`, `LB`, `OZ`, `CT`, `PK`). Keep the dictionary in a seed file so it's editable without a deploy.

Unit normalization matters more than it looks: comparing "$5.99" across a 12oz and an 18oz jar is meaningless. Every matched line computes `pricePerBaseUom` and every comparison in the app uses that number.

## 8. Insight rules

Each rule is a class implementing `evaluate(ctx): Insight[]`. Deterministic detection, LLM only for phrasing the copy. Never let the model invent a number — it receives the computed figures and writes the sentence around them.

Ship these:

| Rule | Fires when | Output |
|---|---|---|
| `store_switch` | Same basket of ≥5 matched items available at 2+ stores, one is >8% cheaper over the last 60 days | "Buying your regular staples at X would have saved ~$Y last month" |
| `price_spike` | An item's current price is >20% above its trailing 90-day median | "Butter is up 27% since May" |
| `stock_up` | Current price is in the bottom decile of its own history and the item is bought regularly | "Coffee is at its lowest price since January" |
| `island_premium` | Matched item has a `BaselinePrice` and local exceeds it by >30% | Flags candidates for bulk/mainland ordering |
| `budget_pace` | Spend-to-date projects over budget for the period | "On pace for $X against a $Y grocery budget" |
| `category_creep` | Category spend up >15% for 2 consecutive months, controlling for the index | Distinguishes "prices rose" from "you bought more" |
| `recurring_change` | A recurring charge's amount changed | Subscription/utility drift |
| `impulse_pattern` | Basket size correlates with time-of-day or trip frequency | Habit-level nudge |

Every insight carries `estimatedSavingsCents` where it can be computed honestly, and `data` with the evidence so the UI can render a chart under the sentence. Dedupe by `dedupeKey` so the same suggestion doesn't nag weekly.

**Separating price inflation from behavior change is the single most valuable analytic here.** Compute both: `Δspend_total` and `Δspend` holding quantities fixed at the prior period's basket. The gap is behavior.

## 9. Frontend

Mobile-first PWA. Camera capture must be reachable in one tap from the home screen.

```
/                      Dashboard — month spend, budget pace, top 3 insights, index tile
/capture               Camera + multi-shot queue, offline-tolerant (IndexedDB outbox)
/receipts              List, filter by store/date/status
/receipts/:id          Review & confirm — the core screen (see below)
/prices                Item search → price history chart, store comparison
/prices/index          Cost-of-goods index over time, by store
/insights              Full feed, dismissible
/budgets               Set and track
/settings              Household, members, export, data deletion
```

**Review screen requirements** — this screen determines whether the product is usable:
- Receipt image pinned on one side (zoomable), parsed lines on the other; tapping a line highlights nothing on the image unless you have bounding boxes, so instead keep line order faithful to print order.
- Inline edit of qty / price / product / category without leaving the row.
- Unmatched lines float to the top with suggested product chips; one tap binds and creates the alias.
- Running total with a live diff against the printed total; confirm is blocked until it reconciles or the user explicitly overrides.
- Bulk actions: "apply category to all similar", "same as last time at this store".

Charts: Recharts. Currency formatting centralized in one helper; cents never rendered raw.

## 10. Privacy

If a community/public price index is ever built on top of this, the shared unit is **(product, store, date, unit price)** and nothing else. Basket composition, totals, and receipt images never leave the household scope. Enforce it at the query layer, not just the API — `PriceObservation.householdId` exists so aggregates can require a `GROUP BY` with a minimum-contributor threshold (≥3 distinct households) before any figure is exposed publicly.

Also: user-triggered full export (JSON + CSV) and hard delete, including object storage keys.

## 11. Build phases

**Phase 0 — skeleton (get one receipt end-to-end)**
Auth, household, presigned upload, extraction job, review screen, confirm, receipt list, spend-by-category. No matching, no products. A receipt line is just text and a number.

**Phase 1 — catalog & prices**
Product/alias models, matching pipeline, review-screen binding UI, price history charts, store comparison.

**Phase 2 — intelligence**
Budgets, index rollups, baseline prices, rule engine, insight feed, weekly digest.

**Phase 3 — reach**
Public/anonymized island index page, price-drop alerts, delivered-cost comparison for bulk mainland ordering, multi-user household sharing.

**Phase 4 — production hardening**
Anthropic extraction as the non-dev path (mock still default locally), extraction eval harness + fixtures, upload→confirm integration test, optional LLM insight narration (numbers locked), email delivery for digests/alerts/invites, real IndexedDB capture outbox with online replay, budgets UI parity (category/period/edit/delete).

**Phase 5 — review & household polish**
Zoomable receipt image on review, header edits + suspect-line highlighting + add/delete lines, HEIC→JPEG capture, dashboard (index Δ, habits, review queue), receipt status/date filters, PWA app-shell caching, invite peek/revoke and move-household confirmation.

**Phase 6 — core-loop finish**
Store picker/create on review, manual receipt entry UI, FAILED extractions store binding, same-as-last reason copy, alerts product search + target $, receipt store filter/delete/empty CTAs, Prices→Alerts deep link, placeholder eval fixture image.

**Phase 7 — v1 shell finish**
Safe receipt delete (clear linked observations), auto-rematch on store change, budgets/delivered discoverability, dashboard insight dismiss + deep links, seed index rollups + demo insights, public index/login polish, type-to-confirm household wipe, a11y pass on shell/nav.

**Phase 8 — ship readiness**
Dockerfiles + compose/Railway deploy pack, boot-time env validation, `/health` + `/health/ready`, GitHub CI, logout revokes Redis refresh sessions, toast/loading polish, public staples + product prices on `/island`, eval fixture template scaffolding.

**Phase 9 — eval corpus, ops hardening, offline edges**
Expanded mock eval fixtures across stores/edge cases, household extraction usage visibility, auth/upload/public rate limits, request-id logging, capture outbox single-flight + shell online flush, richer insight evidence charts.

**Phase 10 — production polish / scheduled jobs / remaining SPEC**
Helmet + JSON body limit, owner-only index rollup, Redis-backed rate limits, orphan upload cleanup per SPEC §5, job processor tests + schedule docs, PWA runtime caching + outbox badge, budgets/dashboard empty CTAs, eval mock harness ignores placeholder JPEGs.

**Phase 11 — ops harden + notification prefs + remaining SPEC polish**
Per-user email digest/alert prefs, reference-only seed path, nginx CSP headers + backup/migrate runbook, compose health via Node fetch, island premium on Prices, toast polish on mutating flows, eval corpus status (real vs mock) + refund fixture.

**Phase 12 — production v1 closeout**
Alert pause/resume, branded HTML emails + invite URL-only responses, Insights dismissed filter, `SEED_ON_BOOT` + lean API image, change password + display name, PWA PNG icons, lazy routes, review confirm toasts, §13 fixture scaffold script + store checklist.

## 12. Acceptance criteria

Phase 0 is done when:
- A photo taken on a phone becomes a `CONFIRMED` receipt with correct total in under 60 seconds of user time.
- Arithmetic validation catches an intentionally corrupted extraction.
- Re-uploading the same image returns the existing receipt rather than creating a duplicate.
- Spend-by-category for a month matches hand-tallied receipts exactly.

Phase 3 is done when:
- Every insight's stated dollar figure can be reproduced from a SQL query against the stored data.
- No insight repeats within its dedupe window.

Phase 4 is done when:
- Mock extraction still scores ≥0.9 line P/R on the committed synthetic fixture via `npm run eval:extraction`.
- Upload → mock extract → confirm integration test passes against a real DB.
- Narration (when enabled) never drops dollar/percent tokens from rule-generated copy.
- Digests, price alerts, and invites go through `NotificationsService` (Resend or structured log).
- Capture queues images in IndexedDB and flushes when online; multi-shot does not abandon remaining files.
- Budgets UI can create category/weekly budgets and edit/delete amounts.

Phase 5 is done when:
- Review shows the receipt image with zoom; header fields (date/tax/total/payment) are editable.
- Suspect lines from arithmetic ranking are visually flagged; lines can be added or deleted before confirm.
- HEIC uploads convert (or fail with a clear message) before preprocess.
- Dashboard surfaces live index Δ, habits summary, and a needs-review queue link.
- Pending invites can be revoked; accepting while already in another household requires explicit confirmation.

Phase 6 is done when:
- Review can select or create a store; FAILED extractions receipts still get a storeId when the model returned one.
- Users can create a receipt via `/capture/manual` without a photo and land on review.
- Same-as-last returns actionable reasons (`no_store` / `no_prior` / `none_matched`).
- Alerts support product search + optional target price; receipts list supports store filter and delete.

Phase 7 is done when:
- Deleting a confirmed receipt also removes its linked price observations (no FK failure).
- Changing store on review auto-rematches and reports matched-count delta.
- Dashboard can dismiss insights and deep-link by type; budgets and delivered cost are one tap from home.
- Seed writes index rollups and demo insights so `/prices/index`, `/island`, and Home insights render after `db:seed`.

Phase 8 is done when:
- Production boot fails fast without `CORS_ORIGIN` and strong distinct JWT secrets; `/health/ready` probes DB + Redis.
- `docker-compose.prod.yml` + `DEPLOY.md` document API/web/Postgres/Redis/S3 deploy (Railway sketch).
- CI runs generate → test → build → `eval:extraction` smoke on PRs.
- Logout calls `POST /auth/logout` and clears the Redis refresh session; `/island` can list staples and gated public product prices.
- Eval fixture `_template/` exists for expanding the §13 corpus (not the full 30-receipt set yet).

Phase 9 is done when:
- `npm run eval:extraction` scores ≥8 mock fixtures (multi-store / tax / discount / weighable) via `fixture:<id>` scenarios.
- Settings shows today’s extraction count vs `MAX_EXTRACTIONS_PER_DAY` and 7-day token totals; daily-cap path is unit-tested.
- Auth login/register/refresh, upload-url, and public reads enforce configurable rate limits; API logs include `x-request-id`.
- Capture outbox distinguishes network vs API failures, surfaces FAILED/timeout reasons, and flushes from the shell on `online`.
- Insight evidence charts cover store_switch, budget_pace, category_creep, island_premium, and impulse_pattern when data allows.

Phase 10 is done when:
- API uses Helmet + explicit JSON body limit; `POST /prices/index/rollup` is owner-only.
- Rate limits share counters via Redis when available (memory fallback for tests/offline Redis).
- Daily `receipt.cleanup` deletes S3/memory keys under `receipts/` with no `Receipt.imageKey` row (not aged FAILED receipts).
- Nightly index + weekly digest fan-out processors are unit-tested; schedules documented in `DEPLOY.md`.
- PWA caches shell/static with NetworkOnly for `/api`; shell shows pending outbox count with Capture link.
- Budgets empty state and dashboard FAILED queue deep-link to capture/manual; eval mock path uses `fixture:<id>` even when placeholder `image.jpg` exists.

Phase 11 is done when:
- `User.emailDigest` / `User.emailAlerts` default true; Settings toggles via `PATCH /auth/me`; digests and price-alert emails honor them.
- `npm run db:seed:reference` (`SEED_DEMO=0`) upserts catalog/baselines/lanes without a demo household; `DEPLOY.md` covers backup/migrate + when to seed.
- Web nginx ships CSP / nosniff / referrer / frame headers; compose API healthcheck uses Node `fetch` (no wget).
- Prices product detail shows island premium vs baseline when data exists; Budgets/Alerts/Insights/Settings emit toasts on mutate success/failure.
- `eval:extraction` reports real-photo vs mock counts toward §13 (~30); refund synthetic fixture passes CI.

Phase 12 is done when:
- Alerts support Pause/Resume via `PATCH /alerts/:id` (`active`); check still skips paused alerts.
- Invite/digest/alert emails include branded HTML CTAs; invite API returns `inviteUrl` without raw `token`.
- Insights UI toggles Active vs Dismissed (`active=false` → dismissed only).
- API Docker entrypoint supports `SEED_ON_BOOT=reference|demo|off` with a lean `omit=dev` image; Settings can change password and display name.
- PWA ships 192/512 PNG icons; secondary routes are lazy-loaded; receipt confirm shows toasts; `npm run fixture:new` scaffolds §13 fixtures + store checklist (real photos still operator-owned).

## 13. Testing

- **Extraction eval set**: photograph 30 real receipts across every store you shop, hand-label the expected JSON, commit as fixtures. Score line-level precision/recall and total accuracy on every prompt change. Without this you are guessing whether a prompt tweak helped.
- Unit tests: money math, unit normalization, alias normalization, each insight rule against fixture datasets.
- Integration: full upload→confirm flow against a test DB with a mocked extraction response.
- Seed script: a household with 6 months of synthetic receipts so analytics screens have something to render in dev.

## 14. Environment

```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
ANTHROPIC_API_KEY=
EXTRACTION_MODEL=
MAX_EXTRACTIONS_PER_DAY=50
```

## 15. Working this with Cursor

Put this file at repo root as `SPEC.md`, and add `.cursor/rules/project.md` containing:

- Stack and conventions (NestJS module structure, Prisma, no `Float` for money, cents everywhere, zod for all external input).
- "Consult `SPEC.md` §4 before changing the schema; schema changes require a migration in the same commit."
- File layout map so it stops inventing directories.

Then drive it in this order, one prompt per step, committing between:

1. `prisma/schema.prisma` from §4, plus initial migration and seed (categories, abbreviation dictionary, a starter basket).
2. Auth module + household scoping guard. Every subsequent query is household-scoped — establish that guard early or retrofitting it is miserable.
3. Receipts module: upload URL, register, list, get. No extraction yet — a manual-entry endpoint proves the model works.
4. Extraction module with the §6 schema, a mocked provider, and the arithmetic validator. Only then wire the real model.
5. Review UI. Spend real time here; it's the screen the product lives or dies on.
6. Catalog + matching, then price observations on confirm.
7. Analytics endpoints, then charts.
8. Insight rules one at a time, each with a fixture test written before the rule.

Ask Cursor for the *test* first on anything involving money math or rule thresholds. Those are the places where a plausible-looking wrong answer is expensive and invisible.
