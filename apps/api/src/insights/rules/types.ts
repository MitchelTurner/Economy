import { InsightSeverity } from '@prisma/client';

export type InsightDraft = {
  type: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  estimatedSavingsCents?: number | null;
  data: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
  dedupeKey: string;
};

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}
