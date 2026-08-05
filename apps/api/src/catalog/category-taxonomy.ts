/**
 * Canonical category taxonomy — source of truth for seed, AI prompts, and ensure-on-boot.
 * Keep grocery children under groceries; non-food top-level for island basket mix.
 */
export type CategoryDef = {
  name: string;
  slug: string;
  parent: string | null;
  /** Hint text for AI / extraction prompts */
  hint: string;
};

export const CATEGORY_DEFS: CategoryDef[] = [
  { name: 'Groceries', slug: 'groceries', parent: null, hint: 'only when clearly food but no child fits' },
  { name: 'Dairy', slug: 'dairy', parent: 'groceries', hint: 'milk, cheese, yogurt, butter, eggs when sold with dairy' },
  { name: 'Produce', slug: 'produce', parent: 'groceries', hint: 'fruit, vegetables, herbs, salad' },
  { name: 'Meat', slug: 'meat', parent: 'groceries', hint: 'beef, chicken, pork, seafood, deli meat' },
  { name: 'Bakery', slug: 'bakery', parent: 'groceries', hint: 'bread, buns, tortillas, pastries' },
  { name: 'Pantry', slug: 'pantry', parent: 'groceries', hint: 'dry goods, canned, condiments, snacks, cereal, pasta, rice, oil' },
  { name: 'Beverages', slug: 'beverages', parent: 'groceries', hint: 'soda, juice, water, coffee, tea (non-alcoholic)' },
  { name: 'Frozen', slug: 'frozen', parent: 'groceries', hint: 'frozen meals, ice cream, frozen veg' },
  { name: 'Alcohol', slug: 'alcohol', parent: null, hint: 'beer, wine, spirits, mixers sold as alcohol' },
  { name: 'Tobacco', slug: 'tobacco', parent: null, hint: 'cigarettes, cigars, chew, vapes, nicotine' },
  { name: 'Household', slug: 'household', parent: null, hint: 'cleaning, paper goods, laundry, trash bags' },
  { name: 'Personal Care', slug: 'personal-care', parent: null, hint: 'soap, shampoo, toothpaste, cosmetics' },
  { name: 'Pharmacy', slug: 'pharmacy', parent: null, hint: 'OTC medicine, prescriptions, first aid, vitamins' },
  { name: 'Baby', slug: 'baby', parent: null, hint: 'diapers, formula, baby food, wipes' },
  { name: 'Pet', slug: 'pet', parent: null, hint: 'pet food, litter, pet supplies' },
  { name: 'Hardware', slug: 'hardware', parent: null, hint: 'tools, fasteners, building supplies, paint' },
  {
    name: 'Sporting Goods',
    slug: 'sporting-goods',
    parent: null,
    hint: 'firearms, ammo, fishing, camping, outdoor gear, guns',
  },
  { name: 'Automotive', slug: 'automotive', parent: null, hint: 'oil, parts, car care (not fuel)' },
  { name: 'Fuel', slug: 'fuel', parent: null, hint: 'gasoline, diesel, propane, heating oil' },
  { name: 'Electronics', slug: 'electronics', parent: null, hint: 'batteries, cables, small electronics, media' },
  { name: 'Other', slug: 'other', parent: null, hint: 'unclear or no better fit' },
];

export const CATEGORY_SLUGS = CATEGORY_DEFS.map((c) => c.slug);

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const CATEGORY_SLUG_SET = new Set<string>(CATEGORY_SLUGS);

/** Prompt fragment listing allowed slugs for extraction / AI categorize. */
export function categoryTaxonomyPrompt(): string {
  const lines = CATEGORY_DEFS.map((c) => `- ${c.slug} — ${c.hint}`).join('\n');
  return `Allowed guessedCategory / categorySlug values (use the most specific; prefer child over parent):
${lines}
Examples: butter → dairy; milk → dairy; handgun / ammo / rifle → sporting-goods; beer → alcohol; gas pump → fuel.
Use null only when the line is not a product (fees, bags, deposits, tax lines).`;
}

export function normalizeCategorySlug(raw: string | null | undefined): CategorySlug | null {
  if (!raw?.trim()) return null;
  const slug = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (CATEGORY_SLUG_SET.has(slug)) return slug as CategorySlug;
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
    butter: 'dairy',
    beer: 'alcohol',
    wine: 'alcohol',
    liquor: 'alcohol',
    spirits: 'alcohol',
    cigarettes: 'tobacco',
    cigars: 'tobacco',
    vape: 'tobacco',
    gun: 'sporting-goods',
    guns: 'sporting-goods',
    firearm: 'sporting-goods',
    firearms: 'sporting-goods',
    ammo: 'sporting-goods',
    ammunition: 'sporting-goods',
    rifle: 'sporting-goods',
    pistol: 'sporting-goods',
    shotgun: 'sporting-goods',
    fishing: 'sporting-goods',
    camping: 'sporting-goods',
    tools: 'hardware',
    lumber: 'hardware',
    gas: 'fuel',
    gasoline: 'fuel',
    diesel: 'fuel',
    propane: 'fuel',
    medicine: 'pharmacy',
    otc: 'pharmacy',
    vitamins: 'pharmacy',
    diapers: 'baby',
    formula: 'baby',
    'dog food': 'pet',
    'cat food': 'pet',
    batteries: 'electronics',
  };
  return aliases[slug] ?? aliases[raw.trim().toLowerCase()] ?? null;
}
