import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

function authMock() {
  return {
    issueSessionTokens: vi.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', householdId: 'solo', email: 'a@b.c' },
    }),
    revokeAllSessions: vi.fn().mockResolvedValue(1),
  };
}

describe('HouseholdService.rename / leave / removeMember / transfer', () => {
  it('renames when caller is owner', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'h1', name: 'New name' });
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'owner' }) },
      household: { update },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    const row = await svc.rename(
      { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
      { name: 'New name' },
    );
    expect(row.name).toBe('New name');
  });

  it('forbids rename for non-owners', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'member' }) },
      household: { update: vi.fn() },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    await expect(
      svc.rename(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'member' },
        { name: 'X' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks sole member from leaving', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          role: 'owner',
          email: 'a@b.c',
          displayName: 'A',
        }),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    await expect(
      svc.leave({ userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a member into a solo household', async () => {
    const auth = authMock();
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'owner', role: 'owner' }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member',
          email: 'm@b.c',
          displayName: 'M',
          role: 'member',
          householdId: 'h1',
        }),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn(),
      },
      household: {
        create: vi.fn().mockResolvedValue({ id: 'solo', name: "M's household" }),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      auth as never,
    );
    const res = await svc.removeMember(
      { userId: 'owner', householdId: 'h1', email: 'o@b.c', role: 'owner' },
      'member',
    );
    expect(res).toEqual({ ok: true, removedUserId: 'member' });
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('member');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member' },
        data: { householdId: 'solo', role: 'owner' },
      }),
    );
  });

  it('transfers ownership to a member and demotes the caller', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'owner', role: 'owner' }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member',
          email: 'm@b.c',
          displayName: 'M',
          role: 'member',
        }),
        update,
      },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    const res = await svc.transferOwnership(
      { userId: 'owner', householdId: 'h1', email: 'o@b.c', role: 'owner' },
      { userId: 'member' },
    );
    expect(res).toEqual({
      ok: true,
      newOwner: {
        userId: 'member',
        email: 'm@b.c',
        displayName: 'M',
        role: 'owner',
      },
      previousOwnerUserId: 'owner',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'member' },
      data: { role: 'owner' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'owner' },
      data: { role: 'member' },
    });
  });

  it('rejects self-transfer and non-owners', async () => {
    const memberPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'member' }),
      },
    };
    const memberSvc = new HouseholdService(
      memberPrisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    await expect(
      memberSvc.transferOwnership(
        { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'member' },
        { userId: 'u2' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ownerPrisma = {
      user: { findUnique: vi.fn() },
    };
    const ownerSvc = new HouseholdService(
      ownerPrisma as never,
      {} as never,
      {} as never,
      new ConfigService({}),
      authMock() as never,
    );
    await expect(
      ownerSvc.transferOwnership(
        { userId: 'owner', householdId: 'h1', email: 'o@b.c', role: 'owner' },
        { userId: 'owner' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
