import { InsightSeverity } from '@prisma/client';
import { InsightDraft } from './types';

export type IslandPremiumItem = {
  productId: string;
  productName: string;
  localPricePerBaseUom: number;
  baselinePricePerBaseUom: number;
  baselineRegion: string;
  periodStart: Date;
  periodEnd: Date;
};

/** Local exceeds baseline by >30%. */
export function evaluateIslandPremium(items: IslandPremiumItem[]): InsightDraft[] {
  const out: InsightDraft[] = [];
  for (const item of items) {
    if (item.baselinePricePerBaseUom <= 0) continue;
    const pct =
      ((item.localPricePerBaseUom - item.baselinePricePerBaseUom) /
        item.baselinePricePerBaseUom) *
      100;
    if (pct <= 30) continue;

    const premiumCents = Math.round(
      item.localPricePerBaseUom - item.baselinePricePerBaseUom,
    );
    out.push({
      type: 'island_premium',
      severity: InsightSeverity.INFO,
      title: `${item.productName} island premium`,
      body: `${item.productName} runs ${pct.toFixed(0)}% above ${item.baselineRegion} — a candidate for bulk/mainland ordering.`,
      estimatedSavingsCents: premiumCents,
      data: {
        productId: item.productId,
        productName: item.productName,
        local: item.localPricePerBaseUom,
        baseline: item.baselinePricePerBaseUom,
        baselineRegion: item.baselineRegion,
        premiumPct: pct,
      },
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      dedupeKey: `island_premium:${item.productId}:${item.periodStart.toISOString().slice(0, 10)}`,
    });
  }
  return out;
}
