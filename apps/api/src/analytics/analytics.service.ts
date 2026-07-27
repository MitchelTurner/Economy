import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ReceiptStatus } from '@prisma/client';

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

    const buckets = new Map<
      string,
      { key: string; label: string; totalCents: number; lineCount: number }
    >();

    for (const receipt of receipts) {
      for (const line of receipt.lines) {
        const net = line.extendedCents - line.discountCents;
        let key: string;
        let label: string;
        if (groupBy === 'store') {
          key = receipt.storeId ?? 'unknown';
          label = receipt.store?.name ?? 'Unknown store';
        } else if (groupBy === 'month') {
          const d = receipt.purchasedAt ?? receipt.createdAt;
          key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          label = key;
        } else {
          key = line.categoryId ?? 'uncategorized';
          label = line.category?.name ?? 'Uncategorized';
        }
        const cur = buckets.get(key) ?? { key, label, totalCents: 0, lineCount: 0 };
        cur.totalCents += net;
        cur.lineCount += 1;
        buckets.set(key, cur);
      }
    }

    const groups = [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
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

    if (receipts.length === 0) {
      return {
        tripCount: 0,
        avgBasketCents: 0,
        avgLinesPerTrip: 0,
        storeMix: [],
        recurringItems: [],
      };
    }

    const basketTotals = receipts.map((r) =>
      r.lines.reduce((s, l) => s + l.extendedCents - l.discountCents, 0),
    );
    const avgBasketCents = Math.round(
      basketTotals.reduce((a, b) => a + b, 0) / basketTotals.length,
    );
    const avgLinesPerTrip =
      receipts.reduce((s, r) => s + r.lines.length, 0) / receipts.length;

    const storeCounts = new Map<string, { name: string; count: number }>();
    for (const r of receipts) {
      const key = r.storeId ?? 'unknown';
      const cur = storeCounts.get(key) ?? { name: r.store?.name ?? 'Unknown', count: 0 };
      cur.count += 1;
      storeCounts.set(key, cur);
    }

    const itemFreq = new Map<string, number>();
    for (const r of receipts) {
      for (const l of r.lines) {
        itemFreq.set(l.rawText, (itemFreq.get(l.rawText) ?? 0) + 1);
      }
    }
    const recurringItems = [...itemFreq.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([rawText, count]) => ({ rawText, count }));

    return {
      tripCount: receipts.length,
      avgBasketCents,
      avgLinesPerTrip: Math.round(avgLinesPerTrip * 10) / 10,
      storeMix: [...storeCounts.values()].sort((a, b) => b.count - a.count),
      recurringItems,
    };
  }
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
