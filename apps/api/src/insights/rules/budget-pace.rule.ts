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

export type BudgetPaceCtx = {
  budgetAmountCents: number;
  spentCents: number;
  periodStart: Date;
  periodEnd: Date;
  today: Date;
  categoryLabel: string;
};

/** Fires when spend-to-date projects over budget for the period. */
export function evaluateBudgetPace(ctx: BudgetPaceCtx): InsightDraft[] {
  const totalMs = ctx.periodEnd.getTime() - ctx.periodStart.getTime();
  const elapsedMs = Math.max(0, ctx.today.getTime() - ctx.periodStart.getTime());
  if (totalMs <= 0) return [];

  const fraction = Math.min(1, elapsedMs / totalMs);
  if (fraction <= 0) return [];

  const projected = Math.round(ctx.spentCents / fraction);
  if (projected <= ctx.budgetAmountCents) return [];

  const overBy = projected - ctx.budgetAmountCents;
  return [
    {
      type: 'budget_pace',
      severity: InsightSeverity.WARNING,
      title: `${ctx.categoryLabel} budget off pace`,
      body: `On pace for $${(projected / 100).toFixed(2)} against a $${(ctx.budgetAmountCents / 100).toFixed(2)} ${ctx.categoryLabel.toLowerCase()} budget.`,
      estimatedSavingsCents: overBy,
      data: {
        spentCents: ctx.spentCents,
        budgetAmountCents: ctx.budgetAmountCents,
        projectedCents: projected,
        fractionElapsed: fraction,
      },
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
      dedupeKey: `budget_pace:${ctx.categoryLabel}:${ctx.periodStart.toISOString().slice(0, 10)}`,
    },
  ];
}
