import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { STALE_EXTRACTING_MS } from '../receipts/receipt-stale';
import { QUEUE_RECEIPT_CLEANUP } from './queues';

/**
 * SPEC §5: purge failed uploads with no receipt row.
 * Also fail-closed aged EXTRACTING receipts stuck after worker crashes.
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
    const orphans = await this.purgeOrphanUploads();
    const stuck = await this.failStaleExtracting();
    return { ...orphans, ...stuck };
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

  async failStaleExtracting(now = Date.now()) {
    const cutoff = new Date(now - STALE_EXTRACTING_MS);
    const result = await this.prisma.receipt.updateMany({
      where: {
        status: ReceiptStatus.EXTRACTING,
        updatedAt: { lt: cutoff },
      },
      data: {
        status: ReceiptStatus.FAILED,
        failureReason: `Extraction stalled (no progress for ${Math.round(STALE_EXTRACTING_MS / 60_000)}+ minutes)`,
      },
    });
    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} stale EXTRACTING receipt(s) as FAILED`);
    }
    return { staleExtractingFailed: result.count };
  }
}
