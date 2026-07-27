import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExtractionProvider } from './extraction.provider';
import { ExtractionService } from './extraction.service';
import { ExtractionProcessor } from './extraction.processor';
import { QUEUE_RECEIPT_EXTRACT } from '../jobs/queues';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_RECEIPT_EXTRACT })],
  providers: [ExtractionProvider, ExtractionService, ExtractionProcessor],
  exports: [ExtractionService, ExtractionProvider, BullModule],
})
export class ExtractionModule {}
