import { describe, expect, it } from 'vitest';
import { evaluatePriceSpike } from './price-spike.rule';

describe('evaluatePriceSpike', () => {
  const periodStart = new Date('2026-07-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires when current is >20% above 90-day median', () => {
    const insights = evaluatePriceSpike([
      {
        productId: 'butter',
        productName: 'Butter',
        history: [100, 100, 100, 105, 110],
        current: 140,
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('price_spike');
    expect(insights[0]!.data.pctAboveMedian as number).toBeGreaterThan(20);
    expect(insights[0]!.estimatedSavingsCents).toBe(40);
  });

  it('stays quiet under the threshold', () => {
    const insights = evaluatePriceSpike([
      {
        productId: 'butter',
        productName: 'Butter',
        history: [100, 100, 100],
        current: 110,
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(0);
  });
});
