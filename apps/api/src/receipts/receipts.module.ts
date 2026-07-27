import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { QUEUE_PRICE_OBSERVE, QUEUE_RECEIPT_EXTRACT } from '../jobs/queues';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_RECEIPT_EXTRACT },
      { name: QUEUE_PRICE_OBSERVE },
    ),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
