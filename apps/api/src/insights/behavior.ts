/**
 * Separating price inflation from behavior change (SPEC §8).
 * Δspend_total vs Δspend holding quantities fixed at the prior period's basket.
 */

export type BasketLine = {
  key: string; // productId or normalized rawText
  quantity: number;
  unitPriceCents: number;
};

export type BehaviorDelta = {
  priorSpendCents: number;
  currentSpendCents: number;
  deltaTotalCents: number;
  /** Prior quantities × current prices */
  fixedBasketCurrentCents: number;
  deltaPriceCents: number;
  deltaBehaviorCents: number;
};

export function analyzeBehaviorChange(
  prior: BasketLine[],
  current: BasketLine[],
): BehaviorDelta {
  const priorSpendCents = prior.reduce(
    (s, l) => s + Math.round(l.quantity * l.unitPriceCents),
    0,
  );
  const currentSpendCents = current.reduce(
    (s, l) => s + Math.round(l.quantity * l.unitPriceCents),
    0,
  );

  const currentPrice = new Map(current.map((l) => [l.key, l.unitPriceCents]));
  let fixedBasketCurrentCents = 0;
  for (const l of prior) {
    const price = currentPrice.get(l.key) ?? l.unitPriceCents;
    fixedBasketCurrentCents += Math.round(l.quantity * price);
  }

  const deltaTotalCents = currentSpendCents - priorSpendCents;
  const deltaPriceCents = fixedBasketCurrentCents - priorSpendCents;
  const deltaBehaviorCents = deltaTotalCents - deltaPriceCents;

  return {
    priorSpendCents,
    currentSpendCents,
    deltaTotalCents,
    fixedBasketCurrentCents,
    deltaPriceCents,
    deltaBehaviorCents,
  };
}
