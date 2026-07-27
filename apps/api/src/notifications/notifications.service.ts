import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SentEmail = OutboundEmail & {
  provider: 'resend' | 'log';
  id: string;
};

/**
 * Thin mailer: Resend when RESEND_API_KEY is set, otherwise structured log
 * (dev-friendly; never throws into receipt/insight pipelines).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sent: SentEmail[] = [];

  constructor(private readonly config: ConfigService) {}

  /** Test helper — last N sent messages (including log provider). */
  drainSent(): SentEmail[] {
    return this.sent.splice(0, this.sent.length);
  }

  async sendEmail(msg: OutboundEmail): Promise<SentEmail> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from =
      this.config.get<string>('MAIL_FROM') ?? 'Island Ledger <noreply@islandledger.local>';
    const forceLog = (this.config.get('MAIL_PROVIDER') ?? '').toLowerCase() === 'log';

    if (apiKey && !forceLog) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [msg.to],
            subject: msg.subject,
            text: msg.text,
            html: msg.html ?? `<pre>${escapeHtml(msg.text)}</pre>`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          this.logger.warn(`Resend failed (${res.status}): ${body}`);
        } else {
          const data = (await res.json()) as { id?: string };
          const record: SentEmail = {
            ...msg,
            provider: 'resend',
            id: data.id ?? `resend-${Date.now()}`,
          };
          this.sent.push(record);
          return record;
        }
      } catch (err) {
        this.logger.warn(`Resend error: ${(err as Error).message}`);
      }
    }

    const record: SentEmail = {
      ...msg,
      provider: 'log',
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.sent.push(record);
    this.logger.log(
      `[mail:${record.provider}] to=${msg.to} subject="${msg.subject}"\n${msg.text}`,
    );
    return record;
  }

  async sendPriceAlert(opts: {
    to: string;
    productName: string;
    currentCents: number;
    reason: string;
  }) {
    const dollars = (opts.currentCents / 100).toFixed(2);
    return this.sendEmail({
      to: opts.to,
      subject: `Price alert: ${opts.productName} is $${dollars}`,
      text: [
        `${opts.productName} is now $${dollars}.`,
        opts.reason,
        '',
        'Open Island Ledger → Alerts to manage notifications.',
      ].join('\n'),
    });
  }

  async sendWeeklyDigest(opts: {
    to: string;
    householdName: string;
    insightCount: number;
    estimatedSavingsCents: number;
    highlights: Array<{ title: string; body: string }>;
  }) {
    const savings = (opts.estimatedSavingsCents / 100).toFixed(2);
    const lines = opts.highlights
      .slice(0, 5)
      .map((h, i) => `${i + 1}. ${h.title}\n   ${h.body}`);
    return this.sendEmail({
      to: opts.to,
      subject: `Weekly Island Ledger digest — ${opts.insightCount} insights`,
      text: [
        `Here's this week's digest for ${opts.householdName}.`,
        `${opts.insightCount} active insights · ~$${savings} estimated savings surfaced.`,
        '',
        ...lines,
        '',
        'Open Island Ledger → Insights for the full feed.',
      ].join('\n'),
    });
  }

  async sendInvite(opts: {
    to: string;
    householdName: string;
    inviteUrl: string;
    invitedBy?: string | null;
  }) {
    const who = opts.invitedBy ? `${opts.invitedBy} invited you` : 'You were invited';
    return this.sendEmail({
      to: opts.to,
      subject: `Join ${opts.householdName} on Island Ledger`,
      text: [
        `${who} to the household "${opts.householdName}".`,
        '',
        `Accept here: ${opts.inviteUrl}`,
        '',
        'This link expires in 7 days.',
      ].join('\n'),
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
