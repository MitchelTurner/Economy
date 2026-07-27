import { describe, expect, it } from 'vitest';
import { evaluateStoreSwitch } from './store-switch.rule';

describe('evaluateStoreSwitch', () => {
  const periodStart = new Date('2026-06-01T00:00:00Z');
  const periodEnd = new Date('2026-07-01T00:00:00Z');

  function item(id: string, safeway: number, general: number) {
    return {
      productId: id,
      productName: id,
      quantity: 1,
      stores: [
        { storeId: 'safeway', storeName: 'Safeway', avgPricePerBaseUom: safeway },
        {
          storeId: 'ags',
          storeName: 'Alaska General Store',
          avgPricePerBaseUom: general,
        },
      ],
    };
  }

  it('fires when one store is >8% cheaper on ≥5 shared items', () => {
    const basket = [
      item('a', 100, 80),
      item('b', 100, 80),
      item('c', 100, 80),
      item('d', 100, 80),
      item('e', 100, 80),
    ];
    const insights = evaluateStoreSwitch({ basket, periodStart, periodEnd });
    expect(insights).toHaveLength(1);
    expect(insights[0]!.estimatedSavingsCents).toBe(100);
    expect(insights[0]!.body).toContain('Alaska General Store');
  });

  it('requires at least 5 overlapping items', () => {
    const basket = [item('a', 100, 80), item('b', 100, 80)];
    expect(evaluateStoreSwitch({ basket, periodStart, periodEnd })).toHaveLength(0);
  });
});
