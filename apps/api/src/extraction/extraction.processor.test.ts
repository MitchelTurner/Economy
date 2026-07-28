import { describe, expect, it, vi } from 'vitest';
import { ExtractionProcessor } from './extraction.processor';

describe('ExtractionProcessor', () => {
  it('marks the receipt FAILED when processReceipt throws', async () => {
    const processReceipt = vi.fn().mockRejectedValue(new Error('provider down'));
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const proc = new ExtractionProcessor({
      processReceipt,
      markFailed,
    } as never);
    await expect(
      proc.process({ data: { receiptId: 'r1' } } as never),
    ).rejects.toThrow('provider down');
    expect(markFailed).toHaveBeenCalledWith(
      'r1',
      'Extraction crashed: provider down',
    );
  });
});
