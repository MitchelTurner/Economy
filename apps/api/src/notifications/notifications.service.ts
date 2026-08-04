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
    const html = msg.html ?? plainToHtml(msg.text);

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
            html,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          this.logger.warn(`Resend failed (${res.status}): ${body}`);
        } else {
          const data = (await res.json()) as { id?: string };
          const record: SentEmail = {
            ...msg,
            html,
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
      html,
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
    const text = [
      `${opts.productName} is now $${dollars}.`,
      opts.reason,
      '',
      'Open Island Ledger → Alerts to manage notifications.',
    ].join('\n');
    return this.sendEmail({
      to: opts.to,
      subject: `Price alert: ${opts.productName} is $${dollars}`,
      text,
      html: brandedHtml({
        title: 'Price alert',
        bodyHtml: `<p><strong>${escapeHtml(opts.productName)}</strong> is now <strong>$${dollars}</strong>.</p><p>${escapeHtml(opts.reason)}</p>`,
        ctaLabel: 'Manage alerts',
        ctaHref: appOrigin(this.config) + '/alerts',
      }),
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
    const listHtml = opts.highlights
      .slice(0, 5)
      .map(
        (h) =>
          `<li style="margin:0 0 8px"><strong>${escapeHtml(h.title)}</strong><br/><span style="color:#4a6358">${escapeHtml(h.body)}</span></li>`,
      )
      .join('');
    const text = [
      `Here's this week's digest for ${opts.householdName}.`,
      `${opts.insightCount} active insights · ~$${savings} estimated savings surfaced.`,
      '',
      ...lines,
      '',
      'Open Island Ledger → Insights for the full feed.',
    ].join('\n');
    return this.sendEmail({
      to: opts.to,
      subject: `Weekly Island Ledger digest — ${opts.insightCount} insights`,
      text,
      html: brandedHtml({
        title: 'Weekly digest',
        bodyHtml: `<p>Here's this week's digest for <strong>${escapeHtml(opts.householdName)}</strong>.</p><p>${opts.insightCount} active insights · ~$${savings} estimated savings.</p><ul style="padding-left:18px">${listHtml}</ul>`,
        ctaLabel: 'Open insights',
        ctaHref: appOrigin(this.config) + '/insights',
      }),
    });
  }

  async sendInvite(opts: {
    to: string;
    householdName: string;
    inviteUrl: string;
    invitedBy?: string | null;
  }) {
    const who = opts.invitedBy ? `${opts.invitedBy} invited you` : 'You were invited';
    const text = [
      `${who} to the household "${opts.householdName}".`,
      '',
      `Accept here: ${opts.inviteUrl}`,
      '',
      'This link expires in 7 days.',
    ].join('\n');
    return this.sendEmail({
      to: opts.to,
      subject: `Join ${opts.householdName} on Island Ledger`,
      text,
      html: brandedHtml({
        title: 'Household invite',
        bodyHtml: `<p>${escapeHtml(who)} to the household <strong>${escapeHtml(opts.householdName)}</strong>.</p><p>This link expires in 7 days.</p>`,
        ctaLabel: 'Accept invite',
        ctaHref: opts.inviteUrl,
      }),
    });
  }

  async sendPasswordReset(opts: { to: string; resetUrl: string }) {
    const text = [
      'We received a request to reset your Island Ledger password.',
      '',
      `Reset your password: ${opts.resetUrl}`,
      '',
      'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',
    ].join('\n');
    return this.sendEmail({
      to: opts.to,
      subject: 'Reset your Island Ledger password',
      text,
      html: brandedHtml({
        title: 'Password reset',
        bodyHtml:
          '<p>We received a request to reset your Island Ledger password.</p><p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>',
        ctaLabel: 'Choose a new password',
        ctaHref: opts.resetUrl,
      }),
    });
  }
}

function appOrigin(config: ConfigService) {
  return (
    config.get('CORS_ORIGIN')?.split(',')[0]?.trim() ||
    'http://localhost:5173'
  );
}

function brandedHtml(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#eef4f0;font-family:Source Sans 3,Segoe UI,sans-serif;color:#14231d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f0;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid rgba(20,35,29,0.12);border-radius:12px;padding:24px">
        <tr><td>
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#0c4a3e">Island Ledger</p>
          <p style="margin:0 0 16px;font-size:14px;color:#4a6358">${escapeHtml(opts.title)}</p>
          ${opts.bodyHtml}
          <p style="margin:24px 0 0">
            <a href="${escapeHtml(opts.ctaHref)}" style="display:inline-block;background:#0c4a3e;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px">${escapeHtml(opts.ctaLabel)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function plainToHtml(text: string) {
  return brandedHtml({
    title: 'Message',
    bodyHtml: `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeHtml(text)}</pre>`,
    ctaLabel: 'Open Island Ledger',
    ctaHref: 'https://islandledger.local',
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
