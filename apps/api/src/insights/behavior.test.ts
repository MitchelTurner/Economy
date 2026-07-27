import { describe, expect, it } from 'vitest';
import { analyzeBehaviorChange } from './behavior';

describe('analyzeBehaviorChange', () => {
  it('splits price vs behavior when both move', () => {
    const prior = [
      { key: 'milk', quantity: 2, unitPriceCents: 500 },
      { key: 'eggs', quantity: 1, unitPriceCents: 400 },
    ];
    // milk price up, eggs qty up
    const current = [
      { key: 'milk', quantity: 2, unitPriceCents: 600 },
      { key: 'eggs', quantity: 2, unitPriceCents: 400 },
    ];
    const result = analyzeBehaviorChange(prior, current);
    expect(result.priorSpendCents).toBe(1400);
    expect(result.currentSpendCents).toBe(2000);
    expect(result.fixedBasketCurrentCents).toBe(1600); // 2*600 + 1*400
    expect(result.deltaPriceCents).toBe(200);
    expect(result.deltaBehaviorCents).toBe(400);
  });
});
