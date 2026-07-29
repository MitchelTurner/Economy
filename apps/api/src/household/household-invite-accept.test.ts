import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

function mockAuth() {
  return {
    issueSessionTokens: vi.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', householdId: 'h-invite', email: 'member@example.com' },
    }),
    revokeAllSessions: vi.fn().mockResolvedValue(0),
  };
}

describe('HouseholdService.acceptInvite', () => {
  it('verifies password for existing users and does not overwrite the hash', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
    const update = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'member@example.com',
      householdId: 'h-invite',
      passwordHash,
    });
    const auth = mockAuth();
    const prisma = {
      householdInvite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv1',
          email: 'member@example.com',
          householdId: 'h-invite',
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'member@example.com',
          passwordHash,
          householdId: 'h-old',
          displayName: 'Pat',
          role: 'owner',
          household: { id: 'h-old', name: 'Old HH' },
        }),
        count: vi
          .fn()
          .mockResolvedValueOnce(1) // memberCount
          .mockResolvedValueOnce(1), // ownerCount
        update,
        create: vi.fn(),
      },
      receipt: { count: vi.fn().mockResolvedValue(0) },
      budget: { deleteMany: vi.fn() },
      insight: { deleteMany: vi.fn() },
      priceAlert: { deleteMany: vi.fn() },
      extractionUsage: { deleteMany: vi.fn() },
      household: { delete: vi.fn().mockResolvedValue({}) },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({ CORS_ORIGIN: 'http://localhost:5173' }),
      auth as never,
    );

    const res = await svc.acceptInvite({
      token: 'a'.repeat(24),
      password: 'correct-password-1',
      moveHousehold: true,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.not.objectContaining({ passwordHash: expect.anything() }),
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('u1');
    expect(auth.issueSessionTokens).toHaveBeenCalledWith(
      'u1',
      'h-invite',
      'member@example.com',
    );
    expect(res.accessToken).toBe('access');
    expect(prisma.household.delete).toHaveBeenCalledWith({
      where: { id: 'h-old' },
    });
  });

  it('rejects last-owner moves that would orphan a multi-member household', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
    const auth = mockAuth();
    const prisma = {
      householdInvite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv1',
          email: 'owner@example.com',
          householdId: 'h-invite',
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'owner@example.com',
          passwordHash,
          householdId: 'h-old',
          displayName: 'Pat',
          role: 'owner',
          household: { id: 'h-old', name: 'Old HH' },
        }),
        count: vi
          .fn()
          .mockResolvedValueOnce(3) // memberCount
          .mockResolvedValueOnce(1), // ownerCount
        update: vi.fn(),
        create: vi.fn(),
      },
      receipt: { count: vi.fn().mockResolvedValue(2) },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({}),
      auth as never,
    );

    await expect(
      svc.acceptInvite({
        token: 'a'.repeat(24),
        password: 'correct-password-1',
        moveHousehold: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('rejects solo moves that leave receipts behind', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
    const auth = mockAuth();
    const prisma = {
      householdInvite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv1',
          email: 'solo@example.com',
          householdId: 'h-invite',
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'solo@example.com',
          passwordHash,
          householdId: 'h-old',
          displayName: 'Pat',
          role: 'owner',
          household: { id: 'h-old', name: 'Old HH' },
        }),
        count: vi
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
        update: vi.fn(),
        create: vi.fn(),
      },
      receipt: { count: vi.fn().mockResolvedValue(4) },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({}),
      auth as never,
    );

    await expect(
      svc.acceptInvite({
        token: 'a'.repeat(24),
        password: 'correct-password-1',
        moveHousehold: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects wrong password for existing users', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
    const auth = mockAuth();
    const prisma = {
      householdInvite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv1',
          email: 'member@example.com',
          householdId: 'h-invite',
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'member@example.com',
          passwordHash,
          householdId: 'h-invite',
          displayName: 'Pat',
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({}),
      auth as never,
    );

    await expect(
      svc.acceptInvite({
        token: 'a'.repeat(24),
        password: 'wrong-password-9',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auth.issueSessionTokens).not.toHaveBeenCalled();
  });

  it('hashes password only when creating a new user', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'u-new',
      email: 'new@example.com',
      householdId: 'h-invite',
    });
    const auth = mockAuth();
    const prisma = {
      householdInvite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv1',
          email: 'new@example.com',
          householdId: 'h-invite',
          acceptedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          household: { id: 'h-invite', name: 'Invite HH' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({}),
      auth as never,
    );

    await svc.acceptInvite({
      token: 'a'.repeat(24),
      password: 'brand-new-pass',
      displayName: 'New',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.com',
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(auth.issueSessionTokens).toHaveBeenCalled();
  });
});
