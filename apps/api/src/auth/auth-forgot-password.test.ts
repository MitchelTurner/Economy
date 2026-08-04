import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from './auth.service';

function makeService(prisma: unknown, notifications?: NotificationsService) {
  const mail =
    notifications ??
    new NotificationsService(
      new ConfigService({
        MAIL_PROVIDER: 'log',
        CORS_ORIGIN: 'https://app.example.com',
      }),
    );
  return new AuthService(
    prisma as never,
    new JwtService({ secret: 'x'.repeat(32) }),
    new ConfigService({
      JWT_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGIN: 'https://app.example.com',
    }),
    mail,
  );
}

describe('AuthService.forgotPassword / resetPassword', () => {
  it('returns ok without email when the account does not exist', async () => {
    const mail = new NotificationsService(
      new ConfigService({ MAIL_PROVIDER: 'log', CORS_ORIGIN: 'https://app.example.com' }),
    );
    const send = vi.spyOn(mail, 'sendPasswordReset');
    const svc = makeService(
      { user: { findUnique: vi.fn().mockResolvedValue(null) } },
      mail,
    );
    const res = await svc.forgotPassword({ email: 'missing@example.com' });
    expect(res).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('stores a hashed token, emails a reset link, and resets the password once', async () => {
    const mail = new NotificationsService(
      new ConfigService({ MAIL_PROVIDER: 'log', CORS_ORIGIN: 'https://app.example.com' }),
    );
    const update = vi.fn().mockResolvedValue({ id: 'u1' });
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'u1', email: 'a@example.com' })
          .mockResolvedValueOnce({ id: 'u1' }),
        update,
      },
    };
    const svc = makeService(prisma, mail);
    const store = new Map<string, string>();
    const redis = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) store.delete(k);
        return keys.length;
      }),
      keys: vi.fn(async () => [] as string[]),
    };
    (svc as unknown as { redis: typeof redis }).redis = redis;

    await svc.forgotPassword({ email: 'A@example.com' });
    const sent = mail.drainSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/reset/i);
    const match = sent[0]!.text.match(/token=([a-f0-9]+)/);
    expect(match).toBeTruthy();
    const token = match![1]!;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    expect(store.get(`password-reset:${tokenHash}`)).toBe('u1');

    const res = await svc.resetPassword({
      token,
      newPassword: 'brand-new-password',
    });
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    const newHash = update.mock.calls[0]![0].data.passwordHash as string;
    expect(await argon2.verify(newHash, 'brand-new-password')).toBe(true);
    expect(store.has(`password-reset:${tokenHash}`)).toBe(false);

    await expect(
      svc.resetPassword({ token, newPassword: 'another-password' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
