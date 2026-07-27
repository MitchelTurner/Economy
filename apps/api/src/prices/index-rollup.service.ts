import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

type BasketItem = { name: string };

@Injectable()
export class IndexRollupService {
  private readonly logger = new Logger(IndexRollupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async rollupAll(periodStart = startOfUtcDay(new Date())) {
    const basketPath = join(__dirname, '../../../../data/baskets/staples-25.json');
    const basket = JSON.parse(readFileSync(basketPath, 'utf8')) as {
      slug: string;
      items: BasketItem[];
    };

    const products = await this.prisma.product.findMany({
      where: { name: { in: basket.items.map((i) => i.name) } },
    });
    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      this.logger.warn('No basket products found for index rollup');
      return { points: 0 };
    }

    const lookback = new Date(periodStart);
    lookback.setUTCDate(lookback.getUTCDate() - 30);

    const observations = await this.prisma.priceObservation.findMany({
      where: {
        productId: { in: productIds },
        observedAt: { gte: lookback, lte: periodStart },
      },
      include: { store: true },
      orderBy: { observedAt: 'desc' },
    });

    // Latest observation per (product, store) and per (product, region)
    const byStoreProduct = new Map<string, (typeof observations)[number]>();
    const byRegionProduct = new Map<string, (typeof observations)[number]>();
    for (const o of observations) {
      const sk = `${o.storeId}:${o.productId}`;
      if (!byStoreProduct.has(sk)) byStoreProduct.set(sk, o);
      const rk = `${o.store.region}:${o.productId}`;
      if (!byRegionProduct.has(rk)) byRegionProduct.set(rk, o);
    }

    const storeIds = [...new Set(observations.map((o) => o.storeId))];
    const regions = [...new Set(observations.map((o) => o.store.region))];
    let points = 0;

    for (const storeId of storeIds) {
      const region = observations.find((o) => o.storeId === storeId)?.store.region ?? 'ketchikan';
      const prices: number[] = [];
      for (const pid of productIds) {
        const o = byStoreProduct.get(`${storeId}:${pid}`);
        if (o) prices.push(Number(o.pricePerBaseUom));
      }
      if (prices.length === 0) continue;
      const basketCostCents = Math.round(prices.reduce((a, b) => a + b, 0));
      const coverage = prices.length / productIds.length;
      const indexValue = coverage > 0 ? basketCostCents / (100 * prices.length) : 0;
      await this.upsertPoint({
        basketSlug: basket.slug,
        storeId,
        region,
        periodStart,
        indexValue,
        basketCostCents,
        coverage,
      });
      points += 1;
    }

    for (const region of regions) {
      const prices: number[] = [];
      for (const pid of productIds) {
        const o = byRegionProduct.get(`${region}:${pid}`);
        if (o) prices.push(Number(o.pricePerBaseUom));
      }
      if (prices.length === 0) continue;
      const basketCostCents = Math.round(prices.reduce((a, b) => a + b, 0));
      const coverage = prices.length / productIds.length;
      const indexValue = coverage > 0 ? basketCostCents / (100 * prices.length) : 0;
      await this.upsertPoint({
        basketSlug: basket.slug,
        storeId: null,
        region,
        periodStart,
        indexValue,
        basketCostCents,
        coverage,
      });
      points += 1;
    }

    this.logger.log(`Wrote ${points} price index points for ${periodStart.toISOString()}`);
    return { points };
  }

  private async upsertPoint(input: {
    basketSlug: string;
    storeId: string | null;
    region: string;
    periodStart: Date;
    indexValue: number;
    basketCostCents: number;
    coverage: number;
  }) {
    // Prisma unique with null storeId is awkward — findFirst + update/create
    const existing = await this.prisma.priceIndexPoint.findFirst({
      where: {
        basketSlug: input.basketSlug,
        storeId: input.storeId,
        region: input.region,
        periodStart: input.periodStart,
      },
    });
    const data = {
      indexValue: new Prisma.Decimal(input.indexValue.toFixed(4)),
      basketCostCents: input.basketCostCents,
      coverage: input.coverage,
    };
    if (existing) {
      await this.prisma.priceIndexPoint.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.priceIndexPoint.create({
        data: {
          basketSlug: input.basketSlug,
          storeId: input.storeId,
          region: input.region,
          periodStart: input.periodStart,
          ...data,
        },
      });
    }
  }
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
