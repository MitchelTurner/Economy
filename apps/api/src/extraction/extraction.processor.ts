import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { QUEUE_RECEIPT_EXTRACT } from '../jobs/queues';

@Processor(QUEUE_RECEIPT_EXTRACT)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(private readonly extraction: ExtractionService) {
    super();
  }

  async process(job: Job<{ receiptId: string }>) {
    this.logger.log(`Extracting receipt ${job.data.receiptId}`);
    try {
      await this.extraction.processReceipt(job.data.receiptId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown extraction error';
      this.logger.error(
        `Extraction crashed receipt=${job.data.receiptId}: ${reason}`,
      );
      await this.extraction.markFailed(
        job.data.receiptId,
        `Extraction crashed: ${reason}`,
      );
      throw err;
    }
  }
}
