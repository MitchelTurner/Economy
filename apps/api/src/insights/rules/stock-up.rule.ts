import { InsightSeverity } from '@prisma/client';
import { InsightDraft, percentile } from './types';

export type StockUpSeries = {
  productId: string;
  productName: string;
  history: number[];
  current: number;
  purchaseCount90d: number;
  periodStart: Date;
  periodEnd: Date;
};

/** Current price in bottom decile of history and bought regularly (≥3 in 90d). */
export function evaluateStockUp(series: StockUpSeries[]): InsightDraft[] {
  const out: InsightDraft[] = [];
  for (const s of series) {
    if (s.purchaseCount90d < 3 || s.history.length < 5) continue;
    const p10 = percentile(s.history, 0.1);
    if (p10 == null) continue;
    if (s.current > p10) continue;

    const since = s.periodStart.toLocaleString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    });
    out.push({
      type: 'stock_up',
      severity: InsightSeverity.OPPORTUNITY,
      title: `Stock up on ${s.productName}`,
      body: `${s.productName} is at its lowest price since ${since}.`,
      estimatedSavingsCents: Math.round(
        (percentile(s.history, 0.5) ?? s.current) - s.current,
      ),
      data: {
        productId: s.productId,
        productName: s.productName,
        current: s.current,
        p10,
        purchaseCount90d: s.purchaseCount90d,
        history: s.history,
      },
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      dedupeKey: `stock_up:${s.productId}:${s.periodStart.toISOString().slice(0, 10)}`,
    });
  }
  return out;
}
