import { describe, expect, it, beforeEach } from 'vitest';
import {
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
