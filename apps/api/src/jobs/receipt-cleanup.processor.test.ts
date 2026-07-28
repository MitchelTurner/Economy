import { describe, expect, it, vi } from 'vitest';
import { ReceiptCleanupProcessor } from './receipt-cleanup.processor';

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
      },
    };
    const proc = new ReceiptCleanupProcessor(prisma as never, storage as never);
    const result = await proc.purgeOrphanUploads();
    expect(result.deleted).toBe(1);
    expect(deleteObject).toHaveBeenCalledWith('receipts/h1/orphan.jpg');
    expect(deleteObject).not.toHaveBeenCalledWith('receipts/h1/kept.jpg');
  });
});
