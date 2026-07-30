import { HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let redis: Redis | null = null;

export type RateLimitOptions = {
  /** Unique key prefix, e.g. auth:login */
  name: string;
  /** Max requests per window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
};

/** Call once at boot so multi-instance deploys share counters. */
export function initRateLimitRedis(url: string) {
  if (redis) return;
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    void redis.connect().catch(() => {
      redis = null;
    });
  } catch {
    redis = null;
  }
}

/** Fixed-window limiter — Redis when available, else in-process Map. */
export async function consumeRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<void> {
  const fullKey = `ratelimit:${opts.name}:${key}`;
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));

  if (redis) {
    try {
      const count = await redis.incr(fullKey);
      if (count === 1) {
        await redis.expire(fullKey, windowSec);
      }
      if (count > opts.limit) {
        const ttl = await redis.ttl(fullKey);
        throwTooMany(opts.name, ttl > 0 ? ttl : windowSec);
      }
      return;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Fall through to memory on Redis errors
    }
  }

  const now = Date.now();
  let bucket = buckets.get(fullKey);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(fullKey, bucket);
  }
  bucket.count += 1;
  if (bucket.count > opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throwTooMany(opts.name, retryAfter);
  }
}

function throwTooMany(name: string, retryAfter: number): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: `Rate limit exceeded for ${name}`,
      retryAfter,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** Test helper */
export function resetRateLimits() {
  buckets.clear();
}

/** Test helper — force memory path */
export function disconnectRateLimitRedis() {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

/**
 * Client identity for IP-keyed rate limits.
 * Uses Express `req.ip` only — never raw `X-Forwarded-For`.
 * Configure `TRUST_PROXY` so Express derives `req.ip` from a trusted proxy chain.
 */
export function clientKeyFromReq(req: {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
