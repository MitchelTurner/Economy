import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiCategorizeService } from './ai-categorize.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MatchingProcessor } from './matching.processor';
import { QUEUE_RECEIPT_MATCH } from '../jobs/queues';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_RECEIPT_MATCH })],
  controllers: [CatalogController],
  providers: [CatalogService, MatchingProcessor, AiCategorizeService],
  exports: [CatalogService, AiCategorizeService, BullModule],
})
export class CatalogModule {}
