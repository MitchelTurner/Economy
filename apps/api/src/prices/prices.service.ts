import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pricePerBaseUom } from '../common/normalize';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { computeDeliveredCost } from './delivered-cost';

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
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    const observations = await this.prisma.priceObservation.findMany({
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

    return {
      product,
      baseUom: product?.baseUom ?? null,
      observations: observations.map((o) => ({
        ...o,
        pricePerBaseUom: Number(o.pricePerBaseUom),
      })),
    };
  }

  async compare(user: AuthUser, productIds: string[]) {
    const ids = productIds.filter(Boolean);
    if (ids.length === 0) {
      return { products: [], stores: [], cells: [] };
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
    });

    const rows = await this.prisma.priceObservation.findMany({
      where: {
        householdId: user.householdId,
        productId: { in: ids },
      },
      orderBy: { observedAt: 'desc' },
      include: { store: { select: { id: true, name: true } }, product: true },
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.productId}:${row.storeId}`;
      if (!latest.has(key)) latest.set(key, row);
    }

    const storeMap = new Map<string, { id: string; name: string }>();
    for (const row of latest.values()) {
      storeMap.set(row.storeId, row.store);
    }

    const cells = [...latest.values()].map((row) => ({
      productId: row.productId,
      storeId: row.storeId,
      unitPriceCents: row.unitPriceCents,
      pricePerBaseUom: Number(row.pricePerBaseUom),
      observedAt: row.observedAt,
      baseUom: row.product.baseUom,
    }));

    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        baseUom: p.baseUom,
        sizeValue: p.sizeValue ? Number(p.sizeValue) : null,
        sizeUom: p.sizeUom,
      })),
      stores: [...storeMap.values()],
      cells,
    };
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

  listShippingLanes(destRegion = 'ketchikan') {
    return this.prisma.shippingLane.findMany({
      where: { active: true, destRegion },
      orderBy: { name: 'asc' },
    });
  }

  async deliveredCost(
    user: AuthUser,
    productId: string,
    opts: { laneId?: string; quantity?: number },
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { error: 'Product not found' };

    const quantity = opts.quantity ?? 1;
    const local = await this.prisma.priceObservation.findFirst({
      where: { productId, householdId: user.householdId },
      orderBy: { observedAt: 'desc' },
      include: { store: true },
    });

    const baseline = await this.prisma.baselinePrice.findFirst({
      where: {
        productId,
        region: { in: ['seattle', 'us-national', 'anchorage'] },
      },
      orderBy: { effectiveOn: 'desc' },
    });

    const lane = opts.laneId
      ? await this.prisma.shippingLane.findUnique({ where: { id: opts.laneId } })
      : await this.prisma.shippingLane.findFirst({
          where: { active: true, destRegion: 'ketchikan' },
          orderBy: { flatFeeCents: 'asc' },
        });

    if (!lane || !baseline || !local) {
      return {
        product,
        local,
        baseline,
        lane,
        comparison: null,
        message: 'Need a local observation, baseline price, and shipping lane',
      };
    }

    // Convert baseline pricePerBaseUom (cents per base) back to approx unit cents
    const size = product.sizeValue ? Number(product.sizeValue) : 1;
    const factor = product.baseFactor ? Number(product.baseFactor) : 1;
    const mainlandUnitCents = Math.round(Number(baseline.pricePerBaseUom) * size * factor);

    let weightLb: number | null = null;
    let weightKg: number | null = null;
    if (product.sizeUom === 'lb') weightLb = size * quantity;
    else if (product.sizeUom === 'oz') weightLb = (size / 16) * quantity;
    else if (product.baseUom === 'kg' && factor) weightKg = size * factor * quantity;

    const comparison = computeDeliveredCost({
      mainlandUnitCents,
      quantity,
      weightLb,
      weightKg,
      flatFeeCents: lane.flatFeeCents,
      perLbCents: lane.perLbCents,
      perKgCents: lane.perKgCents,
      localUnitCents: local.unitPriceCents,
    });

    return {
      product: {
        id: product.id,
        name: product.name,
        sizeValue: size,
        sizeUom: product.sizeUom,
      },
      lane,
      baselineRegion: baseline.region,
      mainlandUnitCents,
      localUnitCents: local.unitPriceCents,
      localStore: local.store.name,
      quantity,
      comparison,
    };
  }
}
