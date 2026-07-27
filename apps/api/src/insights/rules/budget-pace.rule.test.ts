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
    expect(insights[0].type).toBe('budget_pace');
    expect(insights[0].data.projectedCents).toBeGreaterThan(50000);
    expect(insights[0].estimatedSavingsCents).toBeGreaterThan(0);
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
});
