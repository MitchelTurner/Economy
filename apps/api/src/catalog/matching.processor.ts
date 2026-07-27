import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { QUEUE_RECEIPT_MATCH } from '../jobs/queues';

@Processor(QUEUE_RECEIPT_MATCH)
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly catalog: CatalogService) {
    super();
  }

  async process(job: Job<{ receiptId: string }>) {
    this.logger.log(`Matching products for receipt ${job.data.receiptId}`);
    const result = await this.catalog.matchReceipt(job.data.receiptId);
    this.logger.log(
      `Matched ${result.matched}, unmatched ${result.unmatched} on ${job.data.receiptId}`,
    );
  }
}
