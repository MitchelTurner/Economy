import { InsightSeverity } from '@prisma/client';
import { dollars, InsightDraft } from './types';

export type RecurringSeries = {
  rawText: string;
  /** amounts oldest→newest */
  amountsCents: number[];
  periodStart: Date;
  periodEnd: Date;
};

/** A recurring charge's amount changed (same rawText ≥3 times, last ≠ prior median-ish). */
export function evaluateRecurringChange(series: RecurringSeries[]): InsightDraft[] {
  const out: InsightDraft[] = [];
  for (const s of series) {
    if (s.amountsCents.length < 3) continue;
    const prev = s.amountsCents[s.amountsCents.length - 2]!;
    const curr = s.amountsCents[s.amountsCents.length - 1]!;
    if (prev === curr) continue;
    const delta = curr - prev;
    if (Math.abs(delta) < 50) continue; // ignore < $0.50 noise

    out.push({
      type: 'recurring_change',
      severity: delta > 0 ? InsightSeverity.WARNING : InsightSeverity.INFO,
      title: `${s.rawText} amount changed`,
      body: `${s.rawText} moved from ${dollars(prev)} to ${dollars(curr)}.`,
      estimatedSavingsCents: delta > 0 ? delta : null,
      data: {
        rawText: s.rawText,
        previousCents: prev,
        currentCents: curr,
        deltaCents: delta,
        history: s.amountsCents,
      },
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      dedupeKey: `recurring_change:${s.rawText}:${curr}:${s.periodStart.toISOString().slice(0, 10)}`,
    });
  }
  return out;
}
