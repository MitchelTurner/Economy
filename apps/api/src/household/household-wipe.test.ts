import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

describe('HouseholdService.hardDelete / exportData', () => {
  it('revokes all member sessions before wiping', async () => {
    const revokeAllSessions = vi.fn().mockResolvedValue(1);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'owner', role: 'owner' }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'owner' }, { id: 'member' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      receipt: {
        findMany: vi.fn().mockResolvedValue([{ imageKey: 'receipts/h1/a.jpg' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      priceObservation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      priceAlert: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      insight: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      budget: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      householdInvite: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      extractionUsage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      household: { delete: vi.fn().mockResolvedValue({}) },
    };
    const svc = new HouseholdService(
      prisma as never,
      { deleteObject } as never,
      {} as never,
      new ConfigService({}),
      { revokeAllSessions } as never,
    );
    const res = await svc.hardDelete({
      userId: 'owner',
      householdId: 'h1',
      email: 'o@b.c',
      role: 'owner',
    });
    expect(res).toEqual({ ok: true, deletedHouseholdId: 'h1' });
    expect(revokeAllSessions).toHaveBeenCalledWith('owner');
    expect(revokeAllSessions).toHaveBeenCalledWith('member');
    expect(deleteObject).toHaveBeenCalledWith('receipts/h1/a.jpg');
    expect(prisma.household.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
  });

  it('forbids wipe for non-owners', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'member' }),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      { revokeAllSessions: vi.fn() } as never,
    );
    await expect(
      svc.hardDelete({
        userId: 'u1',
        householdId: 'h1',
        email: 'a@b.c',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exportData returns json + csv with line rows', async () => {
    const purchasedAt = new Date('2026-01-15T12:00:00.000Z');
    const prisma = {
      household: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'h1',
          name: 'Demo',
          users: [{ id: 'u1', email: 'a@b.c', displayName: 'A', role: 'owner' }],
        }),
      },
      receipt: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1',
            purchasedAt,
            store: { name: 'ALS' },
            lines: [
              {
                rawText: 'Milk',
                quantity: 1,
                extendedCents: 499,
                categoryId: 'c1',
                productId: 'p1',
              },
            ],
          },
        ]),
      },
      budget: { findMany: vi.fn().mockResolvedValue([]) },
      insight: { findMany: vi.fn().mockResolvedValue([]) },
      priceObservation: { findMany: vi.fn().mockResolvedValue([]) },
      priceAlert: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      {} as never,
    );
    const res = await svc.exportData({
      userId: 'u1',
      householdId: 'h1',
      email: 'a@b.c',
      role: 'owner',
    });
    expect(res.json).toMatchObject({
      household: { id: 'h1', name: 'Demo' },
      receipts: expect.any(Array),
    });
    expect(res.csv.split('\n')).toHaveLength(2);
    expect(res.csv).toContain('Milk');
    expect(res.csv).toContain('499');
  });
});
