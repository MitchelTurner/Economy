import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InsightsService } from '../insights/insights.service';
import { SchedulersService } from './schedulers.service';
import { QUEUE_INSIGHTS_GENERATE } from './queues';

@Processor(QUEUE_INSIGHTS_GENERATE)
export class InsightsGenerateProcessor extends WorkerHost {
  constructor(
    private readonly insights: InsightsService,
    private readonly schedulers: SchedulersService,
  ) {
    super();
  }

  async process(job: Job<{ householdId?: string; allHouseholds?: boolean }>) {
    if (job.data.allHouseholds) {
      await this.schedulers.enqueueAllHouseholdInsights();
      return { fannedOut: true };
    }
    if (!job.data.householdId) return { skipped: true };
    return this.insights.generateForHousehold(job.data.householdId);
  }
}
