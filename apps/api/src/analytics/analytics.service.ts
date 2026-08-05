import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ReceiptStatus } from '@prisma/client';
import { normalizeRawText } from '../common/normalize';
import {
  bucketSpendLines,
  categoryPriceMovers,
  pctChange,
  productPriceMovers,
  summarizeHabits,
  summarizeTax,
  type CategoryBasketLine,
  type SpendLineInput,
  type TaxReceiptInput,
} from './analytics.helpers';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async spend(
    user: AuthUser,
    opts: {
      groupBy?: 'category' | 'store' | 'month';
      from?: string;
      to?: string;
    },
  ) {
    const from = opts.from ? new Date(opts.from) : startOfMonth(new Date());
    const to = opts.to ? new Date(opts.to) : endOfMonth(new Date());
    const groupBy = opts.groupBy ?? 'category';

    const receipts = await this.prisma.receipt.findMany({
      where: {
        householdId: user.householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: from, lte: to },
      },
      include: {
        store: true,
        lines: { include: { category: true } },
      },
    });

    const lines: SpendLineInput[] = [];
    const taxInputs: TaxReceiptInput[] = [];
    for (const receipt of receipts) {
      let lineNetCents = 0;
      let taxableLineCount = 0;
      for (const line of receipt.lines) {
        const net = line.extendedCents - line.discountCents;
        lineNetCents += net;
        if (line.isTaxable) taxableLineCount += 1;
        lines.push({
          netCents: net,
          categoryId: line.categoryId,
          categoryName: line.category?.name ?? null,
          storeId: receipt.storeId,
          storeName: receipt.store?.name ?? null,
          purchasedAt: receipt.purchasedAt ?? receipt.createdAt,
        });
      }
      taxInputs.push({
        taxCents: receipt.taxCents,
        lineCount: receipt.lines.length,
        taxableLineCount,
        lineNetCents,
      });
    }

    const groups = bucketSpendLines(lines, groupBy);
    const totalCents = groups.reduce((s, g) => s + g.totalCents, 0);
    const tax = summarizeTax(taxInputs);
    return {
      from,
      to,
      groupBy,
      totalCents,
      groups,
      taxPaidCents: tax.taxPaidCents,
      pretaxSpendCents: tax.pretaxSpendCents,
      taxableLineSharePct: tax.taxableLineSharePct,
      effectiveTaxRatePct: tax.effectiveTaxRatePct,
    };
  }

  /**
   * Island economy pulse: staples inflation %, tax paid, category price vs
   * behavior, and product price movers. Numbers are deterministic from stored data.
   */
  async economy(user: AuthUser, region = 'ketchikan') {
    const now = new Date();
    const thisStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const thisEnd = endOfMonth(now);
    const priorStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const priorEnd = new Date(thisStart.getTime() - 1);
    const day90 = new Date(now);
    day90.setUTCDate(day90.getUTCDate() - 90);

    const [currentReceipts, priorReceipts, indexPoints, observations] =
      await Promise.all([
        this.loadConfirmedReceipts(user.householdId, thisStart, thisEnd),
        this.loadConfirmedReceipts(user.householdId, priorStart, priorEnd),
        this.prisma.priceIndexPoint.findMany({
          where: {
            basketSlug: 'staples-25',
            region,
            storeId: null,
          },
          orderBy: { periodStart: 'asc' },
          take: 24,
        }),
        this.prisma.priceObservation.findMany({
          where: {
            householdId: user.householdId,
            observedAt: { gte: day90 },
          },
          include: {
            product: { include: { category: true } },
          },
          orderBy: { observedAt: 'asc' },
        }),
      ]);

    const currentTax = summarizeTax(toTaxInputs(currentReceipts));
    const priorTax = summarizeTax(toTaxInputs(priorReceipts));

    const indexSeries = indexPoints.map((p, i) => {
      const value = Number(p.indexValue);
      const prior = i > 0 ? Number(indexPoints[i - 1]!.indexValue) : null;
      return {
        periodStart: p.periodStart,
        indexValue: value,
        basketCostCents: p.basketCostCents,
        coverage: Number(p.coverage),
        changePct: prior != null ? pctChange(prior, value) : null,
      };
    });
    const latest = indexSeries[indexSeries.length - 1] ?? null;
    const priorIdx = indexSeries[indexSeries.length - 2] ?? null;
    const inflationMoMPct =
      latest && priorIdx
        ? pctChange(priorIdx.indexValue, latest.indexValue)
        : null;
    const yearAgo = indexSeries.length >= 13 ? indexSeries[indexSeries.length - 13]! : null;
    const inflationYoYPct =
      latest && yearAgo
        ? pctChange(yearAgo.indexValue, latest.indexValue)
        : null;

    const categories = categoryPriceMovers(
      toCategoryBasket(priorReceipts),
      toCategoryBasket(currentReceipts),
    );

    const byProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        categoryName: string | null;
        pricesOldestFirst: number[];
      }
    >();
    for (const o of observations) {
      const cents = Math.round(Number(o.pricePerBaseUom));
      const cur = byProduct.get(o.productId) ?? {
        productId: o.productId,
        productName: o.product.name,
        categoryName: o.product.category?.name ?? null,
        pricesOldestFirst: [] as number[],
      };
      cur.pricesOldestFirst.push(cents);
      byProduct.set(o.productId, cur);
    }
    const products = productPriceMovers([...byProduct.values()]).slice(0, 12);

    return {
      region,
      basketSlug: 'staples-25',
      generatedAt: now,
      currentPeriod: { from: thisStart, to: thisEnd },
      priorPeriod: { from: priorStart, to: priorEnd },
      inflation: {
        momPct: inflationMoMPct,
        yoyPct: inflationYoYPct,
        latestIndex: latest?.indexValue ?? null,
        latestBasketCostCents: latest?.basketCostCents ?? null,
        latestCoverage: latest?.coverage ?? null,
        series: indexSeries,
      },
      tax: {
        current: currentTax,
        prior: priorTax,
        deltaTaxCents: currentTax.taxPaidCents - priorTax.taxPaidCents,
      },
      categories,
      products,
    };
  }

  async habits(user: AuthUser) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 3);

    const receipts = await this.prisma.receipt.findMany({
      where: {
        householdId: user.householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: since },
      },
      include: {
        store: true,
        lines: true,
      },
      orderBy: { purchasedAt: 'asc' },
    });

    return summarizeHabits(
      receipts.map((r) => ({
        storeId: r.storeId,
        storeName: r.store?.name ?? null,
        purchasedAt: r.purchasedAt,
        lineNets: r.lines.map((l) => l.extendedCents - l.discountCents),
        lineRawTexts: r.lines.map((l) => l.rawText),
      })),
      since,
    );
  }

  private loadConfirmedReceipts(householdId: string, from: Date, to: Date) {
    return this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: from, lte: to },
      },
      include: {
        lines: { include: { category: true, product: true } },
      },
    });
  }
}

