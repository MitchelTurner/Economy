import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  /** Local/dev listen port. Platforms like Railway inject `PORT` instead — see `listenPort()`. */
  API_PORT: z.coerce.number().int().positive().default(3000),
  PORT: z.coerce.number().int().positive().optional(),
  CORS_ORIGIN: z.string().optional(),
  /**
   * Express trust-proxy setting for rate-limit client IP.
   * Default false locally; production defaults to `1` (one reverse-proxy hop)
   * when unset so Railway/nginx X-Forwarded-For works.
   */
  TRUST_PROXY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  EXTRACTION_PROVIDER: z.enum(['mock', 'anthropic']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ALLOW_MOCK_EXTRACTION: z.string().optional(),
  SEED_ON_BOOT: z.enum(['off', 'reference', 'demo']).optional().default('off'),
});

/** Parse TRUST_PROXY into an Express-compatible value. */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const v = (raw ?? 'false').trim().toLowerCase();
  if (!v || v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  if (v === 'true' || v === 'yes' || v === 'on') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return raw!.trim();
}

/** Prefer platform `PORT` (Railway) over `API_PORT`. */
export function listenPort(env: AppEnv): number {
  return env.PORT ?? env.API_PORT;
}

export type AppEnv = z.infer<typeof EnvSchema>;

/** Validate process.env at boot. Throws with a clear message on failure. */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === 'production') {
    if (!data.CORS_ORIGIN?.trim()) {
      throw new Error('Invalid environment: CORS_ORIGIN is required in production');
    }
    if (data.JWT_SECRET.includes('change-me')) {
      throw new Error(
        'Invalid environment: JWT_SECRET still contains "change-me" — set a long random value in Railway Variables',
      );
    }
    if (data.JWT_REFRESH_SECRET.includes('change-me')) {
      throw new Error(
        'Invalid environment: JWT_REFRESH_SECRET still contains "change-me" — set a different long random value in Railway Variables',
      );
    }
    if (data.JWT_SECRET === data.JWT_REFRESH_SECRET) {
      throw new Error(
        'Invalid environment: JWT_SECRET and JWT_REFRESH_SECRET must be different values',
      );
    }
    if (data.JWT_SECRET.length < 32 || data.JWT_REFRESH_SECRET.length < 32) {
      throw new Error(
        'Invalid environment: JWT_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters',
      );
    }
    const allowMock = (data.ALLOW_MOCK_EXTRACTION ?? 'true').toLowerCase() !== 'false';
    if (
      (data.EXTRACTION_PROVIDER === 'mock' || !data.ANTHROPIC_API_KEY) &&
      !allowMock
    ) {
      throw new Error(
        'Invalid environment: production extraction requires ANTHROPIC_API_KEY (or ALLOW_MOCK_EXTRACTION=true)',
      );
    }
    if (data.TRUST_PROXY == null || data.TRUST_PROXY.trim() === '') {
      data.TRUST_PROXY = '1';
    }
  } else if (data.TRUST_PROXY == null || data.TRUST_PROXY.trim() === '') {
    data.TRUST_PROXY = 'false';
  }

  return data;
}
