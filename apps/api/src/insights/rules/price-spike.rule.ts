import { InsightSeverity } from '@prisma/client';
import { InsightDraft, median } from './types';

export type PriceSpikeSeries = {
  productId: string;
  productName: string;
  /** pricePerBaseUom observations oldest→newest over ~90 days */
  history: number[];
  current: number;
  periodStart: Date;
  periodEnd: Date;
};

/** Fires when current price is >20% above trailing 90-day median. */
export function evaluatePriceSpike(series: PriceSpikeSeries[]): InsightDraft[] {
  const out: InsightDraft[] = [];
  for (const s of series) {
    if (s.history.length < 3) continue;
    const med = median(s.history);
    if (med == null || med <= 0) continue;
    const pct = ((s.current - med) / med) * 100;
    if (pct <= 20) continue;

    const monthLabel = s.periodStart.toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    out.push({
      type: 'price_spike',
      severity: InsightSeverity.WARNING,
      title: `${s.productName} price spike`,
      body: `${s.productName} is up ${pct.toFixed(0)}% since ${monthLabel}.`,
      estimatedSavingsCents: Math.round(s.current - med),
      data: {
        productId: s.productId,
        productName: s.productName,
        current: s.current,
        median: med,
        pctAboveMedian: pct,
        history: s.history,
      },
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      dedupeKey: `price_spike:${s.productId}:${s.periodStart.toISOString().slice(0, 10)}`,
    });
  }
  return out;
}
