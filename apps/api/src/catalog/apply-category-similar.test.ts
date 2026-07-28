import { describe, expect, it } from 'vitest';
import { linesShareCategoryHint, significantTokens } from './catalog.service';

describe('apply-category-similar helpers', () => {
  it('ignores short tokens after normalization', () => {
    // "A" drops (<3); "LB" expands via abbreviation dictionary then keeps length ≥3.
    const tokens = significantTokens('A X APPLES');
    expect(tokens.every((t) => t.length >= 3)).toBe(true);
    expect(tokens).toContain('APPLES');
    expect(tokens).not.toContain('A');
    expect(tokens).not.toContain('X');
  });

  it('matches on shared first significant token', () => {
    expect(
      linesShareCategoryHint(significantTokens('ORG MILK GAL'), 'ORG MILK QT'),
    ).toBe(true);
  });

  it('matches when two later tokens overlap', () => {
    expect(
      linesShareCategoryHint(
        significantTokens('VALUE UNSALTED BUTTER'),
        'LAND UNSALTED BUTTER STICKS',
      ),
    ).toBe(true);
  });

  it('rejects unrelated lines', () => {
    expect(
      linesShareCategoryHint(significantTokens('BANANAS'), 'PAPER TOWELS'),
    ).toBe(false);
  });
});
