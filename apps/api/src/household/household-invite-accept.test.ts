import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

describe('HouseholdService.acceptInvite', () => {
  it('verifies password for existing users and does not overwrite the hash', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
    const update = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'member@example.com',
      householdId: 'h-invite',
      passwordHash,
    });
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
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          email: 'member@example.com',
          passwordHash,
          householdId: 'h-old',
          displayName: 'Pat',
          household: { id: 'h-old', name: 'Old HH' },
        }),
        count: vi.fn().mockResolvedValue(1),
        update,
        create: vi.fn(),
      },
      receipt: { count: vi.fn().mockResolvedValue(0) },
    };
    const svc = new HouseholdService(
      prisma as never,
      {} as never,
      { sendInvite: vi.fn() } as never,
      new ConfigService({ CORS_ORIGIN: 'http://localhost:5173' }),
    );

    await svc.acceptInvite({
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
  });

  it('rejects wrong password for existing users', async () => {
    const passwordHash = await argon2.hash('correct-password-1');
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
    );

    await expect(
      svc.acceptInvite({
        token: 'a'.repeat(24),
        password: 'wrong-password-9',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes password only when creating a new user', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'u-new',
      email: 'new@example.com',
      householdId: 'h-invite',
    });
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
  });
});
