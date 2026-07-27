import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_INSIGHTS_GENERATE,
  QUEUE_PRICE_INDEX,
  QUEUE_RECEIPT_CLEANUP,
} from './queues';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulersService implements OnModuleInit {
  private readonly logger = new Logger(SchedulersService.name);

  constructor(
    @InjectQueue(QUEUE_PRICE_INDEX) private readonly indexQueue: Queue,
    @InjectQueue(QUEUE_INSIGHTS_GENERATE) private readonly insightsQueue: Queue,
    @InjectQueue(QUEUE_RECEIPT_CLEANUP) private readonly cleanupQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Nightly index rollup 08:00 UTC
    await this.indexQueue.add(
      'nightly',
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        jobId: 'price-index-nightly',
        removeOnComplete: 20,
      },
    );

    // Weekly insights Sunday 14:00 UTC — fan out per household
    await this.insightsQueue.add(
      'weekly-all',
      { allHouseholds: true },
      {
        repeat: { pattern: '0 14 * * 0' },
        jobId: 'insights-weekly',
        removeOnComplete: 20,
      },
    );

    await this.cleanupQueue.add(
      'daily',
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'receipt-cleanup-daily',
        removeOnComplete: 10,
      },
    );

    this.logger.log('Registered BullMQ repeatable schedulers');
  }

  async enqueueInsightsForHousehold(householdId: string) {
    // Debounce: jobId per household so rapid confirms collapse
    await this.insightsQueue.add(
      'household',
      { householdId },
      {
        jobId: `insights-${householdId}`,
        delay: 5_000,
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );
  }

  async enqueueAllHouseholdInsights() {
    const households = await this.prisma.household.findMany({ select: { id: true } });
    for (const h of households) {
      await this.insightsQueue.add(
        'household',
        { householdId: h.id },
        { removeOnComplete: 50 },
      );
    }
  }
}
