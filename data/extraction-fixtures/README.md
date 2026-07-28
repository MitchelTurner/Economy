# Extraction eval fixtures (SPEC §13)

Each fixture is a directory:

```
data/extraction-fixtures/<id>/
  expected.json     # hand-labeled ExtractionResult (cents, rawText verbatim)
  image.jpg         # optional photo; if omitted, the mock provider is scored
  notes.md          # optional labeling notes
```

## Scoring

```bash
npm run eval:extraction -w @island-ledger/api
```

Reports per-fixture **line precision / recall** and **total accuracy** (±2¢).
Use this whenever you change the extraction prompt or model.

**Mock path (CI default):** fixtures without `image.*` use buffer `fixture:<id>`. The mock provider returns a canned scenario from `apps/api/src/extraction/mock-scenarios.ts` keyed by that id. CI always runs mock smoke.

**Live path:** with `EXTRACTION_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, fixtures that include `image.jpg` are scored against the vision model.

## Template

Copy `_template/` to a new id (directories starting with `_` are skipped by the harness).
See `_template/notes.md` for the labeling checklist. Target corpus (SPEC §13): ~30 real receipts. Synthetic mock scenarios seed CI coverage across stores/edge cases.

## Adding real receipts

1. Photograph a receipt, preprocess to JPEG ≤1600px.
2. Place as `image.jpg`.
3. Hand-label `expected.json` from the printed ticket (do not copy model output blindly).
4. Re-run the eval with `EXTRACTION_PROVIDER=anthropic` and a real `ANTHROPIC_API_KEY`.
