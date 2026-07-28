import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { QUEUE_RECEIPT_CLEANUP } from './queues';

/**
 * SPEC §5: purge failed uploads with no receipt row.
 * Lists object keys under receipts/ and deletes those not referenced by Receipt.imageKey.
 */
@Processor(QUEUE_RECEIPT_CLEANUP)
export class ReceiptCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(_job: Job) {
    return this.purgeOrphanUploads();
  }

  async purgeOrphanUploads() {
    const keys = await this.storage.listKeys('receipts/');
    if (keys.length === 0) {
      return { scanned: 0, orphans: 0, deleted: 0 };
    }

    const linked = await this.prisma.receipt.findMany({
      where: { imageKey: { in: keys } },
      select: { imageKey: true },
    });
    const linkedSet = new Set(linked.map((r) => r.imageKey));
    const orphans = keys.filter((k) => !linkedSet.has(k));

    for (const key of orphans) {
      await this.storage.deleteObject(key);
    }

    this.logger.log(
      `Orphan upload cleanup: scanned=${keys.length} orphans=${orphans.length} deleted=${orphans.length}`,
    );
    return { scanned: keys.length, orphans: orphans.length, deleted: orphans.length };
  }
}
