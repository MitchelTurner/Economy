import { describe, expect, it } from 'vitest';
import { insightCtaLabel, insightHref } from './insight-links';

describe('insightHref', () => {
  it('links budget_pace to budgets with category', () => {
    expect(insightHref('budget_pace', { categoryId: 'cat-1' })).toBe(
      '/budgets?categoryId=cat-1',
    );
  });

  it('links price insights to product detail', () => {
    expect(insightHref('price_spike', { productId: 'p1' })).toBe(
      '/prices?productId=p1',
    );
    expect(insightHref('island_premium', { productId: 'p2' })).toBe(
      '/delivered?productId=p2',
    );
  });

  it('falls back without data', () => {
    expect(insightHref('store_switch')).toBe('/prices');
    expect(insightHref('budget_pace')).toBe('/budgets');
  });
});

describe('insightCtaLabel', () => {
  it('returns type-specific labels', () => {
    expect(insightCtaLabel('budget_pace')).toBe('Review budget');
    expect(insightCtaLabel('store_switch')).toBe('Compare store prices');
  });
});
