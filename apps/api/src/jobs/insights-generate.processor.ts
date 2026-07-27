import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InsightsService } from '../insights/insights.service';
import { QUEUE_INSIGHTS_GENERATE } from './queues';

@Processor(QUEUE_INSIGHTS_GENERATE)
export class InsightsGenerateProcessor extends WorkerHost {
  constructor(private readonly insights: InsightsService) {
    super();
  }

  async process(job: Job<{ householdId: string }>) {
    await this.insights.generateForHousehold(job.data.householdId);
  }
}
