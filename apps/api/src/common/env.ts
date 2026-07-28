import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  EXTRACTION_PROVIDER: z.enum(['mock', 'anthropic']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ALLOW_MOCK_EXTRACTION: z.string().optional(),
});

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
    if (
      data.JWT_SECRET.includes('change-me') ||
      data.JWT_REFRESH_SECRET.includes('change-me') ||
      data.JWT_SECRET === data.JWT_REFRESH_SECRET
    ) {
      throw new Error(
        'Invalid environment: use strong distinct JWT_SECRET and JWT_REFRESH_SECRET in production',
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
  }

  return data;
}
