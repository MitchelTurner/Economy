import { describe, expect, it, vi } from 'vitest';
import { AlertsService } from './alerts.service';

describe('AlertsService.patch', () => {
  it('toggles active for the owning user', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'a1',
      active: false,
      product: { id: 'p1', name: 'Milk' },
    });
    const prisma = {
      priceAlert: {
        findFirst: vi.fn().mockResolvedValue({ id: 'a1', userId: 'u1' }),
        update,
      },
    };
    const svc = new AlertsService(prisma as never);
    const row = await svc.patch(
      { userId: 'u1', householdId: 'h1', email: 'a@b.c', role: 'owner' },
      'a1',
      { active: false },
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { active: false },
      include: { product: true },
    });
    expect(row.active).toBe(false);
  });
});
