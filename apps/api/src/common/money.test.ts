import { describe, expect, it } from 'vitest';
import {
  dollarsToCents,
  receiptArithmeticOk,
  rankImplausibleLines,
  sumCents,
} from './money';

describe('money', () => {
  it('converts dollars to cents without float drift for common prices', () => {
    expect(dollarsToCents(2.4)).toBe(240);
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
  });

  it('sums cents exactly', () => {
    expect(sumCents([100, 250, -50])).toBe(300);
  });
});

describe('receiptArithmeticOk', () => {
  it('accepts totals within ±2 cents', () => {
    const result = receiptArithmeticOk({
      lines: [
        { extendedCents: 399, discountCents: 0 },
        { extendedCents: 250, discountCents: 50 },
      ],
      taxCents: 40,
      totalCents: 639,
    });
    expect(result.ok).toBe(true);
    expect(result.computedTotalCents).toBe(639);
    expect(result.deltaCents).toBe(0);
  });

  it('flags intentionally corrupted extraction', () => {
    const result = receiptArithmeticOk({
      lines: [
        { extendedCents: 500, discountCents: 0 },
        { extendedCents: 300, discountCents: 0 },
      ],
      taxCents: 50,
      totalCents: 999,
    });
    expect(result.ok).toBe(false);
    expect(result.computedTotalCents).toBe(850);
    expect(result.deltaCents).toBe(-149);
  });

  it('treats missing tax as zero', () => {
    const result = receiptArithmeticOk({
      lines: [{ extendedCents: 1000, discountCents: 0 }],
      taxCents: null,
      totalCents: 1000,
    });
    expect(result.ok).toBe(true);
  });
});

describe('rankImplausibleLines', () => {
  it('surfaces lines whose extended price diverges most from qty × unit', () => {
    const ranked = rankImplausibleLines([
      { lineNumber: 1, quantity: 1, unitPriceCents: 100, extendedCents: 100 },
      { lineNumber: 2, quantity: 2, unitPriceCents: 200, extendedCents: 900 },
      { lineNumber: 3, quantity: 1, unitPriceCents: 50, extendedCents: 60 },
    ]);
    expect(ranked[0]).toBe(2);
  });
});
