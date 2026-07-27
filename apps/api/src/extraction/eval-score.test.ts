import { describe, expect, it } from 'vitest';
import { ExtractionResultSchema } from './extraction.schema';
import { scoreExtraction } from './eval-score';

const base = ExtractionResultSchema.parse({
  store: { name: 'Safeway', address: '2417 Tongass Ave' },
  purchasedAt: '2026-07-15T18:00:00.000Z',
  paymentMethod: 'VISA',
  currency: 'USD',
  subtotalCents: 1147,
  taxCents: 0,
  totalCents: 1147,
  confidence: 0.9,
  lines: [
    {
      lineNumber: 1,
      rawText: 'GV MLK WHL 1GA',
      quantity: 1,
      unitPriceCents: 549,
      extendedCents: 549,
      discountCents: 0,
      isTaxable: false,
      isRefund: false,
      guessedCategory: 'dairy',
    },
    {
      lineNumber: 2,
      rawText: 'BANANAS',
      quantity: 2.14,
      unitPriceCents: 79,
      extendedCents: 169,
      discountCents: 0,
      isTaxable: false,
      isRefund: false,
      guessedCategory: 'produce',
    },
  ],
});

describe('scoreExtraction', () => {
  it('scores perfect match at 1.0 recall/precision', () => {
    const score = scoreExtraction(base, base);
    expect(score.linePrecision).toBe(1);
    expect(score.lineRecall).toBe(1);
    expect(score.totalAccuracy).toBe(true);
    expect(score.storeNameOk).toBe(true);
  });

  it('penalizes missing lines and wrong total', () => {
    const actual = {
      ...base,
      totalCents: 9999,
      lines: [base.lines[0]!],
    };
    const score = scoreExtraction(base, actual);
    expect(score.lineRecall).toBe(0.5);
    expect(score.totalAccuracy).toBe(false);
  });
});
