/**
 * Mainland → island delivered cost.
 * delivered = mainlandUnitCents * qty + flatFee + weightFee
 */

export type DeliveredCostInput = {
  mainlandUnitCents: number;
  quantity: number;
  /** Product weight in lb for the ordered quantity (optional). */
  weightLb?: number | null;
  /** Product weight in kg for the ordered quantity (optional). */
  weightKg?: number | null;
  flatFeeCents: number;
  perLbCents: number;
  perKgCents: number;
  localUnitCents: number;
};

export type DeliveredCostResult = {
  mainlandSubtotalCents: number;
  shippingCents: number;
  deliveredTotalCents: number;
  deliveredUnitCents: number;
  localTotalCents: number;
  savingsVsLocalCents: number;
  preferMainland: boolean;
};

export function computeDeliveredCost(input: DeliveredCostInput): DeliveredCostResult {
  const qty = Math.max(0, input.quantity);
  const mainlandSubtotalCents = Math.round(input.mainlandUnitCents * qty);
  const weightFee =
    Math.round((input.weightLb ?? 0) * input.perLbCents) +
    Math.round((input.weightKg ?? 0) * input.perKgCents);
  const shippingCents = input.flatFeeCents + weightFee;
  const deliveredTotalCents = mainlandSubtotalCents + shippingCents;
  const deliveredUnitCents = qty > 0 ? Math.round(deliveredTotalCents / qty) : deliveredTotalCents;
  const localTotalCents = Math.round(input.localUnitCents * qty);
  const savingsVsLocalCents = localTotalCents - deliveredTotalCents;

  return {
    mainlandSubtotalCents,
    shippingCents,
    deliveredTotalCents,
    deliveredUnitCents,
    localTotalCents,
    savingsVsLocalCents,
    preferMainland: savingsVsLocalCents > 0,
  };
}
