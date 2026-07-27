import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { CatalogModule } from '../catalog/catalog.module';
import {
  QUEUE_INSIGHTS_GENERATE,
  QUEUE_PRICE_OBSERVE,
  QUEUE_RECEIPT_EXTRACT,
  QUEUE_RECEIPT_MATCH,
} from '../jobs/queues';

@Module({
  imports: [
    CatalogModule,
    BullModule.registerQueue(
      { name: QUEUE_RECEIPT_EXTRACT },
      { name: QUEUE_RECEIPT_MATCH },
      { name: QUEUE_PRICE_OBSERVE },
      { name: QUEUE_INSIGHTS_GENERATE },
    ),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
