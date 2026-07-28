import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PublicIndexService } from './public-index.service';

/** Pure helpers mirroring the public aggregation gate. */
export function meetsContributorThreshold(
  distinctHouseholds: number,
  minHouseholds: number,
): boolean {
  return distinctHouseholds >= minHouseholds;
}

describe('public contributor threshold', () => {
  it('requires ≥3 households by default', () => {
    expect(meetsContributorThreshold(2, 3)).toBe(false);
    expect(meetsContributorThreshold(3, 3)).toBe(true);
  });

  it('never exposes a single-household figure at threshold 3', () => {
    expect(meetsContributorThreshold(1, 3)).toBe(false);
  });
});

describe('PublicIndexService.index region gate', () => {
  it('omits storeId=null points when region is under threshold', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        periodStart: new Date('2026-01-01'),
        storeId: 's1',
        indexValue: 1.2,
        basketCostCents: 5000,
        coverage: 0.8,
      },
    ]);
    const prisma = {
      $queryRaw: vi
        .fn()
        // storesMeetingThreshold
        .mockResolvedValueOnce([{ store_id: 's1' }])
        // regionMeetingThreshold — under min
        .mockResolvedValueOnce([{ households: 1n }]),
      priceIndexPoint: { findMany },
      store: {
        findMany: vi.fn().mockResolvedValue([
          { id: 's1', name: 'Safeway', region: 'ketchikan' },
        ]),
      },
    };
    const svc = new PublicIndexService(
      prisma as never,
      new ConfigService({ PUBLIC_MIN_HOUSEHOLDS: '3' }),
    );
    const res = await svc.index('ketchikan');
    expect(res.regionPublished).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ storeId: { in: ['s1'] } }],
        }),
      }),
    );
    expect(res.points).toHaveLength(1);
  });
});
