/** Deep-link an insight type to the most useful screen, with optional context. */
export function insightHref(
  type: string,
  data?: Record<string, unknown> | null,
): string {
  const productId =
    typeof data?.productId === 'string' && data.productId
      ? data.productId
      : null;
  const categoryId =
    typeof data?.categoryId === 'string' && data.categoryId
      ? data.categoryId
      : null;
  const rawText =
    typeof data?.rawText === 'string' && data.rawText ? data.rawText : null;

  switch (type) {
    case 'budget_pace':
      return categoryId
        ? `/budgets?categoryId=${encodeURIComponent(categoryId)}`
        : '/budgets';
    case 'island_premium':
      return productId
        ? `/delivered?productId=${encodeURIComponent(productId)}`
        : '/delivered';
    case 'store_switch':
      return '/prices';
    case 'price_spike':
    case 'stock_up':
      return productId
        ? `/prices?productId=${encodeURIComponent(productId)}`
        : '/prices';
    case 'category_creep':
      return categoryId
        ? `/budgets?categoryId=${encodeURIComponent(categoryId)}`
        : '/budgets';
    case 'recurring_change':
      return rawText
        ? `/receipts?q=${encodeURIComponent(rawText)}`
        : '/receipts';
    case 'impulse_pattern':
      return '/receipts';
    default:
      return '/insights';
  }
}

/** Primary action label for the insight feed CTA. */
export function insightCtaLabel(type: string): string {
  switch (type) {
    case 'budget_pace':
      return 'Review budget';
    case 'island_premium':
      return 'Check delivered cost';
    case 'store_switch':
      return 'Compare store prices';
    case 'price_spike':
      return 'View price history';
    case 'stock_up':
      return 'See stock-up window';
    case 'category_creep':
      return 'Review category budget';
    case 'recurring_change':
      return 'Find in receipts';
    case 'impulse_pattern':
      return 'Browse trips';
    default:
      return 'Open related';
  }
}
