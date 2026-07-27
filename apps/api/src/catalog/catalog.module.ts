import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MatchingProcessor } from './matching.processor';
import { QUEUE_RECEIPT_MATCH } from '../jobs/queues';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_RECEIPT_MATCH })],
  controllers: [CatalogController],
  providers: [CatalogService, MatchingProcessor],
  exports: [CatalogService, BullModule],
})
export class CatalogModule {}
