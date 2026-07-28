import { HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Unique key prefix, e.g. auth:login */
  name: string;
  /** Max requests per window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
};

/** Simple in-process sliding fixed-window limiter (fine for single API instance). */
export function consumeRateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const fullKey = `${opts.name}:${key}`;
  let bucket = buckets.get(fullKey);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(fullKey, bucket);
  }
  bucket.count += 1;
  if (bucket.count > opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded for ${opts.name}`,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Test helper */
export function resetRateLimits() {
  buckets.clear();
}

export function clientKeyFromReq(req: { ip?: string; headers?: Record<string, unknown> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip || 'unknown';
}
