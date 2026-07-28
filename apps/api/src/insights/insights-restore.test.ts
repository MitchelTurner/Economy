import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InsightsService } from './insights.service';

describe('InsightsService.restore', () => {
  it('clears dismissedAt for a household insight', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'i1',
      dismissedAt: null,
      title: 'Milk jumped',
    });
    const prisma = {
      insight: {
        findFirst: vi.fn().mockResolvedValue({ id: 'i1', householdId: 'h1' }),
        update,
      },
    };
    const svc = new InsightsService(
      prisma as never,
      { narrate: vi.fn() } as never,
      { sendDigest: vi.fn() } as never,
    );
    const row = await svc.restore(
      { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
      'i1',
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { dismissedAt: null },
    });
    expect(row.dismissedAt).toBeNull();
  });

  it('404s when insight is outside the household', async () => {
    const prisma = {
      insight: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const svc = new InsightsService(
      prisma as never,
      { narrate: vi.fn() } as never,
      { sendDigest: vi.fn() } as never,
    );
    await expect(
      svc.restore(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
