import { describe, expect, it, vi } from 'vitest';
import { ReceiptCleanupProcessor } from './receipt-cleanup.processor';
import { STALE_EXTRACTING_MS } from '../receipts/receipts.service';

describe('ReceiptCleanupProcessor', () => {
  it('deletes storage keys with no matching receipt row', async () => {
    const deleteObject = vi.fn();
    const storage = {
      listKeys: vi.fn().mockResolvedValue([
        'receipts/h1/orphan.jpg',
        'receipts/h1/kept.jpg',
      ]),
      deleteObject,
    };
    const prisma = {
      receipt: {
        findMany: vi.fn().mockResolvedValue([{ imageKey: 'receipts/h1/kept.jpg' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const proc = new ReceiptCleanupProcessor(prisma as never, storage as never);
    const result = await proc.purgeOrphanUploads();
    expect(result.deleted).toBe(1);
    expect(deleteObject).toHaveBeenCalledWith('receipts/h1/orphan.jpg');
    expect(deleteObject).not.toHaveBeenCalledWith('receipts/h1/kept.jpg');
  });

  it('marks aged EXTRACTING receipts as FAILED', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      receipt: { updateMany },
    };
    const proc = new ReceiptCleanupProcessor(prisma as never, {
      listKeys: vi.fn(),
      deleteObject: vi.fn(),
    } as never);
    const now = Date.UTC(2026, 6, 28, 12, 0, 0);
    const res = await proc.failStaleExtracting(now);
    expect(res.staleExtractingFailed).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: 'EXTRACTING',
        updatedAt: { lt: new Date(now - STALE_EXTRACTING_MS) },
      },
      data: {
        status: 'FAILED',
        failureReason: expect.stringContaining('stalled'),
      },
    });
  });
});
