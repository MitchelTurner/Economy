import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.useGlobalPipes(new ZodValidationPipe());
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`Island Ledger API listening on :${port}`);
}

bootstrap();
