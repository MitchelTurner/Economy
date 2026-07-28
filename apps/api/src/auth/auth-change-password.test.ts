import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService.changePassword', () => {
  it('updates hash and revokes all refresh sessions', async () => {
    const passwordHash = await argon2.hash('old-password-ok');
    const update = vi.fn().mockResolvedValue({ id: 'u1' });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          passwordHash,
        }),
        update,
      },
    };
    const svc = new AuthService(
      prisma as never,
      new JwtService({ secret: 'x'.repeat(32) }),
      new ConfigService({
        JWT_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        REDIS_URL: 'redis://localhost:6379',
      }),
    );
    const keys = vi
      .fn()
      .mockResolvedValue(['session:refresh:u1:a', 'session:refresh:u1:b']);
    const del = vi.fn().mockResolvedValue(2);
    (svc as unknown as { redis: { keys: typeof keys; del: typeof del } }).redis =
      { keys, del };

    const res = await svc.changePassword('u1', {
      currentPassword: 'old-password-ok',
      newPassword: 'new-password-ok',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(keys).toHaveBeenCalledWith('session:refresh:u1:*');
    expect(del).toHaveBeenCalledWith(
      'session:refresh:u1:a',
      'session:refresh:u1:b',
    );
    expect(res).toEqual({ ok: true, sessionsRevoked: 2 });
  });
});
