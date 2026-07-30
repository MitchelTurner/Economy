import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { parseTrustProxy, validateEnv } from './common/env';
import { initRateLimitRedis } from './common/rate-limit';

async function bootstrap() {
  const env = validateEnv();
  initRateLimitRedis(env.REDIS_URL);

  // Disable default body parser so we can set a larger limit for imageBase64 fallback.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Only honor X-Forwarded-For when TRUST_PROXY is configured (default: off).
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  app.use(
    helmet({
      // API is JSON-only; SPA is separate origin
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ~6MB JSON covers typical JPEG base64 memory fallback (~4.5MB raw).
  const bodyLimit = process.env.JSON_BODY_LIMIT ?? '6mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  const origins = env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  if (env.NODE_ENV === 'production') {
    app.enableCors({ origin: origins, credentials: true });
  } else {
    app.enableCors({
      origin: origins?.length ? origins : true,
      credentials: true,
    });
  }

  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(env.API_PORT);
  console.log(`Island Ledger API listening on :${env.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
