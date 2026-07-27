/** Money helpers — all amounts are integer cents. Never use Float for money. */

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Receipt arithmetic gate (SPEC §6):
 * sum(extendedCents) - sum(discountCents) + taxCents ≈ totalCents within ±toleranceCents
 */
export function receiptArithmeticOk(input: {
  lines: Array<{ extendedCents: number; discountCents: number }>;
  taxCents: number | null | undefined;
  totalCents: number | null | undefined;
  toleranceCents?: number;
}): { ok: boolean; computedTotalCents: number; deltaCents: number | null } {
  const tolerance = input.toleranceCents ?? 2;
  const lineSum = sumCents(
    input.lines.map((l) => l.extendedCents - (l.discountCents ?? 0)),
  );
  const tax = input.taxCents ?? 0;
  const computedTotalCents = lineSum + tax;

  if (input.totalCents == null) {
    return { ok: false, computedTotalCents, deltaCents: null };
  }

  const deltaCents = computedTotalCents - input.totalCents;
  return {
    ok: Math.abs(deltaCents) <= tolerance,
    computedTotalCents,
    deltaCents,
  };
}

/** Rank lines by how far unit/extended pricing looks implausible (for review highlighting). */
export function rankImplausibleLines(
  lines: Array<{
    lineNumber: number;
    quantity: number;
    unitPriceCents: number | null;
    extendedCents: number;
  }>,
): number[] {
  return [...lines]
    .map((l) => {
      if (l.unitPriceCents == null || l.quantity === 0) {
        return { lineNumber: l.lineNumber, error: Math.abs(l.extendedCents) };
      }
      const expected = Math.round(l.unitPriceCents * l.quantity);
      return { lineNumber: l.lineNumber, error: Math.abs(expected - l.extendedCents) };
    })
    .sort((a, b) => b.error - a.error)
    .map((x) => x.lineNumber);
}
