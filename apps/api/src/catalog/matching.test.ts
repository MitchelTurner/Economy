import { describe, expect, it } from 'vitest';
import {
  extractGtin,
  fuzzyScore,
  pickFuzzyMatch,
  tokenOverlap,
} from './matching';
import { normalizeRawText } from '../common/normalize';

describe('extractGtin', () => {
  it('pulls UPC/GTIN digit runs', () => {
    expect(extractGtin('ITEM 012345678905 EA')).toBe('012345678905');
    expect(extractGtin('GV MLK WHL 1GA')).toBeNull();
  });
});

describe('fuzzy matching', () => {
  it('scores milk abbreviation highly against whole milk product', () => {
    const raw = normalizeRawText('GV MLK WHL 1GA');
    const score = fuzzyScore(raw, 'Whole milk, 1 gal', 'GREAT VALUE MILK WHOLE 1 GALLON');
    expect(score).toBeGreaterThan(0.45);
  });

  it('auto-binds when alias-like text is strong', () => {
    const raw = normalizeRawText('GV MLK WHL 1GA');
    const result = pickFuzzyMatch(raw, [
      {
        productId: 'p1',
        name: 'Whole milk, 1 gal',
        aliasNormalized: 'GREAT VALUE MILK WHOLE 1 GALLON',
      },
      { productId: 'p2', name: 'Paper towels, 6 rolls' },
    ]);
    expect(result.productId).toBe('p1');
    expect(result.method).toBe('fuzzy');
  });

  it('returns suggestions without auto-bind for weak matches', () => {
    const raw = normalizeRawText('XYZ UNKNOWN SNACK');
    const result = pickFuzzyMatch(raw, [
      { productId: 'p1', name: 'Whole milk, 1 gal' },
      { productId: 'p2', name: 'Eggs, large dozen' },
    ]);
    expect(result.productId).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('token overlap rewards shared significant tokens', () => {
    expect(tokenOverlap('MILK WHOLE GALLON', 'WHOLE MILK 1 GALLON')).toBeGreaterThan(0.5);
  });
});
