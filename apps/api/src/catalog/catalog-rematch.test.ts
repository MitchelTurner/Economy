import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

describe('CatalogService.matchReceipt', () => {
  it('clears stale non-manual product bindings when rematch misses', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      receipt: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'r1',
          storeId: 's1',
          lines: [
            {
              id: 'l1',
              rawText: 'UNKNOWN SNACK XYZ',
              productId: 'old-p',
              categoryId: 'c1',
              matchMethod: 'fuzzy',
              matchConfidence: 0.6,
            },
            {
              id: 'l2',
              rawText: 'KEEP ME',
              productId: 'manual-p',
              categoryId: 'c2',
              matchMethod: 'manual',
              matchConfidence: 1,
            },
          ],
        }),
      },
      receiptLine: { update },
      product: { findUnique: vi.fn() },
      productAlias: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new CatalogService(prisma as never);
    vi.spyOn(svc, 'matchRawText').mockResolvedValue({
      productId: null,
      confidence: 0,
      method: null,
      suggestions: [],
    });

    const res = await svc.matchReceipt('r1');
    expect(res).toEqual({ matched: 1, unmatched: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: {
        productId: null,
        matchConfidence: null,
        matchMethod: null,
      },
    });
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l2' } }),
    );
  });

  it('updates bindings when rematch finds a product', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      receipt: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'r1',
          storeId: 's1',
          lines: [
            {
              id: 'l1',
              rawText: 'MILK',
              productId: null,
              categoryId: null,
              matchMethod: null,
              matchConfidence: null,
            },
          ],
        }),
      },
      receiptLine: { update },
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p1',
          categoryId: 'c-dairy',
        }),
      },
    };
    const svc = new CatalogService(prisma as never);
    vi.spyOn(svc, 'matchRawText').mockResolvedValue({
      productId: 'p1',
      confidence: 0.9,
      method: 'fuzzy',
      suggestions: [],
    });

    const res = await svc.matchReceipt('r1');
    expect(res).toEqual({ matched: 1, unmatched: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: {
        productId: 'p1',
        matchConfidence: 0.9,
        matchMethod: 'fuzzy',
        categoryId: 'c-dairy',
      },
    });
  });
});
