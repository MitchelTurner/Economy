import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://island:island@localhost:5432/island_ledger',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'dev-access-secret-change-me',
    JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
    NODE_ENV: 'development',
  };

  it('accepts development defaults', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3000);
  });

  it('rejects production with open CORS and weak JWT secrets', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-please-long',
        JWT_REFRESH_SECRET: 'change-me-please-long',
      }),
    ).toThrow(/CORS_ORIGIN|JWT/);
  });

  it('accepts production with CORS and strong distinct secrets', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      JWT_SECRET: 'prod-access-secret-32chars-min!!',
      JWT_REFRESH_SECRET: 'prod-refresh-secret-32chars-min!',
      ALLOW_MOCK_EXTRACTION: 'true',
    });
    expect(env.CORS_ORIGIN).toBe('https://app.example.com');
  });

  it('defaults SEED_ON_BOOT to off', () => {
    const env = validateEnv(base);
    expect(env.SEED_ON_BOOT).toBe('off');
  });

  it('accepts SEED_ON_BOOT reference and demo', () => {
    expect(validateEnv({ ...base, SEED_ON_BOOT: 'reference' }).SEED_ON_BOOT).toBe(
      'reference',
    );
    expect(validateEnv({ ...base, SEED_ON_BOOT: 'demo' }).SEED_ON_BOOT).toBe('demo');
  });

  it('rejects invalid SEED_ON_BOOT', () => {
    expect(() => validateEnv({ ...base, SEED_ON_BOOT: 'wipe' })).toThrow(
      /SEED_ON_BOOT/,
    );
  });
});

