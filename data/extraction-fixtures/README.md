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

**Mock path (CI default):** always scores via buffer `fixture:<id>` (even if a placeholder `image.jpg` exists). The mock provider returns a canned scenario from `apps/api/src/extraction/mock-scenarios.ts`. CI runs mock smoke (synthetic fixtures; images &lt;2KB count as placeholders, not real photos).

**Live path:** with `EXTRACTION_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, fixtures with a real `image.jpg` (≥2KB) are scored against the vision model. `npm run eval:extraction` prints corpus status: real-photo count vs mock toward SPEC §13 (~30). Start from `_template/`, photograph stores you shop, hand-label `expected.json`.

## Template + scaffold

```bash
node scripts/new-eval-fixture.mjs safeway-02   # → data/extraction-fixtures/real-safeway-02/
```

Directories starting with `_` are skipped. See `_template/notes.md` for the labeling checklist.

### Store coverage checklist (toward ~30 real)

Photograph and label across stores you shop (aim for several per chain):

- [ ] Safeway / Carrs
- [ ] Super Bear / Three Bears
- [ ] Al's Alaska Meats (or local butcher)
- [ ] Costco / warehouse
- [ ] Walmart / general merchandise
- [ ] Other island independents

Synthetic `mock-*` fixtures keep CI green; they do **not** count toward the real-photo §13 target.

## Adding real receipts

1. Photograph a receipt, preprocess to JPEG ≤1600px.
2. Place as `image.jpg`.
3. Hand-label `expected.json` from the printed ticket (do not copy model output blindly).
4. Re-run the eval with `EXTRACTION_PROVIDER=anthropic` and a real `ANTHROPIC_API_KEY`.
