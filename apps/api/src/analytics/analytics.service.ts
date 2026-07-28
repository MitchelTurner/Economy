import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ReceiptStatus } from '@prisma/client';
import {
  bucketSpendLines,
  summarizeHabits,
  type SpendLineInput,
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
    for (const receipt of receipts) {
      for (const line of receipt.lines) {
        lines.push({
          netCents: line.extendedCents - line.discountCents,
          categoryId: line.categoryId,
          categoryName: line.category?.name ?? null,
          storeId: receipt.storeId,
          storeName: receipt.store?.name ?? null,
          purchasedAt: receipt.purchasedAt ?? receipt.createdAt,
        });
      }
    }

    const groups = bucketSpendLines(lines, groupBy);
    const totalCents = groups.reduce((s, g) => s + g.totalCents, 0);
    return { from, to, groupBy, totalCents, groups };
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
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
