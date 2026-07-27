/** Centralized currency formatting — never render raw cents. */

export function formatCents(cents: number | null | undefined, opts?: { signed?: boolean }) {
  if (cents == null || Number.isNaN(cents)) return '—';
  const value = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(value));
  if (opts?.signed) {
    if (cents > 0) return `+${formatted}`;
    if (cents < 0) return `-${formatted}`;
  }
  return cents < 0 ? `-${formatted}` : formatted;
}

export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}
