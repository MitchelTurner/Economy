import { describe, expect, it, vi } from 'vitest';
import { PricesProcessor } from './prices.processor';

describe('PricesProcessor emailAlerts prefs', () => {
  it('skips price alert email when user emailAlerts is false', async () => {
    const sendPriceAlert = vi.fn();
    const prisma = {
      receipt: {
        findUnique: vi.fn().mockResolvedValue({ householdId: 'h1' }),
      },
      priceAlert: {
        findUnique: vi.fn().mockResolvedValue({
          user: { email: 'a@b.c', emailAlerts: false },
        }),
      },
    };
    const proc = new PricesProcessor(
      { observeFromReceipt: vi.fn() } as never,
      {
        checkHousehold: vi.fn().mockResolvedValue([
          {
            alertId: 'a1',
            productId: 'p1',
            productName: 'Milk',
            currentCents: 400,
            reason: 'drop',
          },
        ]),
      } as never,
      prisma as never,
      { sendPriceAlert } as never,
    );
    await proc.process({ data: { receiptId: 'r1' } } as never);
    expect(sendPriceAlert).not.toHaveBeenCalled();
  });
});
