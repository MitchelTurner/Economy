import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiCategorizeService } from './ai-categorize.service';
import { CatalogService } from './catalog.service';
import { QUEUE_RECEIPT_MATCH } from '../jobs/queues';

@Processor(QUEUE_RECEIPT_MATCH)
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    private readonly catalog: CatalogService,
    private readonly aiCategorize: AiCategorizeService,
  ) {
    super();
  }

  async process(job: Job<{ receiptId: string }>) {
    this.logger.log(`Matching products for receipt ${job.data.receiptId}`);
    const result = await this.catalog.matchReceipt(job.data.receiptId);
    this.logger.log(
      `Matched ${result.matched}, unmatched ${result.unmatched} on ${job.data.receiptId}`,
    );
    // After product match: AI-fill lines still missing a category.
    const cat = await this.aiCategorize.fillUncategorizedLines(job.data.receiptId);
    if (cat.updated) {
      this.logger.log(
        `AI categorized ${cat.updated} remaining lines on ${job.data.receiptId}`,
      );
    }
  }
}