type EconomyLine = {
  isTaxable: boolean;
  extendedCents: number;
  discountCents: number;
  quantity: { toString(): string } | number;
  unitPriceCents: number | null;
  categoryId: string | null;
  productId: string | null;
  rawText: string;
  category: { name: string } | null;
};

type EconomyReceipt = {
  taxCents: number | null;
  lines: EconomyLine[];
};

function toTaxInputs(receipts: EconomyReceipt[]): TaxReceiptInput[] {
  return receipts.map((r) => ({
    taxCents: r.taxCents,
    lineCount: r.lines.length,
    taxableLineCount: r.lines.filter((l) => l.isTaxable).length,
    lineNetCents: r.lines.reduce(
      (s, l) => s + l.extendedCents - l.discountCents,
      0,
    ),
  }));
}

function toCategoryBasket(receipts: EconomyReceipt[]): CategoryBasketLine[] {
  const map = new Map<string, CategoryBasketLine>();
  for (const r of receipts) {
    for (const l of r.lines) {
      const categoryId = l.categoryId ?? 'uncategorized';
      const categoryName = l.category?.name ?? 'Uncategorized';
      const key = l.productId ?? normalizeRawText(l.rawText);
      const qty = Number(l.quantity);
      const unit =
        l.unitPriceCents ??
        (qty ? Math.round(l.extendedCents / qty) : l.extendedCents);
      const mapKey = `${categoryId}:${key}`;
      const cur = map.get(mapKey) ?? {
        categoryId,
        categoryName,
        key,
        quantity: 0,
        unitPriceCents: unit,
      };
      cur.quantity += qty;
      cur.unitPriceCents = unit;
      map.set(mapKey, cur);
    }
  }
  return [...map.values()];
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
