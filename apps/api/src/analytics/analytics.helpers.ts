/** Pure spend / habits helpers — unit-tested without Prisma. */

export type SpendLineInput = {
  netCents: number;
  categoryId: string | null;
  categoryName: string | null;
  storeId: string | null;
  storeName: string | null;
  purchasedAt: Date;
};

export type SpendBucket = {
  key: string;
  label: string;
  totalCents: number;
  lineCount: number;
};

export function bucketSpendLines(
  lines: SpendLineInput[],
  groupBy: 'category' | 'store' | 'month',
): SpendBucket[] {
  const buckets = new Map<string, SpendBucket>();
  for (const line of lines) {
    let key: string;
    let label: string;
    if (groupBy === 'store') {
      key = line.storeId ?? 'unknown';
      label = line.storeName ?? 'Unknown store';
    } else if (groupBy === 'month') {
      const d = line.purchasedAt;
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      label = key;
    } else {
      key = line.categoryId ?? 'uncategorized';
      label = line.categoryName ?? 'Uncategorized';
    }
    const cur = buckets.get(key) ?? { key, label, totalCents: 0, lineCount: 0 };
    cur.totalCents += line.netCents;
    cur.lineCount += 1;
    buckets.set(key, cur);
  }
  return [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export type HabitReceiptInput = {
  storeId: string | null;
  storeName: string | null;
  purchasedAt: Date | null;
  lineNets: number[];
  lineRawTexts: string[];
};

export type HabitsSummary = {
  tripCount: number;
  avgBasketCents: number;
  avgLinesPerTrip: number;
  windowDays: number;
  tripsPerWeek: number;
  storeMix: Array<{ name: string; count: number }>;
  recurringItems: Array<{ rawText: string; count: number }>;
};

export function summarizeHabits(
  receipts: HabitReceiptInput[],
  since: Date,
  now: Date = new Date(),
): HabitsSummary {
  const windowDays = Math.max(
    1,
    Math.round((now.getTime() - since.getTime()) / 86_400_000),
  );

  if (receipts.length === 0) {
    return {
      tripCount: 0,
      avgBasketCents: 0,
      avgLinesPerTrip: 0,
      windowDays,
      tripsPerWeek: 0,
      storeMix: [],
      recurringItems: [],
    };
  }

  const basketTotals = receipts.map((r) =>
    r.lineNets.reduce((s, n) => s + n, 0),
  );
  const avgBasketCents = Math.round(
    basketTotals.reduce((a, b) => a + b, 0) / basketTotals.length,
  );
  const avgLinesPerTrip =
    receipts.reduce((s, r) => s + r.lineRawTexts.length, 0) / receipts.length;

  const storeCounts = new Map<string, { name: string; count: number }>();
  for (const r of receipts) {
    const key = r.storeId ?? 'unknown';
    const cur = storeCounts.get(key) ?? {
      name: r.storeName ?? 'Unknown',
      count: 0,
    };
    cur.count += 1;
    storeCounts.set(key, cur);
  }

  const itemFreq = new Map<string, number>();
  for (const r of receipts) {
    for (const raw of r.lineRawTexts) {
      itemFreq.set(raw, (itemFreq.get(raw) ?? 0) + 1);
    }
  }
  const recurringItems = [...itemFreq.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([rawText, count]) => ({ rawText, count }));

  const tripsPerWeek =
    Math.round((receipts.length / (windowDays / 7)) * 10) / 10;

  return {
    tripCount: receipts.length,
    avgBasketCents,
    avgLinesPerTrip: Math.round(avgLinesPerTrip * 10) / 10,
    windowDays,
    tripsPerWeek,
    storeMix: [...storeCounts.values()].sort((a, b) => b.count - a.count),
    recurringItems,
  };
}

export function parseSpendQuery(input: {
  groupBy?: string;
  from?: string;
  to?: string;
}): {
  groupBy: 'category' | 'store' | 'month';
  from?: string;
  to?: string;
} {
  const groupBy = input.groupBy ?? 'category';
  if (groupBy !== 'category' && groupBy !== 'store' && groupBy !== 'month') {
    throw new Error('groupBy must be category, store, or month');
  }
  if (input.from && Number.isNaN(Date.parse(input.from))) {
    throw new Error('from must be an ISO datetime');
  }
  if (input.to && Number.isNaN(Date.parse(input.to))) {
    throw new Error('to must be an ISO datetime');
  }
  return { groupBy, from: input.from, to: input.to };
}

export type TaxReceiptInput = {
  taxCents: number | null;
  lineCount: number;
  taxableLineCount: number;
  lineNetCents: number;
};

export type TaxSummary = {
  taxPaidCents: number;
  pretaxSpendCents: number;
  receiptCount: number;
  lineCount: number;
  taxableLineCount: number;
  taxableLineSharePct: number | null;
  effectiveTaxRatePct: number | null;
};

/** Receipt-level tax totals + taxable-line share (no invented line tax). */
export function summarizeTax(receipts: TaxReceiptInput[]): TaxSummary {
  let taxPaidCents = 0;
  let pretaxSpendCents = 0;
  let lineCount = 0;
  let taxableLineCount = 0;
  for (const r of receipts) {
    taxPaidCents += r.taxCents ?? 0;
    pretaxSpendCents += r.lineNetCents;
    lineCount += r.lineCount;
    taxableLineCount += r.taxableLineCount;
  }
  return {
    taxPaidCents,
    pretaxSpendCents,
    receiptCount: receipts.length,
    lineCount,
    taxableLineCount,
    taxableLineSharePct:
      lineCount > 0
        ? Math.round((taxableLineCount / lineCount) * 1000) / 10
        : null,
    effectiveTaxRatePct:
      pretaxSpendCents > 0
        ? Math.round((taxPaidCents / pretaxSpendCents) * 1000) / 10
        : null,
  };
}

/** Percent change between two index values; null if prior is 0. */
export function pctChange(prior: number, current: number): number | null {
  if (!Number.isFinite(prior) || !Number.isFinite(current) || prior === 0) {
    return null;
  }
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

export type CategoryPriceMover = {
  categoryId: string;
  categoryName: string;
  priorSpendCents: number;
  currentSpendCents: number;
  deltaTotalCents: number;
  deltaPriceCents: number;
  deltaBehaviorCents: number;
  priceChangePct: number | null;
};

export type CategoryBasketLine = {
  categoryId: string;
  categoryName: string;
  key: string;
  quantity: number;
  unitPriceCents: number;
};

/**
 * Per-category inflation vs behavior for the island basket.
 * Uses prior quantities × current prices (same idea as household behavior split).
 */
export function categoryPriceMovers(
  prior: CategoryBasketLine[],
  current: CategoryBasketLine[],
): CategoryPriceMover[] {
  const catIds = new Set<string>();
  for (const l of prior) catIds.add(l.categoryId);
  for (const l of current) catIds.add(l.categoryId);

  const out: CategoryPriceMover[] = [];
  for (const categoryId of catIds) {
    const p = prior.filter((l) => l.categoryId === categoryId);
    const c = current.filter((l) => l.categoryId === categoryId);
    if (p.length === 0 && c.length === 0) continue;

    const categoryName =
      c[0]?.categoryName ?? p[0]?.categoryName ?? 'Uncategorized';
    const priorSpendCents = p.reduce(
      (s, l) => s + Math.round(l.quantity * l.unitPriceCents),
      0,
    );
    const currentSpendCents = c.reduce(
      (s, l) => s + Math.round(l.quantity * l.unitPriceCents),
      0,
    );
    const currentPrice = new Map(c.map((l) => [l.key, l.unitPriceCents]));
    let fixedBasketCurrentCents = 0;
    for (const l of p) {
      const price = currentPrice.get(l.key) ?? l.unitPriceCents;
      fixedBasketCurrentCents += Math.round(l.quantity * price);
    }
    const deltaTotalCents = currentSpendCents - priorSpendCents;
    const deltaPriceCents = fixedBasketCurrentCents - priorSpendCents;
    const deltaBehaviorCents = deltaTotalCents - deltaPriceCents;
    out.push({
      categoryId,
      categoryName,
      priorSpendCents,
      currentSpendCents,
      deltaTotalCents,
      deltaPriceCents,
      deltaBehaviorCents,
      priceChangePct: pctChange(priorSpendCents, fixedBasketCurrentCents),
    });
  }

  return out.sort(
    (a, b) => Math.abs(b.deltaPriceCents) - Math.abs(a.deltaPriceCents),
  );
}

export type ProductPriceMover = {
  productId: string;
  productName: string;
  categoryName: string | null;
  priorCents: number;
  currentCents: number;
  changePct: number;
};

/** Biggest unit-price movers from oldest→newest observation in window. */
export function productPriceMovers(
  series: Array<{
    productId: string;
    productName: string;
    categoryName: string | null;
    pricesOldestFirst: number[];
  }>,
  minAbsPct = 5,
): ProductPriceMover[] {
  const out: ProductPriceMover[] = [];
  for (const s of series) {
    if (s.pricesOldestFirst.length < 2) continue;
    const priorCents = s.pricesOldestFirst[0]!;
    const currentCents = s.pricesOldestFirst[s.pricesOldestFirst.length - 1]!;
    const changePct = pctChange(priorCents, currentCents);
    if (changePct == null || Math.abs(changePct) < minAbsPct) continue;
    out.push({
      productId: s.productId,
      productName: s.productName,
      categoryName: s.categoryName,
      priorCents: Math.round(priorCents),
      currentCents: Math.round(currentCents),
      changePct,
    });
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}
