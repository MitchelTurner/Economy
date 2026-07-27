import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { ExtractionModule } from './extraction/extraction.module';
import { CatalogModule } from './catalog/catalog.module';
import { PricesModule } from './prices/prices.module';
import { BudgetsModule } from './budgets/budgets.module';
import { InsightsModule } from './insights/insights.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { JobsModule } from './jobs/jobs.module';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    ReceiptsModule,
    ExtractionModule,
    CatalogModule,
    PricesModule,
    BudgetsModule,
    InsightsModule,
    AnalyticsModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
