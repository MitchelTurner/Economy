import { describe, expect, it } from 'vitest';
import { evaluateImpulsePattern } from './impulse-pattern.rule';

describe('evaluateImpulsePattern', () => {
  const periodStart = new Date('2026-05-01T00:00:00Z');
  const periodEnd = new Date('2026-07-31T23:59:59Z');

  it('flags evening baskets that run ≥25% larger', () => {
    const trips = [
      ...[10, 11, 12, 14].map((h, i) => ({
        purchasedAt: new Date(Date.UTC(2026, 5, i + 1, h)),
        basketCents: 4000,
        lineCount: 8,
      })),
      ...[18, 19, 20, 21].map((h, i) => ({
        purchasedAt: new Date(Date.UTC(2026, 5, i + 10, h)),
        basketCents: 6000,
        lineCount: 14,
      })),
    ];
    const insights = evaluateImpulsePattern(trips, periodStart, periodEnd);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.estimatedSavingsCents).toBe(2000);
  });
});
