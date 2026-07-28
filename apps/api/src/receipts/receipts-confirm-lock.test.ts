import { BadRequestException } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReceiptsService } from './receipts.service';

function makeSvc(prisma: unknown, queues?: Partial<{ observe: { add: ReturnType<typeof vi.fn> }; match: { add: ReturnType<typeof vi.fn> }; insights: { add: ReturnType<typeof vi.fn> }; extract: { add: ReturnType<typeof vi.fn> } }>) {
  return new ReceiptsService(
    prisma as never,
    {} as never,
    {} as never,
    (queues?.extract ?? { add: vi.fn() }) as never,
    (queues?.match ?? { add: vi.fn() }) as never,
    (queues?.observe ?? { add: vi.fn() }) as never,
    (queues?.insights ?? { add: vi.fn() }) as never,
  );
}

describe('ReceiptsService.confirm / confirmed lock', () => {
  it('confirms NEEDS_REVIEW via updateMany and enqueues jobs once', async () => {
    const observe = { add: vi.fn() };
    const match = { add: vi.fn() };
    const insights = { add: vi.fn() };
    const prisma = {
      receipt: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'r1',
            householdId: 'h1',
            status: ReceiptStatus.NEEDS_REVIEW,
            taxCents: 0,
            totalCents: 100,
            lines: [{ extendedCents: 100, discountCents: 0, quantity: 1 }],
          })
          .mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: 'r1',
          status: ReceiptStatus.CONFIRMED,
          lines: [],
          store: null,
        }),
      },
    };
    const svc = makeSvc(prisma, { observe, match, insights });
    const res = await svc.confirm(
      { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
      'r1',
      { overrideArithmetic: false },
    );
    expect(res.status).toBe(ReceiptStatus.CONFIRMED);
    expect(prisma.receipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [ReceiptStatus.NEEDS_REVIEW, ReceiptStatus.FAILED],
          },
        }),
      }),
    );
    expect(observe.add).toHaveBeenCalledTimes(1);
    expect(match.add).toHaveBeenCalledTimes(1);
    expect(insights.add).toHaveBeenCalledTimes(1);
  });

  it('rejects confirm when status is already CONFIRMED', async () => {
    const prisma = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.CONFIRMED,
          taxCents: 0,
          totalCents: 100,
          lines: [{ extendedCents: 100, discountCents: 0, quantity: 1 }],
        }),
        updateMany: vi.fn(),
      },
    };
    const svc = makeSvc(prisma);
    await expect(
      svc.confirm(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
        { overrideArithmetic: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.receipt.updateMany).not.toHaveBeenCalled();
  });

  it('locks patch/rematch on CONFIRMED receipts', async () => {
    const prisma = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.CONFIRMED,
        }),
      },
    };
    const svc = makeSvc(prisma);
    const auth = {
      userId: 'u1',
      householdId: 'h1',
      email: 'a@b.c',
      role: 'owner' as const,
    };
    await expect(svc.patch(auth, 'r1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.rematch(auth, 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.reextract(auth, 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
