import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService.logoutAll', () => {
  it('revokes all refresh sessions', async () => {
    const svc = new AuthService(
      { user: {} } as never,
      new JwtService({ secret: 'x'.repeat(32) }),
      new ConfigService({
        JWT_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        REDIS_URL: 'redis://localhost:6379',
      }),
    );
    const keys = vi.fn().mockResolvedValue(['session:refresh:u1:a']);
    const del = vi.fn().mockResolvedValue(1);
    (svc as unknown as { redis: { keys: typeof keys; del: typeof del } }).redis =
      { keys, del };

    const res = await svc.logoutAll('u1');
    expect(keys).toHaveBeenCalledWith('session:refresh:u1:*');
    expect(del).toHaveBeenCalledWith('session:refresh:u1:a');
    expect(res).toEqual({ ok: true, sessionsRevoked: 1 });
  });
});
