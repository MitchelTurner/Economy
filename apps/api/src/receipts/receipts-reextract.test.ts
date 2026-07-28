import { BadRequestException } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReceiptsService } from './receipts.service';

describe('ReceiptsService.reextract', () => {
  it('requeues FAILED photo receipts and clears failureReason', async () => {
    const update = vi.fn().mockResolvedValue({});
    const add = vi.fn().mockResolvedValue({});
    const prisma = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.FAILED,
          imageKey: 'receipts/h1/abc.jpg',
          failureReason: 'Daily extraction cap (50) reached',
        }),
        update,
      },
    };
    const svc = new ReceiptsService(
      prisma as never,
      {} as never,
      {} as never,
      { add } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const res = await svc.reextract(
      { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
      'r1',
    );
    expect(res).toEqual({
      ok: true,
      receiptId: 'r1',
      status: ReceiptStatus.UPLOADED,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReceiptStatus.UPLOADED, failureReason: null },
    });
    expect(add).toHaveBeenCalledWith(
      'extract',
      { receiptId: 'r1' },
      expect.objectContaining({ attempts: 2 }),
    );
  });

  it('rejects manual and non-retryable statuses', async () => {
    const prismaManual = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.FAILED,
          imageKey: 'manual/h1/1',
        }),
      },
    };
    const svcManual = new ReceiptsService(
      prismaManual as never,
      {} as never,
      {} as never,
      { add: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svcManual.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const prismaConfirmed = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.CONFIRMED,
          imageKey: 'receipts/h1/abc.jpg',
        }),
      },
    };
    const svcConfirmed = new ReceiptsService(
      prismaConfirmed as never,
      {} as never,
      {} as never,
      { add: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svcConfirmed.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
