import { describe, expect, it, beforeEach } from 'vitest';
import {
  clientKeyFromReq,
  consumeRateLimit,
  disconnectRateLimitRedis,
  resetRateLimits,
} from './rate-limit';

describe('consumeRateLimit', () => {
  beforeEach(() => {
    disconnectRateLimitRedis();
    resetRateLimits();
  });

  it('allows up to the limit then rejects', async () => {
    const opts = { name: 'test', limit: 2, windowMs: 60_000 };
    await consumeRateLimit('a', opts);
    await consumeRateLimit('a', opts);
    await expect(consumeRateLimit('a', opts)).rejects.toThrow(/Rate limit/);
  });

  it('isolates keys', async () => {
    const opts = { name: 'test', limit: 1, windowMs: 60_000 };
    await consumeRateLimit('a', opts);
    await expect(consumeRateLimit('b', opts)).resolves.toBeUndefined();
  });
});

describe('clientKeyFromReq', () => {
  it('uses req.ip (Express trust-proxy result), not raw forwarding headers', () => {
    // Spoofed X-Forwarded-For is irrelevant — callers must not pass headers here.
    expect(clientKeyFromReq({ ip: '10.0.0.5' })).toBe('10.0.0.5');
  });

  it('falls back to socket remoteAddress then unknown', () => {
    expect(
      clientKeyFromReq({ socket: { remoteAddress: '192.168.1.9' } }),
    ).toBe('192.168.1.9');
    expect(clientKeyFromReq({})).toBe('unknown');
  });
});
