import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from './auth.service';

function makeService(prisma: unknown) {
  return new AuthService(
    prisma as never,
    new JwtService({ secret: 'x'.repeat(32) }),
    new ConfigService({
      JWT_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      REDIS_URL: 'redis://localhost:6379',
    }),
    new NotificationsService(new ConfigService({ MAIL_PROVIDER: 'log' })),
  );
}

describe('AuthService saved login by IP', () => {
  it('saves and returns email for the same client IP', async () => {
    const passwordHash = await argon2.hash('password-123');
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          householdId: 'h1',
          email: 'mitch@example.com',
          passwordHash,
        }),
      },
    };
    const svc = makeService(prisma);
    const store = new Map<string, string>();
    (svc as unknown as { redis: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> } }).redis = {
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };

    await svc.login(
      { email: 'mitch@example.com', password: 'password-123', rememberNetwork: true },
      '203.0.113.10',
    );

    await expect(svc.getSavedLogin('203.0.113.10')).resolves.toEqual({
      email: 'mitch@example.com',
    });
    await expect(svc.getSavedLogin('198.51.100.20')).resolves.toEqual({ email: null });
  });

  it('clears saved email when rememberNetwork is false', async () => {
    const passwordHash = await argon2.hash('password-123');
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1',
          householdId: 'h1',
          email: 'mitch@example.com',
          passwordHash,
        }),
      },
    };
    const svc = makeService(prisma);
    const store = new Map<string, string>();
    (svc as unknown as { redis: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> } }).redis = {
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };

    await svc.login(
      { email: 'mitch@example.com', password: 'password-123', rememberNetwork: true },
      '203.0.113.10',
    );
    await svc.login(
      { email: 'mitch@example.com', password: 'password-123', rememberNetwork: false },
      '203.0.113.10',
    );
    await expect(svc.getSavedLogin('203.0.113.10')).resolves.toEqual({ email: null });
  });
});
