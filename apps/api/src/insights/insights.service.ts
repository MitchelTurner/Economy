import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { evaluateBudgetPace } from './rules/budget-pace.rule';

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, active = true) {
    return this.prisma.insight.findMany({
      where: {
        householdId: user.householdId,
        ...(active ? { dismissedAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async dismiss(user: AuthUser, id: string) {
    const insight = await this.prisma.insight.findFirst({
      where: { id, householdId: user.householdId },
    });
    if (!insight) throw new NotFoundException('Insight not found');
    return this.prisma.insight.update({
      where: { id },
      data: { dismissedAt: new Date() },
    });
  }

  async generateForHousehold(householdId: string) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    const budgets = await this.prisma.budget.findMany({
      where: { householdId },
      include: { category: true },
    });

    const receipts = await this.prisma.receipt.findMany({
      where: {
        householdId,
        status: ReceiptStatus.CONFIRMED,
        purchasedAt: { gte: periodStart, lte: periodEnd },
      },
      include: { lines: true },
    });

    for (const budget of budgets) {
      let spent = 0;
      for (const r of receipts) {
        for (const l of r.lines) {
          if (budget.categoryId && l.categoryId !== budget.categoryId) continue;
          spent += l.extendedCents - l.discountCents;
        }
      }

      const drafts = evaluateBudgetPace({
        budgetAmountCents: budget.amountCents,
        spentCents: spent,
        periodStart,
        periodEnd,
        today: now,
        categoryLabel: budget.category?.name ?? 'Overall',
      });

      for (const draft of drafts) {
        await this.prisma.insight.upsert({
          where: {
            householdId_dedupeKey_periodStart: {
              householdId,
              dedupeKey: draft.dedupeKey,
              periodStart: draft.periodStart,
            },
          },
          update: {
            title: draft.title,
            body: draft.body,
            severity: draft.severity,
            estimatedSavingsCents: draft.estimatedSavingsCents,
            data: draft.data as Prisma.InputJsonValue,
            periodEnd: draft.periodEnd,
            dismissedAt: null,
          },
          create: {
            householdId,
            type: draft.type,
            severity: draft.severity,
            title: draft.title,
            body: draft.body,
            estimatedSavingsCents: draft.estimatedSavingsCents,
            data: draft.data as Prisma.InputJsonValue,
            periodStart: draft.periodStart,
            periodEnd: draft.periodEnd,
            dedupeKey: draft.dedupeKey,
          },
        });
      }
    }
  }
}
