import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { normalizeRawText } from '../common/normalize';
import { NotificationsService } from '../notifications/notifications.service';
import { NarrationService } from './narration.service';
import { InsightDraft } from './rules/types';
import { evaluateBudgetPace } from './rules/budget-pace.rule';
import { evaluatePriceSpike } from './rules/price-spike.rule';
import { evaluateStockUp } from './rules/stock-up.rule';
import { evaluateStoreSwitch } from './rules/store-switch.rule';
import { evaluateIslandPremium } from './rules/island-premium.rule';
import { evaluateCategoryCreep } from './rules/category-creep.rule';
import { evaluateRecurringChange } from './rules/recurring-change.rule';
import { evaluateImpulsePattern } from './rules/impulse-pattern.rule';
import { analyzeBehaviorChange } from './behavior';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly narration: NarrationService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, active = true) {
    return this.prisma.insight.findMany({
      where: {
        householdId: user.householdId,
        ...(active
          ? { dismissedAt: null }
          : { dismissedAt: { not: null } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async dismiss(user: AuthUser, id: string) {
    const insight = await this.prisma.insight.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!insight) throw new NotFoundException('Insight not found');
    return this.prisma.insight.update({
      where: { id },
      data: { dismissedAt: new Date() },
    });
  }

  async restore(user: AuthUser, id: string) {
    const insight = await this.prisma.insight.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!insight) throw new NotFoundException('Insight not found');
    return this.prisma.insight.update({
      where: { id },
      data: { dismissedAt: null },
    });
  }

  async weeklyDigest(user: AuthUser) {
    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const insights = await this.prisma.insight.findMany({
      where: {
        householdId: user.householdId,
        dismissedAt: null,
        createdAt: { gte: weekAgo },
      },
      orderBy: [{ severity: 'desc' }, { estimatedSavingsCents: 'desc' }],
      take: 20,
    });
    const savings = insights.reduce(
      (s, i) => s + (i.estimatedSavingsCents ?? 0),
      0,
    );
    const aiSummary = await this.narration.summarizeDigest(
      insights.map((i) => ({
        title: i.title,
        body: i.body,
        type: i.type,
        estimatedSavingsCents: i.estimatedSavingsCents,
      })),
      savings,
    );
    return {
      generatedAt: new Date(),
      insightCount: insights.length,
      estimatedSavingsCents: savings,
      aiSummary,
      narrationEnabled: this.narration.isEnabled(),
      insights,
    };
  }

  async behaviorSummary(user: AuthUser) {
    const now = new Date();
    const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const priorStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const priorEnd = new Date(thisStart.getTime() - 1);

    const [priorLines, currentLines] = await Promise.all([
      this.loadBasketLines(user.householdId, priorStart, priorEnd),
      this.loadBasketLines(user.householdId, thisStart, now),
    ]);

    return analyzeBehaviorChange(priorLines, currentLines);
  }

  async generateForHousehold(householdId: string) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const day90 = new Date(now);
    day90.setUTCDate(day90.getUTCDate() - 90);
    const day60 = new Date(now);
    day60.setUTCDate(day60.getUTCDate() - 60);

    const drafts: InsightDraft[] = [];

    // --- budget_pace ---
    const budgets = await this.prisma.budget.findMany({
      where: { householdId },
      include: { category: true },
    });
    const monthReceipts = await this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: periodStart, lte: periodEnd },
      },
      include: { lines: true, store: true },
    });
    for (const budget of budgets) {
      let spent = 0;
      for (const r of monthReceipts) {
        for (const l of r.lines) {
          if (budget.categoryId && l.categoryId !== budget.categoryId) continue;
          spent += l.extendedCents - l.discountCents;
        }
      }
      drafts.push(
        ...evaluateBudgetPace({
          budgetAmountCents: budget.amountCents,
          spentCents: spent,
          periodStart,
          periodEnd,
          today: now,
          categoryLabel: budget.category?.name ?? 'Overall',
        }),
      );
    }

    // --- price_spike + stock_up from observations ---
    const observations = await this.prisma.priceObservation.findMany({
      where: { householdId, observedAt: { gte: day90 } },
      include: { product: true },
      orderBy: { observedAt: 'asc' },
    });
    const byProduct = new Map<
      string,
      { name: string; history: number[]; current: number; count: number }
    >();
    for (const o of observations) {
      const price = Number(o.pricePerBaseUom);
      const cur = byProduct.get(o.productId) ?? {
        name: o.product.name,
        history: [] as number[],
        current: price,
        count: 0,
      };
      cur.history.push(price);
      cur.current = price;
      cur.count += 1;
      byProduct.set(o.productId, cur);
    }
    const spikeSeries = [...byProduct.entries()].map(([productId, v]) => ({
      productId,
      productName: v.name,
      history: v.history.slice(0, -1),
      current: v.current,
      periodStart: day90,
      periodEnd: now,
    }));
    drafts.push(...evaluatePriceSpike(spikeSeries));
    drafts.push(
      ...evaluateStockUp(
        [...byProduct.entries()].map(([productId, v]) => ({
          productId,
          productName: v.name,
          history: v.history,
          current: v.current,
          purchaseCount90d: v.count,
          periodStart: day90,
          periodEnd: now,
        })),
      ),
    );

    // --- store_switch ---
    const recentObs = await this.prisma.priceObservation.findMany({
      where: { householdId, observedAt: { gte: day60 } },
      include: { product: true, store: true },
    });
    const productStore = new Map<
      string,
      {
        name: string;
        stores: Map<string, { name: string; prices: number[] }>;
        qty: number;
      }
    >();
    for (const o of recentObs) {
      const entry = productStore.get(o.productId) ?? {
        name: o.product.name,
        stores: new Map(),
        qty: 1,
      };
      const st = entry.stores.get(o.storeId) ?? { name: o.store.name, prices: [] };
      st.prices.push(Number(o.pricePerBaseUom));
      entry.stores.set(o.storeId, st);
      entry.qty += 1;
      productStore.set(o.productId, entry);
    }
    // Regular items: seen ≥2 times
    const basket = [...productStore.entries()]
      .filter(([, v]) => v.qty >= 2 && v.stores.size >= 1)
      .map(([productId, v]) => ({
        productId,
        productName: v.name,
        quantity: 1,
        stores: [...v.stores.entries()].map(([storeId, s]) => ({
          storeId,
          storeName: s.name,
          avgPricePerBaseUom:
            s.prices.reduce((a, b) => a + b, 0) / Math.max(1, s.prices.length),
        })),
      }));
    drafts.push(
      ...evaluateStoreSwitch({ basket, periodStart: day60, periodEnd: now }),
    );

    // --- island_premium ---
    const baselines = await this.prisma.baselinePrice.findMany({
      include: { product: true },
      orderBy: { effectiveOn: 'desc' },
    });
    const latestBaseline = new Map<string, (typeof baselines)[number]>();
    for (const b of baselines) {
      if (!latestBaseline.has(b.productId)) latestBaseline.set(b.productId, b);
    }
    const premiumItems = [...byProduct.entries()]
      .map(([productId, v]) => {
        const base = latestBaseline.get(productId);
        if (!base) return null;
        return {
          productId,
          productName: v.name,
          localPricePerBaseUom: v.current,
          baselinePricePerBaseUom: Number(base.pricePerBaseUom),
          baselineRegion: base.region,
          periodStart,
          periodEnd,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    drafts.push(...evaluateIslandPremium(premiumItems));

    // --- category_creep ---
    drafts.push(...(await this.buildCategoryCreep(householdId, periodStart, periodEnd)));

    // --- recurring_change ---
    const lookback = new Date(now);
    lookback.setUTCMonth(lookback.getUTCMonth() - 6);
    const allLines = await this.prisma.receiptLine.findMany({
      where: {
        receipt: {
          householdId,
          status: ReceiptStatus.CONFIRMED,
          purchasedAt: { gte: lookback },
        },
      },
      include: { receipt: { select: { purchasedAt: true } } },
      orderBy: { receipt: { purchasedAt: 'asc' } },
    });
    const recurring = new Map<string, number[]>();
    for (const l of allLines) {
      const key = normalizeRawText(l.rawText);
      const arr = recurring.get(key) ?? [];
      arr.push(l.extendedCents - l.discountCents);
      recurring.set(key, arr);
    }
    drafts.push(
      ...evaluateRecurringChange(
        [...recurring.entries()]
          .filter(([, amts]) => amts.length >= 3)
          .map(([rawText, amountsCents]) => ({
            rawText,
            amountsCents,
            periodStart,
            periodEnd,
          })),
      ),
    );

    // --- impulse_pattern ---
    const trips = monthReceipts.length >= 8 ? monthReceipts : await this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: lookback },
      },
      include: { lines: true },
    });
    drafts.push(
      ...evaluateImpulsePattern(
        trips.map((r) => ({
          purchasedAt: r.purchasedAt ?? r.createdAt,
          basketCents: r.lines.reduce(
            (s, l) => s + l.extendedCents - l.discountCents,
            0,
          ),
          lineCount: r.lines.length,
        })),
        periodStart,
        periodEnd,
      ),
    );

    const narrated = await this.narration.narrateMany(drafts);

    let upserted = 0;
    for (const draft of narrated) {
      // Normalize to UTC midnight so repeatable jobs don't mint new rows each run
      const periodStart = startOfUtcDay(draft.periodStart);
      const periodEnd = draft.periodEnd;
      await this.prisma.insight.upsert({
        where: {
          householdId_dedupeKey_periodStart: {
            householdId,
            dedupeKey: draft.dedupeKey,
            periodStart,
          },
        },
        update: {
          title: draft.title,
          body: draft.body,
          severity: draft.severity,
          estimatedSavingsCents: draft.estimatedSavingsCents,
          data: draft.data as Prisma.InputJsonValue,
          periodEnd,
          // Keep dismissed if user already dismissed this dedupe key this period
        },
        create: {
          householdId,
          type: draft.type,
          severity: draft.severity,
          title: draft.title,
          body: draft.body,
          estimatedSavingsCents: draft.estimatedSavingsCents,
          data: draft.data as Prisma.InputJsonValue,
          periodStart,
          periodEnd,
          dedupeKey: draft.dedupeKey,
        },
      });
      upserted += 1;
    }

    this.logger.log(`Generated/upserted ${upserted} insights for ${householdId}`);
    return { upserted };
  }

  /** After weekly generation: email each household member who opted into digests. */
  async emailWeeklyDigest(householdId: string) {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        users: {
          select: { email: true, displayName: true, emailDigest: true },
        },
      },
    });
    if (!household?.users.length) return { sent: 0, skipped: 0 };

    const weekAgo = new Date();
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const insights = await this.prisma.insight.findMany({
      where: {
        householdId,
        dismissedAt: null,
        createdAt: { gte: weekAgo },
      },
      orderBy: [{ severity: 'desc' }, { estimatedSavingsCents: 'desc' }],
      take: 20,
    });
    const savings = insights.reduce(
      (s, i) => s + (i.estimatedSavingsCents ?? 0),
      0,
    );
    const aiSummary =
      (await this.narration.summarizeDigest(
        insights.map((i) => ({
          title: i.title,
          body: i.body,
          type: i.type,
          estimatedSavingsCents: i.estimatedSavingsCents,
        })),
        savings,
      )) ?? undefined;

    let sent = 0;
    let skipped = 0;
    for (const user of household.users) {
      if (!user.emailDigest) {
        skipped += 1;
        continue;
      }
      await this.notifications.sendWeeklyDigest({
        to: user.email,
        householdName: household.name,
        insightCount: insights.length,
        estimatedSavingsCents: savings,
        aiSummary,
        highlights: insights.map((i) => ({ title: i.title, body: i.body })),
      });
      sent += 1;
    }
    return { sent, skipped };
  }

  private async loadBasketLines(householdId: string, from: Date, to: Date) {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: from, lte: to },
      },
      include: { lines: true },
    });
    const map = new Map<string, { quantity: number; unitPriceCents: number }>();
    for (const r of receipts) {
      for (const l of r.lines) {
        const key = l.productId ?? normalizeRawText(l.rawText);
        const qty = Number(l.quantity);
        const unit =
          l.unitPriceCents ??
          (qty ? Math.round(l.extendedCents / qty) : l.extendedCents);
        const cur = map.get(key) ?? { quantity: 0, unitPriceCents: unit };
        cur.quantity += qty;
        cur.unitPriceCents = unit;
        map.set(key, cur);
      }
    }
    return [...map.entries()].map(([key, v]) => ({
      key,
      quantity: v.quantity,
      unitPriceCents: v.unitPriceCents,
    }));
  }

  private async buildCategoryCreep(
    householdId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const start = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 2, 1));
    const receipts = await this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: start, lte: periodEnd },
      },
      include: { lines: { include: { category: true, product: true } } },
    });

    type MonthAgg = {
      spendCents: number;
      lines: Array<{ key: string; quantity: number; unitPriceCents: number }>;
    };
    const byCat = new Map<string, { name: string; months: Map<string, MonthAgg> }>();

    for (const r of receipts) {
      const d = r.purchasedAt ?? r.createdAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      for (const l of r.lines) {
        const catId = l.categoryId ?? 'uncategorized';
        const catName = l.category?.name ?? 'Uncategorized';
        const entry = byCat.get(catId) ?? { name: catName, months: new Map() };
        const month = entry.months.get(key) ?? { spendCents: 0, lines: [] };
        const qty = Number(l.quantity);
        const unit =
          l.unitPriceCents ??
          (qty ? Math.round(l.extendedCents / qty) : l.extendedCents);
        month.spendCents += l.extendedCents - l.discountCents;
        month.lines.push({
          key: l.productId ?? normalizeRawText(l.rawText),
          quantity: qty,
          unitPriceCents: unit,
        });
        entry.months.set(key, month);
        byCat.set(catId, entry);
      }
    }

    const cats = [...byCat.entries()].map(([categoryId, v]) => {
      const keys = [...v.months.keys()].sort();
      const months = keys.map((k, i) => {
        const m = v.months.get(k)!;
        const prior = i > 0 ? v.months.get(keys[i - 1]!) : null;
        let fixedBasketSpendCents = m.spendCents;
        if (prior) {
          const prices = new Map(m.lines.map((l) => [l.key, l.unitPriceCents]));
          fixedBasketSpendCents = prior.lines.reduce((s, l) => {
            const price = prices.get(l.key) ?? l.unitPriceCents;
            return s + Math.round(l.quantity * price);
          }, 0);
        }
        return { key: k, spendCents: m.spendCents, fixedBasketSpendCents };
      });
      return {
        categoryId,
        categoryName: v.name,
        months,
        periodStart: start,
        periodEnd,
      };
    });

    return evaluateCategoryCreep(cats);
  }
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
