import { describe, expect, it } from 'vitest';
import { evaluateStockUp } from './stock-up.rule';

describe('evaluateStockUp', () => {
  const periodStart = new Date('2026-01-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires for regular items in the bottom decile', () => {
    const history = [200, 190, 180, 170, 160, 150, 140, 130, 120, 110];
    const insights = evaluateStockUp([
      {
        productId: 'coffee',
        productName: 'Coffee',
        history,
        current: 110,
        purchaseCount90d: 4,
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('stock_up');
    expect(insights[0]!.severity).toBe('OPPORTUNITY');
  });

  it('requires regular purchases', () => {
    const insights = evaluateStockUp([
      {
        productId: 'coffee',
        productName: 'Coffee',
        history: [200, 190, 180, 170, 110],
        current: 110,
        purchaseCount90d: 1,
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(0);
  });
});
