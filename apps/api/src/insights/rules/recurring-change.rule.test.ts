import { describe, expect, it } from 'vitest';
import { evaluateRecurringChange } from './recurring-change.rule';

describe('evaluateRecurringChange', () => {
  const periodStart = new Date('2026-07-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires when a recurring amount changes', () => {
    const insights = evaluateRecurringChange([
      {
        rawText: 'NETFLIX.COM',
        amountsCents: [1599, 1599, 2299],
        periodStart,
        periodEnd,
      },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.estimatedSavingsCents).toBe(700);
  });

  it('ignores tiny noise', () => {
    expect(
      evaluateRecurringChange([
        {
          rawText: 'WATER UTIL',
          amountsCents: [4500, 4510, 4520],
          periodStart,
          periodEnd,
        },
      ]),
    ).toHaveLength(0);
  });
});
