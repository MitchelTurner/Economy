import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SLUGS,
  normalizeCategorySlug,
  categoryTaxonomyPrompt,
} from './category-taxonomy';

describe('category taxonomy', () => {
  it('includes seed slugs', () => {
    expect(CATEGORY_SLUGS).toEqual(
      expect.arrayContaining(['dairy', 'produce', 'other', 'personal-care']),
    );
  });

  it('normalizes aliases', () => {
    expect(normalizeCategorySlug('Dairy')).toBe('dairy');
    expect(normalizeCategorySlug('personal care')).toBe('personal-care');
    expect(normalizeCategorySlug('drinks')).toBe('beverages');
    expect(normalizeCategorySlug('unknown-xyz')).toBeNull();
  });

  it('prompt lists allowed values', () => {
    const p = categoryTaxonomyPrompt();
    expect(p).toContain('dairy');
    expect(p).toContain('personal-care');
  });
});
