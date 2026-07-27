import { describe, expect, it } from 'vitest';
import { pricePerBaseUom } from '../common/normalize';

describe('Phase 1 per-unit normalization across package sizes', () => {
  const OZ_TO_KG = 0.0283495;

  it('makes 12oz/$5.99 more expensive per kg than 18oz/$7.99', () => {
    const twelve = pricePerBaseUom(599, 12, OZ_TO_KG);
    const eighteen = pricePerBaseUom(799, 18, OZ_TO_KG);
    expect(twelve).not.toBeNull();
    expect(eighteen).not.toBeNull();
    expect(twelve!).toBeGreaterThan(eighteen!);
  });

  it('keeps peanut butter 16oz vs 18oz comparable on kg', () => {
    // $4.49 / 16oz vs $4.99 / 18oz — returns cents per kg
    const a = pricePerBaseUom(449, 16, OZ_TO_KG)!;
    const b = pricePerBaseUom(499, 18, OZ_TO_KG)!;
    // 16oz jar is slightly more per kg
    expect(a).toBeGreaterThan(b);
    // Plausible grocery band: roughly $8–12 / kg → 800–1200 cents/kg
    expect(a).toBeGreaterThan(800);
    expect(b).toBeLessThan(1200);
  });
});
