import { describe, expect, it, vi } from 'vitest';
import { InsightsService } from './insights.service';

describe('InsightsService.emailWeeklyDigest prefs', () => {
  it('skips members with emailDigest false', async () => {
    const sendWeeklyDigest = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      household: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'h1',
          name: 'Demo',
          users: [
            { email: 'on@example.com', displayName: 'On', emailDigest: true },
            { email: 'off@example.com', displayName: 'Off', emailDigest: false },
          ],
        }),
      },
      insight: {
        findMany: vi.fn().mockResolvedValue([
          { title: 'Tip', body: 'Body', estimatedSavingsCents: 100 },
        ]),
      },
    };
    const svc = new InsightsService(
      prisma as never,
      { narrateMany: vi.fn() } as never,
      { sendWeeklyDigest } as never,
    );
    const result = await svc.emailWeeklyDigest('h1');
    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(sendWeeklyDigest).toHaveBeenCalledOnce();
    expect(sendWeeklyDigest.mock.calls[0]![0].to).toBe('on@example.com');
  });
});
