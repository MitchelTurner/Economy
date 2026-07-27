import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as argon2 from 'argon2';

/** Keep in sync with apps/api/src/common/normalize.ts for seed-time aliases. */
function normalizeRawText(raw: string): string {
  const dict = JSON.parse(
    readFileSync(join(__dirname, '../../../data/abbreviations.json'), 'utf8'),
  ) as Record<string, string>;
  return raw
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((t) => {
      const glued = t.match(/^(\d+(?:\.\d+)?)([A-Z]+)$/);
      if (glued) return [glued[1], glued[2]];
      return [t];
    })
    .map((t) => dict[t] ?? t)
    .join(' ');
}

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

  // Alternate package size for per-unit normalization demos (Phase 1 acceptance)
  const pantryId = categoryBySlug.get('pantry')!;
  const pb18 = await prisma.product.findFirst({ where: { name: 'Peanut butter, 18 oz' } });
  if (!pb18) {
    await prisma.product.create({
      data: {
        name: 'Peanut butter, 18 oz',
        sizeValue: 18,
        sizeUom: 'oz',
        baseUom: 'kg',
        baseFactor: 0.0283495,
        categoryId: pantryId,
      },
    });
  }
}

async function seedProductAliases() {
  const pairs: Array<{ raw: string; productName: string }> = [
    { raw: 'GV MLK WHL 1GA', productName: 'Whole milk, 1 gal' },
    { raw: 'BANANAS', productName: 'Bananas, per lb' },
    { raw: 'EGGS LG 12CT', productName: 'Eggs, large dozen' },
    { raw: 'PNUT BTR 16OZ', productName: 'Peanut butter, 16 oz' },
    { raw: 'PNUT BTR 18OZ', productName: 'Peanut butter, 18 oz' },
  ];

  for (const pair of pairs) {
    const product = await prisma.product.findFirst({ where: { name: pair.productName } });
    if (!product) continue;
    const normalized = normalizeRawText(pair.raw);
    const existing = await prisma.productAlias.findFirst({
      where: { normalized, storeId: null },
    });
    if (existing) continue;
    await prisma.productAlias.create({
      data: {
        normalized,
        storeId: null,
        productId: product.id,
        source: 'seed',
      },
    });
  }
}

async function seedDevHousehold() {
  const email = 'demo@islandledger.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role: 'owner' },
    });
  }

  const household = await prisma.household.create({
    data: { name: 'Demo Household' },
  });

  const passwordHash = await argon2.hash('demo-password-123');
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: 'Demo User',
      role: 'owner',
      householdId: household.id,
    },
  });
}

async function seedShippingLanes() {
  const lanes = [
    {
      name: 'Barge from Seattle',
      originRegion: 'seattle',
      destRegion: 'ketchikan',
      flatFeeCents: 2500,
      perLbCents: 45,
      perKgCents: 100,
      leadTimeDays: 10,
    },
    {
      name: 'Air cargo Anchorage',
      originRegion: 'anchorage',
      destRegion: 'ketchikan',
      flatFeeCents: 4000,
      perLbCents: 120,
      perKgCents: 265,
      leadTimeDays: 2,
    },
  ];
  for (const lane of lanes) {
    const existing = await prisma.shippingLane.findFirst({
      where: { name: lane.name, destRegion: lane.destRegion },
    });
    if (existing) {
      await prisma.shippingLane.update({ where: { id: existing.id }, data: lane });
    } else {
      await prisma.shippingLane.create({ data: lane });
    }
  }
}

