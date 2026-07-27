import { ExtractionResult } from './extraction.schema';

export type LineScore = {
  expectedLineNumber: number;
  matched: boolean;
  rawTextOk: boolean;
  extendedOk: boolean;
};

export type EvalScore = {
  linePrecision: number;
  lineRecall: number;
  totalAccuracy: boolean;
  storeNameOk: boolean;
  lines: LineScore[];
};

function norm(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Score a model extraction against a hand-labeled expected JSON (SPEC §13).
 * Line match: normalized rawText equality OR same lineNumber with extendedCents within 2¢.
 */
export function scoreExtraction(
  expected: ExtractionResult,
  actual: ExtractionResult,
): EvalScore {
  const lines: LineScore[] = [];
  let truePositives = 0;

  for (const exp of expected.lines) {
    const hit = actual.lines.find(
      (a) =>
        norm(a.rawText) === norm(exp.rawText) ||
        (a.lineNumber === exp.lineNumber &&
          Math.abs(a.extendedCents - exp.extendedCents) <= 2),
    );
    const rawTextOk = hit ? norm(hit.rawText) === norm(exp.rawText) : false;
    const extendedOk = hit
      ? Math.abs(hit.extendedCents - exp.extendedCents) <= 2
      : false;
    const matched = Boolean(hit && (rawTextOk || extendedOk));
    if (matched) truePositives += 1;
    lines.push({
      expectedLineNumber: exp.lineNumber,
      matched,
      rawTextOk,
      extendedOk,
    });
  }

  const lineRecall = expected.lines.length
    ? truePositives / expected.lines.length
    : 1;
  const linePrecision = actual.lines.length
    ? truePositives / actual.lines.length
    : 0;

  const totalAccuracy =
    expected.totalCents != null &&
    actual.totalCents != null &&
    Math.abs(expected.totalCents - actual.totalCents) <= 2;

  const storeNameOk =
    !expected.store.name ||
    (!!actual.store.name &&
      norm(actual.store.name).includes(norm(expected.store.name).split(' ')[0]!));

  return {
    linePrecision,
    lineRecall,
    totalAccuracy,
    storeNameOk,
    lines,
  };
}
