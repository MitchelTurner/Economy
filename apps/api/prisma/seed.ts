import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Groceries', slug: 'groceries', parent: null },
  { name: 'Dairy', slug: 'dairy', parent: 'groceries' },
  { name: 'Produce', slug: 'produce', parent: 'groceries' },
  { name: 'Meat', slug: 'meat', parent: 'groceries' },
  { name: 'Bakery', slug: 'bakery', parent: 'groceries' },
  { name: 'Pantry', slug: 'pantry', parent: 'groceries' },
  { name: 'Beverages', slug: 'beverages', parent: 'groceries' },
  { name: 'Frozen', slug: 'frozen', parent: 'groceries' },
  { name: 'Household', slug: 'household', parent: null },
  { name: 'Personal Care', slug: 'personal-care', parent: null },
  { name: 'Other', slug: 'other', parent: null },
];

async function seedCategories() {
  const bySlug = new Map<string, string>();

  for (const cat of CATEGORIES.filter((c) => !c.parent)) {
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });
    bySlug.set(cat.slug, row.id);
  }

  for (const cat of CATEGORIES.filter((c) => c.parent)) {
    const parentId = bySlug.get(cat.parent!);
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, parentId },
      create: { name: cat.name, slug: cat.slug, parentId },
    });
    bySlug.set(cat.slug, row.id);
  }

  return bySlug;
}

async function seedBasketProducts(categoryBySlug: Map<string, string>) {
  const basketPath = join(__dirname, '../../../data/baskets/staples-25.json');
  const basket = JSON.parse(readFileSync(basketPath, 'utf8')) as {
    items: Array<{
      name: string;
      sizeValue: number;
      sizeUom: string;
      baseUom: string;
      baseFactor: number;
      categorySlug: string;
    }>;
  };

  for (const item of basket.items) {
    const categoryId = categoryBySlug.get(item.categorySlug) ?? categoryBySlug.get('other')!;
    const existing = await prisma.product.findFirst({ where: { name: item.name } });
    if (existing) continue;
    await prisma.product.create({
      data: {
        name: item.name,
        sizeValue: item.sizeValue,
        sizeUom: item.sizeUom,
        baseUom: item.baseUom,
        baseFactor: item.baseFactor,
        categoryId,
      },
    });
  }
}

async function seedDevHousehold() {
  const email = 'demo@islandledger.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const household = await prisma.household.create({
    data: { name: 'Demo Household' },
  });

  const passwordHash = await argon2.hash('demo-password-123');
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: 'Demo User',
      householdId: household.id,
    },
  });
}

async function seedStores() {
  const stores = [
    { name: 'Safeway', address: '2417 Tongass Ave', region: 'ketchikan', chain: 'Safeway' },
    { name: 'Alaska General Store', address: '2417 First Ave', region: 'ketchikan', chain: null },
    { name: 'Costco Anchorage', address: '1000 E 46th Ave', region: 'anchorage', chain: 'Costco' },
  ];

  for (const s of stores) {
    await prisma.store.upsert({
      where: { name_address: { name: s.name, address: s.address } },
      update: { region: s.region, chain: s.chain },
      create: s,
    });
  }
}

async function main() {
  const categoryBySlug = await seedCategories();
  await seedBasketProducts(categoryBySlug);
  await seedStores();
  await seedDevHousehold();
  console.log('Seed complete.');
  console.log('Demo login: demo@islandledger.local / demo-password-123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
