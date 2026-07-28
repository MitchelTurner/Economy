import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService.updateMe', () => {
  it('persists emailDigest and emailAlerts', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      displayName: 'A',
      role: 'owner',
      emailDigest: false,
      emailAlerts: true,
      householdId: 'h1',
      household: { id: 'h1', name: 'H' },
      createdAt: new Date(),
    });
    const prisma = { user: { update } };
    const svc = new AuthService(
      prisma as never,
      new JwtService({ secret: 'x'.repeat(32) }),
      new ConfigService({
        JWT_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        REDIS_URL: 'redis://localhost:6379',
      }),
    );
    const me = await svc.updateMe('u1', { emailDigest: false });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { emailDigest: false },
      }),
    );
    expect(me.emailDigest).toBe(false);
  });
});
