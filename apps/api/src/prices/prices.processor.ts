import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PricesService } from './prices.service';
import { QUEUE_PRICE_OBSERVE } from '../jobs/queues';

@Processor(QUEUE_PRICE_OBSERVE)
export class PricesProcessor extends WorkerHost {
  constructor(private readonly prices: PricesService) {
    super();
  }

  async process(job: Job<{ receiptId: string }>) {
    await this.prices.observeFromReceipt(job.data.receiptId);
  }
}
