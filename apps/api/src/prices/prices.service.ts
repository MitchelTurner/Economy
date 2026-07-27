import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pricePerBaseUom } from '../common/normalize';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class PricesService {
  constructor(private readonly prisma: PrismaService) {}

  async observeFromReceipt(receiptId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        lines: { include: { product: true } },
      },
    });
    if (!receipt?.storeId) return;

    for (const line of receipt.lines) {
      if (!line.productId || !line.product) continue;
      const unit =
        line.unitPriceCents ??
        (line.quantity && Number(line.quantity) !== 0
          ? Math.round(line.extendedCents / Number(line.quantity))
          : line.extendedCents);

      const perBase = pricePerBaseUom(
        unit,
        line.product.sizeValue ? Number(line.product.sizeValue) : null,
        line.product.baseFactor ? Number(line.product.baseFactor) : null,
      );
      if (perBase == null) continue;

      await this.prisma.priceObservation.upsert({
        where: { receiptLineId: line.id },
        update: {
          unitPriceCents: unit,
          pricePerBaseUom: new Prisma.Decimal(perBase.toFixed(4)),
          observedAt: receipt.purchasedAt ?? receipt.createdAt,
        },
        create: {
          productId: line.productId,
          storeId: receipt.storeId,
          observedAt: receipt.purchasedAt ?? receipt.createdAt,
          unitPriceCents: unit,
          pricePerBaseUom: new Prisma.Decimal(perBase.toFixed(4)),
          receiptLineId: line.id,
          householdId: receipt.householdId,
        },
      });
    }
  }

  async history(
    user: AuthUser,
    productId: string,
    opts: { storeId?: string; from?: string; to?: string },
  ) {
    return this.prisma.priceObservation.findMany({
      where: {
        productId,
        householdId: user.householdId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.from || opts.to
          ? {
              observedAt: {
                ...(opts.from ? { gte: new Date(opts.from) } : {}),
                ...(opts.to ? { lte: new Date(opts.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { observedAt: 'asc' },
      include: { store: { select: { id: true, name: true } } },
    });
  }

  async compare(user: AuthUser, productIds: string[]) {
    const rows = await this.prisma.priceObservation.findMany({
      where: {
        householdId: user.householdId,
        productId: { in: productIds },
      },
      orderBy: { observedAt: 'desc' },
      include: { store: { select: { id: true, name: true } }, product: true },
    });

    // latest per (product, store)
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.productId}:${row.storeId}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    return [...latest.values()];
  }

  async index(basket: string, region: string) {
    return this.prisma.priceIndexPoint.findMany({
      where: { basketSlug: basket, region },
      orderBy: { periodStart: 'asc' },
    });
  }

  async premium(user: AuthUser, productId: string) {
    const latestLocal = await this.prisma.priceObservation.findFirst({
      where: { productId, householdId: user.householdId },
      orderBy: { observedAt: 'desc' },
    });
    const baseline = await this.prisma.baselinePrice.findFirst({
      where: { productId },
      orderBy: { effectiveOn: 'desc' },
    });
    if (!latestLocal || !baseline) {
      return { local: latestLocal, baseline, premiumPct: null };
    }
    const local = Number(latestLocal.pricePerBaseUom);
    const base = Number(baseline.pricePerBaseUom);
    const premiumPct = base > 0 ? ((local - base) / base) * 100 : null;
    return { local: latestLocal, baseline, premiumPct };
  }
}
