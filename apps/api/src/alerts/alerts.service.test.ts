import { describe, expect, it } from 'vitest';

function shouldTrigger(input: {
  currentCents: number;
  max30dCents: number;
  dropPct?: number | null;
  targetCents?: number | null;
}): boolean {
  if (input.targetCents != null && input.currentCents <= input.targetCents) return true;
  if (input.dropPct != null && input.max30dCents > 0) {
    const drop = ((input.max30dCents - input.currentCents) / input.max30dCents) * 100;
    if (drop >= input.dropPct) return true;
  }
  return false;
}

describe('price-drop alert gate', () => {
  it('fires on absolute target', () => {
    expect(
      shouldTrigger({ currentCents: 499, max30dCents: 699, targetCents: 500 }),
    ).toBe(true);
  });

  it('fires on percent drop from 30-day high', () => {
    expect(
      shouldTrigger({ currentCents: 450, max30dCents: 600, dropPct: 20 }),
    ).toBe(true);
    expect(
      shouldTrigger({ currentCents: 550, max30dCents: 600, dropPct: 20 }),
    ).toBe(false);
  });
});
