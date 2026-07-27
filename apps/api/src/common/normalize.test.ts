import { describe, expect, it } from 'vitest';
import { normalizeRawText, pricePerBaseUom } from './normalize';

describe('normalizeRawText', () => {
  it('uppercases, strips punctuation, expands abbreviations', () => {
    expect(normalizeRawText('GV MLK WHL 1GA')).toBe('GREAT VALUE MILK WHOLE 1 GALLON');
    expect(normalizeRawText('  org. peanut-butter 16oz ')).toBe('ORGANIC PEANUT BUTTER 16 OUNCE');
  });

  it('collapses whitespace', () => {
    expect(normalizeRawText('MILK   WHL')).toBe('MILK WHOLE');
  });
});

describe('pricePerBaseUom', () => {
  it('normalizes across package sizes', () => {
    // 12 oz jar at $5.99 → cents/kg using oz→kg factor 0.0283495
    const twelve = pricePerBaseUom(599, 12, 0.0283495);
    const eighteen = pricePerBaseUom(799, 18, 0.0283495);
    expect(twelve).not.toBeNull();
    expect(eighteen).not.toBeNull();
    // 12oz/$5.99 is more expensive per kg than 18oz/$7.99
    expect(twelve!).toBeGreaterThan(eighteen!);
  });

  it('returns null when size data missing', () => {
    expect(pricePerBaseUom(100, null, 1)).toBeNull();
    expect(pricePerBaseUom(100, 1, 0)).toBeNull();
  });
});
