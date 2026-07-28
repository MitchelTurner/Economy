import { describe, expect, it, beforeEach } from 'vitest';
import { consumeRateLimit, resetRateLimits } from './rate-limit';

describe('consumeRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit then rejects', () => {
    const opts = { name: 'test', limit: 2, windowMs: 60_000 };
    consumeRateLimit('a', opts);
    consumeRateLimit('a', opts);
    expect(() => consumeRateLimit('a', opts)).toThrow(/Rate limit/);
  });

  it('isolates keys', () => {
    const opts = { name: 'test', limit: 1, windowMs: 60_000 };
    consumeRateLimit('a', opts);
    expect(() => consumeRateLimit('b', opts)).not.toThrow();
  });
});
