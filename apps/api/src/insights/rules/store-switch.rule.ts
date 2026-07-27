import { InsightSeverity } from '@prisma/client';
import { dollars, InsightDraft } from './types';

export type StorePrice = {
  storeId: string;
  storeName: string;
  /** Average pricePerBaseUom over window for this product */
  avgPricePerBaseUom: number;
};

export type StoreSwitchCtx = {
  /** Products in the household's regular basket with prices at 2+ stores */
  basket: Array<{
    productId: string;
    productName: string;
    quantity: number;
    stores: StorePrice[];
  }>;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Same basket of ≥5 matched items at 2+ stores; one store >8% cheaper over last 60 days.
 */
export function evaluateStoreSwitch(ctx: StoreSwitchCtx): InsightDraft[] {
  const multiStore = ctx.basket.filter((b) => b.stores.length >= 2);
  if (multiStore.length < 5) return [];

  const storeIds = new Set<string>();
  for (const item of multiStore) {
    for (const s of item.stores) storeIds.add(s.storeId);
  }
  if (storeIds.size < 2) return [];

  const storeNames = new Map<string, string>();
  const totals = new Map<string, number>();
  for (const id of storeIds) totals.set(id, 0);

  for (const item of multiStore) {
    for (const s of item.stores) {
      storeNames.set(s.storeId, s.storeName);
      totals.set(
        s.storeId,
        (totals.get(s.storeId) ?? 0) + s.avgPricePerBaseUom * item.quantity,
      );
    }
  }

  // Only compare stores that have coverage for all multiStore items
  const fullCoverage = [...storeIds].filter((id) =>
    multiStore.every((item) => item.stores.some((s) => s.storeId === id)),
  );
  if (fullCoverage.length < 2) return [];

  let cheapestId = fullCoverage[0]!;
  let dearestId = fullCoverage[0]!;
  for (const id of fullCoverage) {
    if ((totals.get(id) ?? 0) < (totals.get(cheapestId) ?? Infinity)) cheapestId = id;
    if ((totals.get(id) ?? 0) > (totals.get(dearestId) ?? 0)) dearestId = id;
  }

  const cheap = totals.get(cheapestId) ?? 0;
  const dear = totals.get(dearestId) ?? 0;
  if (dear <= 0) return [];
  const savingsPct = ((dear - cheap) / dear) * 100;
  if (savingsPct <= 8 || cheapestId === dearestId) return [];

  const savingsCents = Math.round(dear - cheap);
  const cheapName = storeNames.get(cheapestId) ?? 'another store';

  return [
    {
      type: 'store_switch',
      severity: InsightSeverity.OPPORTUNITY,
      title: `Save at ${cheapName}`,
      body: `Buying your regular staples at ${cheapName} would have saved ~${dollars(savingsCents)} last month.`,
      estimatedSavingsCents: savingsCents,
      data: {
        cheapestStoreId: cheapestId,
        cheapestStoreName: cheapName,
        basketSize: multiStore.length,
        storeTotals: Object.fromEntries(
          fullCoverage.map((id) => [id, Math.round(totals.get(id) ?? 0)]),
        ),
        savingsPct,
      },
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      dedupeKey: `store_switch:${cheapestId}:${ctx.periodStart.toISOString().slice(0, 10)}`,
    },
  ];
}
