import { describe, expect, it } from 'vitest';
import { buildReceiptSearchOr } from './receipts.service';

describe('buildReceiptSearchOr', () => {
  it('returns null for empty query', () => {
    expect(buildReceiptSearchOr(undefined)).toBeNull();
    expect(buildReceiptSearchOr('   ')).toBeNull();
  });

  it('searches store, lines, and payment method', () => {
    const or = buildReceiptSearchOr('Safeway');
    expect(or).toEqual(
      expect.arrayContaining([
        { store: { name: { contains: 'Safeway', mode: 'insensitive' } } },
        {
          lines: {
            some: { rawText: { contains: 'Safeway', mode: 'insensitive' } },
          },
        },
        { paymentMethod: { contains: 'Safeway', mode: 'insensitive' } },
      ]),
    );
    expect(or?.some((c) => 'totalCents' in c)).toBe(false);
  });

  it('adds totalCents match for dollar-like queries', () => {
    const or = buildReceiptSearchOr('$12.50');
    expect(or).toEqual(
      expect.arrayContaining([{ totalCents: 1250 }]),
    );
  });
});
