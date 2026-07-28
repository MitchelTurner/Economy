import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReceiptsService } from './receipts.service';

function makeSvc(
  prisma: unknown,
  queues?: Partial<{
    observe: { add: ReturnType<typeof vi.fn> };
    match: { add: ReturnType<typeof vi.fn> };
    insights: { add: ReturnType<typeof vi.fn> };
    extract: { add: ReturnType<typeof vi.fn> };
  }>,
) {
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
        findFirst: vi.fn().mockResolvedValueOnce({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.NEEDS_REVIEW,
          taxCents: 0,
          totalCents: 100,
          lines: [{ extendedCents: 100, discountCents: 0, quantity: 1 }],
        }),
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

  it('returns 409 Conflict when confirm race loses updateMany', async () => {
    const prisma = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.NEEDS_REVIEW,
          taxCents: 0,
          totalCents: 100,
          lines: [{ extendedCents: 100, discountCents: 0 }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const svc = makeSvc(prisma);
    await expect(
      svc.confirm(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
        { overrideArithmetic: false },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks patch/rematch on CONFIRMED and in-flight receipts', async () => {
    const auth = {
      userId: 'u1',
      householdId: 'h1',
      email: 'a@b.c',
      role: 'owner' as const,
    };
    for (const status of [
      ReceiptStatus.CONFIRMED,
      ReceiptStatus.UPLOADED,
      ReceiptStatus.EXTRACTING,
    ]) {
      const prisma = {
        receipt: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'r1',
            householdId: 'h1',
            status,
            imageKey: 'receipts/h1/a.jpg',
            updatedAt: new Date(),
          }),
        },
      };
      const svc = makeSvc(prisma);
      await expect(svc.patch(auth, 'r1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(svc.rematch(auth, 'r1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('still allows reextract on UPLOADED while locking confirmed', async () => {
    const add = vi.fn().mockResolvedValue({});
    const prismaOk = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.UPLOADED,
          imageKey: 'receipts/h1/a.jpg',
          updatedAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svcOk = makeSvc(prismaOk, { extract: { add } });
    await expect(
      svcOk.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).resolves.toMatchObject({ ok: true });

    const prismaConfirmed = {
      receipt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'r1',
          householdId: 'h1',
          status: ReceiptStatus.CONFIRMED,
          imageKey: 'receipts/h1/a.jpg',
          updatedAt: new Date(),
        }),
      },
    };
    const svcConfirmed = makeSvc(prismaConfirmed);
    await expect(
      svcConfirmed.reextract(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
        'r1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