/** Two extra households so public aggregates clear the ≥3 contributor gate. */
async function seedPublicContributors(primaryHouseholdId: string) {
  const marker = await prisma.household.findFirst({
    where: { name: 'Public Contributor A' },
  });
  if (marker) return;

  const safeway = await prisma.store.findFirst({ where: { name: 'Safeway' } });
  if (!safeway) return;

  const products = await prisma.product.findMany({
    where: {
      name: {
        in: [
          'Whole milk, 1 gal',
          'Eggs, large dozen',
          'Butter, salted 1 lb',
          'Coffee, ground 12 oz',
          'Peanut butter, 16 oz',
          'Bananas, per lb',
        ],
      },
    },
  });

  const passwordHash = await argon2.hash('contributor-password');
  for (const label of ['A', 'B'] as const) {
    const household = await prisma.household.create({
      data: { name: `Public Contributor ${label}` },
    });
    await prisma.user.create({
      data: {
        email: `contributor-${label.toLowerCase()}@islandledger.local`,
        passwordHash,
        displayName: `Contributor ${label}`,
        role: 'owner',
        householdId: household.id,
      },
    });

    const observedAt = new Date('2026-07-15T12:00:00Z');
    for (const product of products) {
      const unit = 400 + label.charCodeAt(0);
      const size = product.sizeValue ? Number(product.sizeValue) : 1;
      const factor = product.baseFactor ? Number(product.baseFactor) : 1;
      await prisma.priceObservation.create({
        data: {
          productId: product.id,
          storeId: safeway.id,
          observedAt,
          unitPriceCents: unit,
          pricePerBaseUom: unit / (size * factor),
          householdId: household.id,
        },
      });
    }
  }

  // Primary household must share the same UTC day so the ≥3 gate can pass
  const publicDay = new Date('2026-07-15T12:00:00Z');
  for (const product of products) {
    const existing = await prisma.priceObservation.findFirst({
      where: {
        householdId: primaryHouseholdId,
        productId: product.id,
        storeId: safeway.id,
        observedAt: publicDay,
      },
    });
    if (existing) continue;
    const unit = 520;
    const size = product.sizeValue ? Number(product.sizeValue) : 1;
    const factor = product.baseFactor ? Number(product.baseFactor) : 1;
    await prisma.priceObservation.create({
      data: {
        productId: product.id,
        storeId: safeway.id,
        observedAt: publicDay,
        unitPriceCents: unit,
        pricePerBaseUom: unit / (size * factor),
        householdId: primaryHouseholdId,
      },
    });
  }
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

async function seedBaselines() {
  const targets = [
    { name: 'Whole milk, 1 gal', seattle: 380, national: 360 },
    { name: 'Butter, salted 1 lb', seattle: 900, national: 850 },
    { name: 'Coffee, ground 12 oz', seattle: 700, national: 650 },
    { name: 'Eggs, large dozen', seattle: 320, national: 300 },
    { name: 'Peanut butter, 16 oz', seattle: 350, national: 330 },
  ];
  const effectiveOn = new Date('2026-01-01T00:00:00Z');
  for (const t of targets) {
    const product = await prisma.product.findFirst({ where: { name: t.name } });
    if (!product) continue;
    for (const [region, price] of [
      ['seattle', t.seattle],
      ['us-national', t.national],
    ] as const) {
      await prisma.baselinePrice.upsert({
        where: {
          productId_region_effectiveOn: {
            productId: product.id,
            region,
            effectiveOn,
          },
        },
        update: { pricePerBaseUom: price, source: 'seed' },
        create: {
          productId: product.id,
          region,
          pricePerBaseUom: price,
          source: 'seed',
          effectiveOn,
        },
      });
    }
  }
}

/** Six months of synthetic confirmed receipts for analytics / insight screens. */
async function seedSyntheticHistory(userId: string, householdId: string) {
  const marker = await prisma.receipt.findFirst({
    where: { householdId, imageHash: { startsWith: 'seed-synth:' } },
  });
  if (marker) return;

  const safeway = await prisma.store.findFirst({ where: { name: 'Safeway' } });
  const ags = await prisma.store.findFirst({ where: { name: 'Alaska General Store' } });
  if (!safeway || !ags) return;

  const products = await prisma.product.findMany({
    where: {
      name: {
        in: [
          'Whole milk, 1 gal',
          'Eggs, large dozen',
          'Bananas, per lb',
          'Butter, salted 1 lb',
          'Coffee, ground 12 oz',
          'Peanut butter, 16 oz',
        ],
      },
    },
  });
  const byName = new Map(products.map((p) => [p.name, p]));

  const dairy = await prisma.category.findUnique({ where: { slug: 'dairy' } });
  await prisma.budget.create({
    data: {
      householdId,
      categoryId: dairy?.id,
      period: 'MONTHLY',
      amountCents: 25000,
      startsOn: new Date(Date.UTC(2026, 0, 1)),
    },
  });

  const catalog: Array<{
    name: string;
    raw: string;
    baseUnit: number;
    drift: number;
  }> = [
    { name: 'Whole milk, 1 gal', raw: 'GV MLK WHL 1GA', baseUnit: 529, drift: 4 },
    { name: 'Eggs, large dozen', raw: 'EGGS LG 12CT', baseUnit: 399, drift: 3 },
    { name: 'Bananas, per lb', raw: 'BANANAS', baseUnit: 79, drift: 1 },
    { name: 'Butter, salted 1 lb', raw: 'BUTTER SALTED 1LB', baseUnit: 549, drift: 8 },
    { name: 'Coffee, ground 12 oz', raw: 'COFFEE GRND 12OZ', baseUnit: 899, drift: -6 },
    { name: 'Peanut butter, 16 oz', raw: 'PNUT BTR 16OZ', baseUnit: 449, drift: 2 },
  ];

  const now = new Date('2026-07-20T18:00:00Z');
  for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
    for (let trip = 0; trip < 3; trip++) {
      const purchasedAt = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - monthOffset,
          4 + trip * 8,
          trip === 2 ? 19 : 11,
        ),
      );
      const store = trip % 2 === 0 ? safeway : ags;
      const storeFactor = store.id === safeway.id ? 1.12 : 1.0;
      const lines = catalog.map((c, i) => {
        const product = byName.get(c.name)!;
        const unit = Math.round(
          (c.baseUnit + c.drift * (5 - monthOffset) + (store.id === safeway.id ? 20 : 0)) *
            storeFactor,
        );
        return {
          lineNumber: i + 1,
          rawText: c.raw,
          quantity: 1,
          unitPriceCents: unit,
          extendedCents: unit,
          discountCents: 0,
          productId: product.id,
          categoryId: product.categoryId,
          matchMethod: 'seed',
          matchConfidence: 1,
        };
      });
      // Amplify dairy spend in recent months for category_creep / budget_pace
      if (monthOffset <= 1) {
        lines[0]!.quantity = 2;
        lines[0]!.extendedCents = lines[0]!.unitPriceCents! * 2;
        lines[3]!.quantity = 2;
        lines[3]!.extendedCents = lines[3]!.unitPriceCents! * 2;
      }
      const totalCents = lines.reduce((s, l) => s + l.extendedCents, 0);
      const receipt = await prisma.receipt.create({
        data: {
          householdId,
          uploadedById: userId,
          storeId: store.id,
          status: 'CONFIRMED',
          imageKey: `seed/${householdId}/${purchasedAt.toISOString()}`,
          imageHash: `seed-synth:${householdId}:${purchasedAt.toISOString()}`,
          purchasedAt,
          taxCents: 0,
          totalCents,
          reviewedAt: purchasedAt,
          arithmeticOk: true,
          lines: { create: lines },
        },
        include: { lines: { include: { product: true } } },
      });

      for (const line of receipt.lines) {
        if (!line.product?.baseFactor || !line.product.sizeValue) continue;
        const unit = line.unitPriceCents ?? line.extendedCents;
        const perBase =
          unit / (Number(line.product.sizeValue) * Number(line.product.baseFactor));
        await prisma.priceObservation.create({
          data: {
            productId: line.productId!,
            storeId: store.id,
            observedAt: purchasedAt,
            unitPriceCents: unit,
            pricePerBaseUom: perBase,
            receiptLineId: line.id,
            householdId,
          },
        });
      }
    }
  }
}

async function main() {
  const categoryBySlug = await seedCategories();
  await seedBasketProducts(categoryBySlug);
  await seedProductAliases();
  await seedStores();
  await seedBaselines();
  await seedShippingLanes();
  const user = await seedDevHousehold();
  await seedSyntheticHistory(user.id, user.householdId);
  await seedPublicContributors(user.householdId);
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
