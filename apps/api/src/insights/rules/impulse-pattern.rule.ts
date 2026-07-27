import { InsightSeverity } from '@prisma/client';
import { dollars, InsightDraft } from './types';

export type Trip = {
  purchasedAt: Date;
  basketCents: number;
  lineCount: number;
};

/**
 * Basket size correlates with time-of-day or trip frequency — habit nudge.
 * Heuristic: evening trips (local hour ≥ 17) average ≥25% larger than daytime,
 * with ≥4 trips in each bucket.
 */
export function evaluateImpulsePattern(
  trips: Trip[],
  periodStart: Date,
  periodEnd: Date,
): InsightDraft[] {
  if (trips.length < 8) return [];

  const day: number[] = [];
  const evening: number[] = [];
  for (const t of trips) {
    const hour = t.purchasedAt.getUTCHours();
    if (hour >= 17) evening.push(t.basketCents);
    else day.push(t.basketCents);
  }
  if (day.length < 4 || evening.length < 4) return [];

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const dayAvg = avg(day);
  const eveAvg = avg(evening);
  if (dayAvg <= 0) return [];
  const lift = (eveAvg - dayAvg) / dayAvg;
  if (lift < 0.25) return [];

  const extra = Math.round(eveAvg - dayAvg);
  return [
    {
      type: 'impulse_pattern',
      severity: InsightSeverity.INFO,
      title: 'Evening trips run larger',
      body: `Evening shopping baskets average ${dollars(Math.round(eveAvg))} vs ${dollars(Math.round(dayAvg))} earlier in the day.`,
      estimatedSavingsCents: extra,
      data: {
        dayAvgCents: Math.round(dayAvg),
        eveningAvgCents: Math.round(eveAvg),
        liftPct: lift * 100,
        dayTrips: day.length,
        eveningTrips: evening.length,
      },
      periodStart,
      periodEnd,
      dedupeKey: `impulse_pattern:${periodStart.toISOString().slice(0, 10)}`,
    },
  ];
}
