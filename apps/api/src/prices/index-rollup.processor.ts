import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IndexRollupService } from './index-rollup.service';
import { QUEUE_PRICE_INDEX } from '../jobs/queues';

@Processor(QUEUE_PRICE_INDEX)
export class IndexRollupProcessor extends WorkerHost {
  constructor(private readonly rollup: IndexRollupService) {
    super();
  }

  async process(_job: Job) {
    return this.rollup.rollupAll();
  }
}
