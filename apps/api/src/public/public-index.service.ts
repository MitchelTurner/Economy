import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public anonymized aggregates.
 * Shared unit: (product, store, date, unit price) — never basket/totals/images.
 * Enforced at query layer with minimum distinct household contributors.
 */
@Injectable()
export class PublicIndexService {
  private readonly minHouseholds: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.minHouseholds = Number(config.get('PUBLIC_MIN_HOUSEHOLDS') ?? 3);
  }

  getMinHouseholds() {
    return this.minHouseholds;
  }

  async index(region: string, basketSlug = 'staples-25') {
    // Prefer rolled-up points that already exclude household identity;
    // only expose when underlying observation coverage meets contributor threshold.
    const eligibleStoreIds = await this.storesMeetingThreshold(region);
    const points = await this.prisma.priceIndexPoint.findMany({
      where: {
        basketSlug,
        region,
        OR: [
          { storeId: null },
          { storeId: { in: eligibleStoreIds } },
        ],
      },
      orderBy: { periodStart: 'asc' },
    });

    const stores = await this.prisma.store.findMany({
      where: { id: { in: eligibleStoreIds } },
      select: { id: true, name: true, region: true },
    });

    return {
      region,
      basketSlug,
      minHouseholds: this.minHouseholds,
      contributorStores: stores,
      points: points.map((p) => ({
        periodStart: p.periodStart,
        storeId: p.storeId,
        indexValue: Number(p.indexValue),
        basketCostCents: p.basketCostCents,
        coverage: p.coverage,
      })),
    };
  }

  /**
   * Latest public unit prices for a product — only cells with ≥ minHouseholds contributors.
   */
  async productPrices(productId: string, region?: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        store_id: string;
        store_name: string;
        region: string;
        day: Date;
        median_unit_cents: number;
        households: bigint;
      }>
    >`
      SELECT
        o."storeId" AS store_id,
        s.name AS store_name,
        s.region,
        date_trunc('day', o."observedAt") AS day,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY o."unitPriceCents")::float AS median_unit_cents,
        COUNT(DISTINCT o."householdId") AS households
      FROM "PriceObservation" o
      JOIN "Store" s ON s.id = o."storeId"
      WHERE o."productId" = ${productId}
        AND (${region ?? null}::text IS NULL OR s.region = ${region ?? null})
      GROUP BY o."storeId", s.name, s.region, date_trunc('day', o."observedAt")
      HAVING COUNT(DISTINCT o."householdId") >= ${this.minHouseholds}
      ORDER BY day DESC
      LIMIT 90
    `;

    return {
      productId,
      minHouseholds: this.minHouseholds,
      observations: rows.map((r) => ({
        storeId: r.store_id,
        storeName: r.store_name,
        region: r.region,
        date: r.day,
        unitPriceCents: Math.round(Number(r.median_unit_cents)),
        households: Number(r.households),
      })),
    };
  }

  private async storesMeetingThreshold(region: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ store_id: string }>>`
      SELECT o."storeId" AS store_id
      FROM "PriceObservation" o
      JOIN "Store" s ON s.id = o."storeId"
      WHERE s.region = ${region}
      GROUP BY o."storeId"
      HAVING COUNT(DISTINCT o."householdId") >= ${this.minHouseholds}
    `;
    return rows.map((r) => r.store_id);
  }
}
