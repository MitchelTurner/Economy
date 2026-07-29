import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const CompareProductIdsSchema = z
  .string()
  .max(2000)
  .optional()
  .transform((raw) =>
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(64)).max(40));

const DeliveredQuantitySchema = z.coerce.number().finite().positive().max(10_000);

describe('prices query bounds', () => {
  it('parses up to 40 product ids', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`).join(',');
    expect(CompareProductIdsSchema.parse(ids)).toHaveLength(40);
    expect(CompareProductIdsSchema.safeParse(`${ids},p40`).success).toBe(false);
  });

  it('rejects non-positive delivered quantity', () => {
    expect(DeliveredQuantitySchema.parse('2.5')).toBe(2.5);
    expect(DeliveredQuantitySchema.safeParse('0').success).toBe(false);
    expect(DeliveredQuantitySchema.safeParse('-1').success).toBe(false);
  });
});
