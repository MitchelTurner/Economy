import { describe, expect, it } from 'vitest';
import { evaluateBudgetPace } from './budget-pace.rule';

describe('evaluateBudgetPace', () => {
  const periodStart = new Date('2026-07-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('fires when projected spend exceeds budget', () => {
    // Halfway through month, already spent $400 of $500 → projects ~$800
    const insights = evaluateBudgetPace({
      budgetAmountCents: 50000,
      spentCents: 40000,
      periodStart,
      periodEnd,
      today: new Date('2026-07-16T00:00:00Z'),
      categoryLabel: 'Grocery',
    });
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('budget_pace');
    expect(insights[0]!.data.projectedCents).toBeGreaterThan(50000);
    expect(insights[0]!.estimatedSavingsCents).toBeGreaterThan(0);
    // Dollar figure is reproducible from spent / fractionElapsed
    const data = insights[0]!.data as {
      spentCents: number;
      fractionElapsed: number;
      projectedCents: number;
    };
    expect(data.projectedCents).toBe(Math.round(data.spentCents / data.fractionElapsed));
  });

  it('stays quiet when on pace', () => {
    const insights = evaluateBudgetPace({
      budgetAmountCents: 50000,
      spentCents: 20000,
      periodStart,
      periodEnd,
      today: new Date('2026-07-16T00:00:00Z'),
      categoryLabel: 'Grocery',
    });
    expect(insights).toHaveLength(0);
  });

  it('dedupe key is stable for the period', () => {
    const a = evaluateBudgetPace({
      budgetAmountCents: 100,
      spentCents: 100,
      periodStart,
      periodEnd,
      today: new Date('2026-07-20T00:00:00Z'),
      categoryLabel: 'Grocery',
    });
    const b = evaluateBudgetPace({
      budgetAmountCents: 100,
      spentCents: 90,
      periodStart,
      periodEnd,
      today: new Date('2026-07-25T00:00:00Z'),
      categoryLabel: 'Grocery',
    });
    expect(a[0]!.dedupeKey).toBe(b[0]!.dedupeKey);
  });
});
