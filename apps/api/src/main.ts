import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { validateEnv } from './common/env';

async function bootstrap() {
  const env = validateEnv();

  const app = await NestFactory.create(AppModule);

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
