import { BadRequestException } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  isStaleExtracting,
  ReceiptsService,
  STALE_EXTRACTING_MS,
} from './receipts.service';

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
          updatedAt: new Date(),
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

  it('allows stale EXTRACTING and rejects fresh in-flight EXTRACTING', async () => {
    const add = vi.fn().mockResolvedValue({});
    const stale = {
      id: 'r1',
      householdId: 'h1',
      status: ReceiptStatus.EXTRACTING,
      imageKey: 'receipts/h1/abc.jpg',
      updatedAt: new Date(Date.now() - STALE_EXTRACTING_MS - 1000),
    };
    const prismaStale = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue(stale),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svcStale = new ReceiptsService(
      prismaStale as never,
      {} as never,
      {} as never,
      { add } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svcStale.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).resolves.toMatchObject({ ok: true });

    const fresh = {
      ...stale,
      updatedAt: new Date(),
    };
    const prismaFresh = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue(fresh),
        update: vi.fn(),
      },
    };
    const svcFresh = new ReceiptsService(
      prismaFresh as never,
      {} as never,
      {} as never,
      { add: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svcFresh.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects manual and non-retryable statuses', async () => {
    const prismaManual = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.FAILED,
          imageKey: 'manual/h1/1',
          updatedAt: new Date(),
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
          updatedAt: new Date(),
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

describe('isStaleExtracting', () => {
  it('is true only for aged EXTRACTING', () => {
    expect(
      isStaleExtracting({
        status: ReceiptStatus.EXTRACTING,
        updatedAt: new Date(Date.now() - STALE_EXTRACTING_MS - 1),
      }),
    ).toBe(true);
    expect(
      isStaleExtracting({
        status: ReceiptStatus.EXTRACTING,
        updatedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      isStaleExtracting({
        status: ReceiptStatus.FAILED,
        updatedAt: new Date(0),
      }),
    ).toBe(false);
  });
});
