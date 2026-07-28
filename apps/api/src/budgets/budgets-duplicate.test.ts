import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BudgetsService } from './budgets.service';

describe('BudgetsService.create', () => {
  it('rejects duplicate household+category+period', async () => {
    const prisma = {
      budget: {
        findFirst: vi.fn().mockResolvedValue({ id: 'b1' }),
        create: vi.fn(),
      },
    };
    const svc = new BudgetsService(prisma as never);
    await expect(
      svc.create(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        {
          amountCents: 25000,
          period: 'MONTHLY',
          categoryId: 'c1',
          startsOn: '2026-07-01T00:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });
});
