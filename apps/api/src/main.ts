import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { listenPort, parseTrustProxy, validateEnv } from './common/env';
import { initRateLimitRedis } from './common/rate-limit';

async function bootstrap() {
  console.log('[boot] validating environment…');
  const env = validateEnv();
  console.log(
    `[boot] env ok NODE_ENV=${env.NODE_ENV} TRUST_PROXY=${env.TRUST_PROXY} CORS_ORIGIN set=${Boolean(env.CORS_ORIGIN)}`,
  );
  initRateLimitRedis(env.REDIS_URL);

  console.log('[boot] creating Nest application (DB + Redis modules)…');
  // Disable default body parser so we can set a larger limit for imageBase64 fallback.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  console.log('[boot] Nest application created');

  // Only honor X-Forwarded-For when TRUST_PROXY is configured (default: off locally, 1 in prod).
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
  // Railway injects PORT and routes to it — bind all interfaces, not just API_PORT.
  // Prefer raw process.env.PORT so a dashboard "target port" mismatch is visible in logs.
  const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : listenPort(env);
  console.log(
    `[boot] binding 0.0.0.0:${port} (process.env.PORT=${process.env.PORT ?? 'unset'} API_PORT=${env.API_PORT})`,
  );
  await app.listen(port, '0.0.0.0');
  console.log(`Island Ledger API listening on 0.0.0.0:${port}`);
  console.log('[boot] liveness: GET /health  readiness: GET /health/ready');
}

bootstrap().catch((err) => {
  console.error('[boot] fatal', err);
  process.exit(1);
});
