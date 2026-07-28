import { describe, expect, it, vi } from 'vitest';
import { IndexRollupProcessor } from './index-rollup.processor';

describe('IndexRollupProcessor', () => {
  it('calls rollupAll for nightly job', async () => {
    const rollupAll = vi.fn().mockResolvedValue({ points: 3 });
    const proc = new IndexRollupProcessor({ rollupAll } as never);
    const result = await proc.process({} as never);
    expect(rollupAll).toHaveBeenCalledOnce();
    expect(result).toEqual({ points: 3 });
  });
});
