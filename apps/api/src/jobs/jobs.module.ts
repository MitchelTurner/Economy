import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  QUEUE_INSIGHTS_GENERATE,
  QUEUE_PRICE_INDEX,
  QUEUE_PRICE_OBSERVE,
  QUEUE_RECEIPT_CLEANUP,
  QUEUE_RECEIPT_EXTRACT,
  QUEUE_RECEIPT_MATCH,
} from './queues';
import { InsightsModule } from '../insights/insights.module';
import { StorageModule } from '../storage/storage.module';
import { InsightsGenerateProcessor } from './insights-generate.processor';
import { ReceiptCleanupProcessor } from './receipt-cleanup.processor';
import { SchedulersService } from './schedulers.service';

@Module({
  imports: [
    InsightsModule,
    StorageModule,
    BullModule.registerQueue(
      { name: QUEUE_RECEIPT_EXTRACT },
      { name: QUEUE_RECEIPT_MATCH },
      { name: QUEUE_PRICE_OBSERVE },
      { name: QUEUE_PRICE_INDEX },
      { name: QUEUE_INSIGHTS_GENERATE },
      { name: QUEUE_RECEIPT_CLEANUP },
    ),
  ],
  providers: [
    InsightsGenerateProcessor,
    ReceiptCleanupProcessor,
    SchedulersService,
  ],
  exports: [SchedulersService],
})
export class JobsModule {}
