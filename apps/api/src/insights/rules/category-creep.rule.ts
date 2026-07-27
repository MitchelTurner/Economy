import { InsightSeverity } from '@prisma/client';
import { dollars, InsightDraft } from './types';

export type CategoryMonth = {
  categoryId: string;
  categoryName: string;
  /** YYYY-MM oldest → newest (need ≥3 months) */
  months: Array<{
    key: string;
    spendCents: number;
    /** Spend holding prior-month quantities at current prices (inflation component) */
    fixedBasketSpendCents: number;
  }>;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Category spend up >15% for 2 consecutive months, controlling for the index.
 * Distinguishes "prices rose" from "you bought more".
 */
export function evaluateCategoryCreep(cats: CategoryMonth[]): InsightDraft[] {
  const out: InsightDraft[] = [];

  for (const cat of cats) {
    if (cat.months.length < 3) continue;
    const m0 = cat.months[cat.months.length - 3]!;
    const m1 = cat.months[cat.months.length - 2]!;
    const m2 = cat.months[cat.months.length - 1]!;

    const growth01 = m0.spendCents > 0 ? (m1.spendCents - m0.spendCents) / m0.spendCents : 0;
    const growth12 = m1.spendCents > 0 ? (m2.spendCents - m1.spendCents) / m1.spendCents : 0;
    if (growth01 <= 0.15 || growth12 <= 0.15) continue;

    // Behavior gap: total Δspend minus fixed-basket (price) Δspend on latest step
    const deltaTotal = m2.spendCents - m1.spendCents;
    const deltaPrice = m2.fixedBasketSpendCents - m1.spendCents;
    const deltaBehavior = deltaTotal - deltaPrice;

    out.push({
      type: 'category_creep',
      severity: InsightSeverity.WARNING,
      title: `${cat.categoryName} spending creep`,
      body:
        deltaBehavior > deltaPrice
          ? `${cat.categoryName} spend rose for two months — mostly more volume (${dollars(deltaBehavior)}), not just prices (${dollars(Math.max(0, deltaPrice))}).`
          : `${cat.categoryName} spend rose for two months — mostly prices (${dollars(Math.max(0, deltaPrice))}), with ${dollars(deltaBehavior)} from behavior.`,
      estimatedSavingsCents: Math.max(0, deltaBehavior),
      data: {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        months: cat.months,
        growth01,
        growth12,
        deltaTotal,
        deltaPrice,
        deltaBehavior,
      },
      periodStart: cat.periodStart,
      periodEnd: cat.periodEnd,
      dedupeKey: `category_creep:${cat.categoryId}:${m2.key}`,
    });
  }

  return out;
}
