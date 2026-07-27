import { describe, expect, it } from 'vitest';
import { computeDeliveredCost } from './delivered-cost';

describe('computeDeliveredCost', () => {
  it('adds flat fee and per-lb freight to mainland unit cost', () => {
    const result = computeDeliveredCost({
      mainlandUnitCents: 400,
      quantity: 6,
      weightLb: 12,
      flatFeeCents: 1500,
      perLbCents: 50,
      perKgCents: 0,
      localUnitCents: 900,
    });
    // mainland 2400 + flat 1500 + weight 600 = 4500; local 5400; save 900
    expect(result.mainlandSubtotalCents).toBe(2400);
    expect(result.shippingCents).toBe(2100);
    expect(result.deliveredTotalCents).toBe(4500);
    expect(result.localTotalCents).toBe(5400);
    expect(result.savingsVsLocalCents).toBe(900);
    expect(result.preferMainland).toBe(true);
  });

  it('prefers local when freight wipes out the mainland deal', () => {
    const result = computeDeliveredCost({
      mainlandUnitCents: 500,
      quantity: 1,
      weightLb: 20,
      flatFeeCents: 2000,
      perLbCents: 100,
      perKgCents: 0,
      localUnitCents: 600,
    });
    expect(result.preferMainland).toBe(false);
    expect(result.savingsVsLocalCents).toBeLessThan(0);
  });
});
