/** Canonical category slugs — keep in sync with prisma/seed.ts CATEGORIES. */
export const CATEGORY_SLUGS = [
  'groceries',
  'dairy',
  'produce',
  'meat',
  'bakery',
  'pantry',
  'beverages',
  'frozen',
  'household',
  'personal-care',
  'other',
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const CATEGORY_SLUG_SET = new Set<string>(CATEGORY_SLUGS);

/** Prompt fragment listing allowed slugs for extraction / AI categorize. */
export function categoryTaxonomyPrompt(): string {
  return `Allowed guessedCategory / categorySlug values (use the most specific; prefer child over parent):
- dairy — milk, cheese, yogurt, butter, eggs when sold with dairy
- produce — fruit, vegetables, herbs, salad
- meat — beef, chicken, pork, seafood, deli meat
- bakery — bread, buns, tortillas, pastries
- pantry — dry goods, canned, condiments, snacks, cereal, pasta, rice, oil
- beverages — soda, juice, water, coffee, tea, alcohol
- frozen — frozen meals, ice cream, frozen veg
- household — cleaning, paper goods, laundry, trash bags
- personal-care — soap, shampoo, toothpaste, cosmetics, OTC
- groceries — only when clearly food but no child fits
- other — non-food / unclear
Use null only when the line is not a product (fees, bags, deposits).`;
}

export function normalizeCategorySlug(raw: string | null | undefined): CategorySlug | null {
  if (!raw?.trim()) return null;
  const slug = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (CATEGORY_SLUG_SET.has(slug)) return slug as CategorySlug;
  // Common aliases from models
  const aliases: Record<string, CategorySlug> = {
    drink: 'beverages',
    drinks: 'beverages',
    beverage: 'beverages',
    veg: 'produce',
    vegetable: 'produce',
    vegetables: 'produce',
    fruit: 'produce',
    fruits: 'produce',
    seafood: 'meat',
    fish: 'meat',
    bread: 'bakery',
    cleaning: 'household',
    toiletries: 'personal-care',
    'personal care': 'personal-care',
    snack: 'pantry',
    snacks: 'pantry',
  };
  return aliases[slug] ?? aliases[raw.trim().toLowerCase()] ?? null;
}
