import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService.refresh', () => {
  it('rejects refresh when the user row was deleted', async () => {
    const jwt = new JwtService({ secret: 'y'.repeat(32) });
    const refreshToken = await jwt.signAsync(
      { sub: 'gone', householdId: 'h1', email: 'a@b.c', typ: 'refresh' },
      { secret: 'y'.repeat(32), expiresIn: '30d' },
    );
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
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
    const key = `session:refresh:gone:${refreshToken.slice(-24)}`;
    const get = vi.fn().mockResolvedValue('1');
    const del = vi.fn().mockResolvedValue(1);
    (svc as unknown as { redis: { get: typeof get; del: typeof del } }).redis = {
      get,
      del,
    };

    await expect(svc.refresh({ refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'gone' },
      select: { id: true, householdId: true, email: true },
    });
    expect(del).toHaveBeenCalledWith(key);
  });
});
