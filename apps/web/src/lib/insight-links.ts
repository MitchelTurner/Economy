/** Deep-link an insight type to the most useful screen. */
export function insightHref(type: string): string {
  switch (type) {
    case 'budget_pace':
      return '/budgets';
    case 'island_premium':
      return '/delivered';
    case 'store_switch':
    case 'price_spike':
    case 'stock_up':
      return '/prices';
    case 'category_creep':
      return '/insights';
    default:
      return '/insights';
  }
}
