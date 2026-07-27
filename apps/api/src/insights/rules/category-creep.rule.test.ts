import { describe, expect, it } from 'vitest';
import { evaluateCategoryCreep } from './category-creep.rule';

describe('evaluateCategoryCreep', () => {
  const periodStart = new Date('2026-05-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires on two consecutive >15% jumps and attributes behavior vs price', () => {
    const insights = evaluateCategoryCreep([
      {
        categoryId: 'dairy',
        categoryName: 'Dairy',
        months: [
          { key: '2026-05', spendCents: 10000, fixedBasketSpendCents: 10000 },
          { key: '2026-06', spendCents: 12000, fixedBasketSpendCents: 10500 },
          { key: '2026-07', spendCents: 15000, fixedBasketSpendCents: 12500 },
        ],
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('category_creep');
    const data = insights[0]!.data as {
      deltaBehavior: number;
      deltaPrice: number;
    };
    // July total +3000; fixed basket from June levels at July prices = 12500 → price Δ = +500; behavior = 2500
    expect(data.deltaPrice).toBe(500);
    expect(data.deltaBehavior).toBe(2500);
  });

  it('stays quiet without two consecutive jumps', () => {
    expect(
      evaluateCategoryCreep([
        {
          categoryId: 'dairy',
          categoryName: 'Dairy',
          months: [
            { key: '2026-05', spendCents: 10000, fixedBasketSpendCents: 10000 },
            { key: '2026-06', spendCents: 10100, fixedBasketSpendCents: 10050 },
            { key: '2026-07', spendCents: 12000, fixedBasketSpendCents: 11000 },
          ],
          periodStart,
          periodEnd,
        },
      ]),
    ).toHaveLength(0);
  });
});
