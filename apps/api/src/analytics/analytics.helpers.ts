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
