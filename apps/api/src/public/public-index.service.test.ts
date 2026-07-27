import { describe, expect, it } from 'vitest';

/** Pure helpers mirroring the public aggregation gate. */
export function meetsContributorThreshold(
  distinctHouseholds: number,
  minHouseholds: number,
): boolean {
  return distinctHouseholds >= minHouseholds;
}

describe('public contributor threshold', () => {
  it('requires ≥3 households by default', () => {
    expect(meetsContributorThreshold(2, 3)).toBe(false);
    expect(meetsContributorThreshold(3, 3)).toBe(true);
  });

  it('never exposes a single-household figure at threshold 3', () => {
    expect(meetsContributorThreshold(1, 3)).toBe(false);
  });
});
