import { describe, expect, it } from 'vitest';
import { evaluateIslandPremium } from './island-premium.rule';

describe('evaluateIslandPremium', () => {
  const periodStart = new Date('2026-07-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires above 30% premium', () => {
    const insights = evaluateIslandPremium([
      {
        productId: 'p1',
        productName: 'Butter',
        localPricePerBaseUom: 1400,
        baselinePricePerBaseUom: 1000,
        baselineRegion: 'seattle',
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.data.premiumPct).toBe(40);
  });

  it('ignores small premiums', () => {
    expect(
      evaluateIslandPremium([
        {
          productId: 'p1',
          productName: 'Butter',
          localPricePerBaseUom: 1100,
          baselinePricePerBaseUom: 1000,
          baselineRegion: 'seattle',
          periodStart,
          periodEnd,
        },
      ]),
    ).toHaveLength(0);
  });
});
