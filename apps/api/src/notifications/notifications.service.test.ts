import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('logs email when no Resend key (MAIL_PROVIDER=log)', async () => {
    const svc = new NotificationsService(
      new ConfigService({ MAIL_PROVIDER: 'log' }),
    );
    const sent = await svc.sendEmail({
      to: 'a@example.com',
      subject: 'Hello',
      text: 'Body',
    });
    expect(sent.provider).toBe('log');
    expect(svc.drainSent()).toHaveLength(1);
  });

  it('formats price alert and digest copy', async () => {
    const svc = new NotificationsService(
      new ConfigService({ MAIL_PROVIDER: 'log' }),
    );
    await svc.sendPriceAlert({
      to: 'a@example.com',
      productName: 'Milk',
      currentCents: 449,
      reason: 'down 15% from 30-day high',
    });
    await svc.sendWeeklyDigest({
      to: 'a@example.com',
      householdName: 'Demo',
      insightCount: 2,
      estimatedSavingsCents: 1200,
      highlights: [{ title: 'Stock up', body: 'Coffee is cheap' }],
    });
    const msgs = svc.drainSent();
    expect(msgs[0]!.subject).toContain('Milk');
    expect(msgs[0]!.text).toContain('$4.49');
    expect(msgs[1]!.text).toContain('$12.00');
  });
});
