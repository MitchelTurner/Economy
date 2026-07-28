import { describe, expect, it, vi } from 'vitest';
import { InsightsGenerateProcessor } from './insights-generate.processor';

describe('InsightsGenerateProcessor', () => {
  it('weekly-all fans out with sendDigest true', async () => {
    const enqueueAllHouseholdInsights = vi.fn().mockResolvedValue(undefined);
    const proc = new InsightsGenerateProcessor(
      { generateForHousehold: vi.fn(), emailWeeklyDigest: vi.fn() } as never,
      { enqueueAllHouseholdInsights } as never,
    );
    const result = await proc.process({
      data: { allHouseholds: true },
    } as never);
    expect(result).toEqual({ fannedOut: true });
    expect(enqueueAllHouseholdInsights).toHaveBeenCalledWith({ sendDigest: true });
  });

  it('household job with sendDigest emails weekly digest', async () => {
    const generateForHousehold = vi.fn().mockResolvedValue({ upserted: 2 });
    const emailWeeklyDigest = vi.fn().mockResolvedValue({ sent: true });
    const proc = new InsightsGenerateProcessor(
      { generateForHousehold, emailWeeklyDigest } as never,
      { enqueueAllHouseholdInsights: vi.fn() } as never,
    );
    const result = await proc.process({
      data: { householdId: 'h1', sendDigest: true },
    } as never);
    expect(generateForHousehold).toHaveBeenCalledWith('h1');
    expect(emailWeeklyDigest).toHaveBeenCalledWith('h1');
    expect(result).toMatchObject({ upserted: 2, digest: { sent: true } });
  });
});
