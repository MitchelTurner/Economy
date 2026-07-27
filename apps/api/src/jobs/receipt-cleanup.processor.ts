import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_RECEIPT_CLEANUP } from './queues';

@Processor(QUEUE_RECEIPT_CLEANUP)
export class ReceiptCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptCleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    // Failed receipts older than 7 days with no confirmed follow-up — soft purge reason only
    const result = await this.prisma.receipt.deleteMany({
      where: {
        status: 'FAILED',
        createdAt: { lt: cutoff },
        reviewedAt: null,
      },
    });
    this.logger.log(`Purged ${result.count} stale failed receipts`);
    return result;
  }
}
