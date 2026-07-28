import { describe, expect, it, vi } from 'vitest';
import { ReceiptStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ExtractionService } from './extraction.service';

describe('ExtractionService daily cap', () => {
  it('marks receipt FAILED when household hits MAX_EXTRACTIONS_PER_DAY', async () => {
    const update = vi.fn();
    const prisma = {
      receipt: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          imageKey: 'k',
        }),
        update,
      },
      extractionUsage: {
        count: vi.fn().mockResolvedValue(2),
      },
    };
    const storage = { getObjectBuffer: vi.fn() };
    const provider = { extract: vi.fn() };
    const matchQueue = { add: vi.fn() };
    const config = new ConfigService({ MAX_EXTRACTIONS_PER_DAY: '2' });

    const svc = new ExtractionService(
      prisma as never,
      storage as never,
      provider as never,
      config,
      matchQueue as never,
    );

    await svc.processReceipt('r1');

    expect(storage.getObjectBuffer).not.toHaveBeenCalled();
    expect(provider.extract).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: ReceiptStatus.FAILED,
        failureReason: 'Daily extraction cap (2) reached',
      },
    });
  });
});
