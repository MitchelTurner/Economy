const LABELS: Record<string, string> = {
  NEEDS_REVIEW: 'Needs review',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
  EXTRACTING: 'Extracting',
  UPLOADED: 'Uploading',
};

/** Friendly label for receipt status enums shown in lists. */
export function receiptStatusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

export function receiptStatusTone(status: string): string {
  if (status === 'FAILED') return 'text-[var(--danger)]';
  if (status === 'NEEDS_REVIEW') return 'text-[var(--warn)]';
  if (status === 'EXTRACTING' || status === 'UPLOADED') return 'text-[var(--brand-soft)]';
  if (status === 'CONFIRMED') return 'text-[var(--ok)]';
  return 'text-[var(--ink-muted)]';
}
