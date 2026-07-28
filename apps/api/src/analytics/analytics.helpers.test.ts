import { describe, expect, it } from 'vitest';
import {
  bucketSpendLines,
  parseSpendQuery,
  summarizeHabits,
} from './analytics.helpers';

describe('bucketSpendLines', () => {
  const lines = [
    {
      netCents: 500,
      categoryId: 'c1',
      categoryName: 'Dairy',
      storeId: 's1',
      storeName: 'Safeway',
      purchasedAt: new Date('2026-06-15T12:00:00.000Z'),
    },
    {
      netCents: 300,
      categoryId: 'c1',
      categoryName: 'Dairy',
      storeId: 's2',
      storeName: 'Costco',
      purchasedAt: new Date('2026-07-02T12:00:00.000Z'),
    },
    {
      netCents: 200,
      categoryId: 'c2',
      categoryName: 'Produce',
      storeId: 's1',
      storeName: 'Safeway',
      purchasedAt: new Date('2026-07-10T12:00:00.000Z'),
    },
  ];

  it('groups by category', () => {
    const groups = bucketSpendLines(lines, 'category');
    expect(groups[0]).toMatchObject({ label: 'Dairy', totalCents: 800 });
    expect(groups[1]).toMatchObject({ label: 'Produce', totalCents: 200 });
  });

  it('groups by store', () => {
    const groups = bucketSpendLines(lines, 'store');
    expect(groups.find((g) => g.label === 'Safeway')?.totalCents).toBe(700);
    expect(groups.find((g) => g.label === 'Costco')?.totalCents).toBe(300);
  });

  it('groups by month', () => {
    const groups = bucketSpendLines(lines, 'month');
    expect(groups.find((g) => g.key === '2026-06')?.totalCents).toBe(500);
    expect(groups.find((g) => g.key === '2026-07')?.totalCents).toBe(500);
  });
});

describe('summarizeHabits', () => {
  it('returns empty cadence for no receipts', () => {
    const since = new Date('2026-04-01T00:00:00.000Z');
    const now = new Date('2026-07-01T00:00:00.000Z');
    const h = summarizeHabits([], since, now);
    expect(h.tripCount).toBe(0);
    expect(h.tripsPerWeek).toBe(0);
    expect(h.windowDays).toBe(91);
  });

  it('computes cadence, store mix, and recurring items', () => {
    const since = new Date('2026-04-01T00:00:00.000Z');
    const now = new Date('2026-07-01T00:00:00.000Z'); // 91 days ≈ 13 weeks
    const receipts = Array.from({ length: 13 }, (_, i) => ({
      storeId: i % 2 === 0 ? 's1' : 's2',
      storeName: i % 2 === 0 ? 'Safeway' : 'Costco',
      purchasedAt: new Date(since.getTime() + i * 7 * 86_400_000),
      lineNets: [1000, 500],
      lineRawTexts: ['MILK', 'BREAD', 'MILK'],
    }));
    // bump milk frequency across trips
    for (const r of receipts) {
      r.lineRawTexts = ['MILK', 'EGGS'];
    }
    // add third milk appearance via extra trips already 13 with MILK each → count 13
    const h = summarizeHabits(receipts, since, now);
    expect(h.tripCount).toBe(13);
    expect(h.avgBasketCents).toBe(1500);
    expect(h.avgLinesPerTrip).toBe(2);
    expect(h.tripsPerWeek).toBe(1);
    expect(h.storeMix[0]?.name).toBe('Safeway');
    expect(h.recurringItems.some((i) => i.rawText === 'MILK' && i.count >= 3)).toBe(
      true,
    );
  });
});

describe('parseSpendQuery', () => {
  it('defaults groupBy to category', () => {
    expect(parseSpendQuery({})).toEqual({ groupBy: 'category' });
  });

  it('rejects invalid groupBy', () => {
    expect(() => parseSpendQuery({ groupBy: 'week' })).toThrow(/groupBy/);
  });

  it('rejects bad dates', () => {
    expect(() => parseSpendQuery({ from: 'not-a-date' })).toThrow(/from/);
  });
});
