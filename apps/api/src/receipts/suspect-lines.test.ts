import { describe, expect, it } from 'vitest';
import { rankImplausibleLines } from '../common/money';

describe('rankImplausibleLines for review highlight', () => {
  it('ranks mismatched unit×qty first', () => {
    const ranked = rankImplausibleLines([
      { lineNumber: 1, quantity: 1, unitPriceCents: 100, extendedCents: 100 },
      { lineNumber: 2, quantity: 2, unitPriceCents: 50, extendedCents: 999 },
      { lineNumber: 3, quantity: 1, unitPriceCents: 200, extendedCents: 200 },
    ]);
    expect(ranked[0]).toBe(2);
  });
});
