import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService, DEMO_EMAIL } from './auth.service';

function makeService(
  prisma: unknown,
  env: Record<string, string>,
) {
  return new AuthService(
    prisma as never,
    new JwtService({ secret: 'x'.repeat(32) }),
    new ConfigService({
      JWT_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      REDIS_URL: 'redis://localhost:6379',
      ...env,
    }),
    new NotificationsService(new ConfigService({ MAIL_PROVIDER: 'log' })),
  );
}

describe('AuthService.demoLogin', () => {
  it('is enabled when ALLOW_MOCK_EXTRACTION is true (default demo deploy)', () => {
    const svc = makeService({ user: {} }, {
      NODE_ENV: 'production',
      ALLOW_MOCK_EXTRACTION: 'true',
    });
    expect(svc.isDemoLoginEnabled()).toBe(true);
    expect(svc.demoStatus()).toEqual({ enabled: true, email: DEMO_EMAIL });
  });

  it('can be forced off with ALLOW_DEMO_LOGIN=false', () => {
    const svc = makeService({ user: {} }, {
      NODE_ENV: 'production',
      ALLOW_MOCK_EXTRACTION: 'true',
      ALLOW_DEMO_LOGIN: 'false',
    });
    expect(svc.isDemoLoginEnabled()).toBe(false);
  });

  it('creates the demo user and returns tokens', async () => {
    const createHousehold = vi.fn().mockResolvedValue({ id: 'h1' });
    const createUser = vi.fn().mockResolvedValue({
      id: 'u1',
      householdId: 'h1',
      email: DEMO_EMAIL,
    });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: createUser,
        update: vi.fn(),
      },
      household: { create: createHousehold },
    };
    const svc = makeService(prisma, {
      NODE_ENV: 'production',
      ALLOW_DEMO_LOGIN: 'true',
    });
    (svc as unknown as { redis: { set: ReturnType<typeof vi.fn> } }).redis = {
      set: vi.fn().mockResolvedValue('OK'),
    };

    const res = await svc.demoLogin();
    expect(createHousehold).toHaveBeenCalled();
    expect(createUser).toHaveBeenCalled();
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.email).toBe(DEMO_EMAIL);
  });

  it('rejects when disabled', async () => {
    const svc = makeService({ user: {} }, {
      NODE_ENV: 'production',
      ALLOW_MOCK_EXTRACTION: 'false',
      ALLOW_DEMO_LOGIN: 'false',
    });
    await expect(svc.demoLogin()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
