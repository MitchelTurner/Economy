# Fixture labeling checklist

Copy this directory to `data/extraction-fixtures/<id>/` (do not keep `_template` in the eval run — the harness skips directories starting with `_`).

1. Photograph a real receipt; preprocess to JPEG ≤1600px as `image.jpg`.
2. Hand-label `expected.json` from the **printed ticket** (not from model output).
3. Money fields are **integer cents**; `quantity` may be fractional for weighables.
4. `rawText` must match the receipt line as printed (abbreviations OK).
5. Sum of line `extendedCents` (− discounts) should reconcile with `subtotalCents` / `totalCents`.
6. Run `npm run eval:extraction -w @island-ledger/api` after adding.

Target corpus (SPEC §13): ~30 receipts across every store you shop.
