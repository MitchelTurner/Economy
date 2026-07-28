import { ReceiptStatus } from '@prisma/client';

/** How long EXTRACTING may sit before cleanup/reextract treat it as stuck. */
export const STALE_EXTRACTING_MS = 5 * 60 * 1000;

export function isStaleExtracting(
  receipt: { status: ReceiptStatus; updatedAt: Date },
  now = Date.now(),
): boolean {
  return (
    receipt.status === ReceiptStatus.EXTRACTING &&
    now - receipt.updatedAt.getTime() >= STALE_EXTRACTING_MS
  );
}
