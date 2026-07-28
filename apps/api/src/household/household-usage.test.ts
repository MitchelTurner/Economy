import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HouseholdService } from './household.service';

describe('HouseholdService.usage', () => {
  it('returns daily remaining and weekly token totals', async () => {
    const prisma = {
      extractionUsage: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          { inputTokens: 100, outputTokens: 20, model: 'm', createdAt: new Date() },
          { inputTokens: 50, outputTokens: 10, model: 'm', createdAt: new Date() },
        ]),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({ MAX_EXTRACTIONS_PER_DAY: '50' }),
    );
    const usage = await svc.usage({
      userId: 'u1',
      householdId: 'h1',
      email: 'a@b.c',
      role: 'owner',
    });
    expect(usage.extractionsToday).toBe(3);
    expect(usage.remainingToday).toBe(47);
    expect(usage.week.extractions).toBe(2);
    expect(usage.week.inputTokens).toBe(150);
    expect(usage.week.outputTokens).toBe(30);
  });
});
