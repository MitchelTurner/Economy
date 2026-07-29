import { describe, expect, it } from 'vitest';
import { ListReceiptsQuerySchema } from './receipts.dto';

describe('ListReceiptsQuerySchema', () => {
  it('defaults limit and accepts q', () => {
    const parsed = ListReceiptsQuerySchema.parse({ q: 'milk' });
    expect(parsed.limit).toBe(30);
    expect(parsed.q).toBe('milk');
  });

  it('rejects oversized limit and q', () => {
    expect(ListReceiptsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(ListReceiptsQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});
