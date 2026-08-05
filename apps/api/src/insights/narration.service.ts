import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClaudeModel } from '../common/claude-model';
import { InsightDraft } from './rules/types';

/**
 * Optional LLM phrasing for insight copy. Detection stays deterministic —
 * the model may only rewrite title/body and must preserve every dollar figure
 * and integer percent already present in the draft.
 */
@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name);
  private readonly anthropic: Anthropic | null;
  private readonly enabled: boolean;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('ANTHROPIC_API_KEY')?.trim() || '';
    this.anthropic = key ? new Anthropic({ apiKey: key }) : null;
    const mode = (config.get('INSIGHT_NARRATION') ?? 'auto').toLowerCase();
    this.enabled =
      mode === 'on' || (mode === 'auto' && Boolean(this.anthropic));
    this.model = resolveClaudeModel(
      config.get('NARRATION_MODEL') ?? config.get('EXTRACTION_MODEL'),
    );
  }

  isEnabled() {
    return this.enabled && Boolean(this.anthropic);
  }

  async narrateMany(drafts: InsightDraft[]): Promise<InsightDraft[]> {
    if (!this.enabled || !this.anthropic || drafts.length === 0) return drafts;

    // Batch rewrite — one call for coherence + fewer round-trips.
    try {
      const batched = await this.narrateBatch(drafts);
      if (batched) return batched;
    } catch (err) {
      this.logger.warn(`Batch narration failed: ${(err as Error).message}`);
    }

    const out: InsightDraft[] = [];
    for (const draft of drafts) {
      out.push(await this.narrate(draft));
    }
    return out;
  }

  async narrate(draft: InsightDraft): Promise<InsightDraft> {
    if (!this.enabled || !this.anthropic) return draft;

    const mustKeep = extractProtectedTokens(`${draft.title}\n${draft.body}`);
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 400,
        system: NARRATION_SYSTEM,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              type: draft.type,
              title: draft.title,
              body: draft.body,
              estimatedSavingsCents: draft.estimatedSavingsCents ?? null,
              data: draft.data,
            }),
          },
        ],
      });

      const text = responseText(response);
      const json = parseJsonObject(text) as { title?: string; body?: string };
      return applyNarration(draft, json, mustKeep, this.logger);
    } catch (err) {
      this.logger.warn(`Narration failed: ${(err as Error).message}`);
      return draft;
    }
  }

  /**
   * Short AI headline for the weekly digest. Numbers must already appear in
   * the source insights — the model only summarizes.
   */
  async summarizeDigest(
    insights: Array<{
      title: string;
      body: string;
      type: string;
      estimatedSavingsCents: number | null;
    }>,
    estimatedSavingsCents: number,
  ): Promise<string | null> {
    if (!this.isEnabled() || insights.length === 0) return null;

    const mustKeep = extractProtectedTokens(
      insights.map((i) => `${i.title} ${i.body}`).join('\n') +
        ` $${(estimatedSavingsCents / 100).toFixed(2)}`,
    );

    try {
      const response = await this.anthropic!.messages.create({
        model: this.model,
        max_tokens: 220,
        system: `You write a 1–2 sentence weekly spending digest for an island household ledger.
Rules:
- Use only facts from the provided insights. Do not invent numbers, stores, or products.
- Keep every dollar amount (e.g. $12.40) and integer percent (e.g. 27%) that you include exactly as given.
- Prefer actionable tone: what to watch or do next at the store.
- Return ONLY JSON: {"summary":"..."}. Max 220 characters. Plain text, no markdown.`,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              estimatedSavingsCents,
              insights: insights.slice(0, 8).map((i) => ({
                type: i.type,
                title: i.title,
                body: i.body,
                estimatedSavingsCents: i.estimatedSavingsCents,
              })),
            }),
          },
        ],
      });

      const text = responseText(response);
      const json = parseJsonObject(text) as { summary?: string };
      if (!json.summary?.trim()) return null;
      const summary = json.summary.trim().slice(0, 280);
      // If the model invented a $-figure not in sources, reject.
      const summaryDollars = summary.match(/\$\d+(?:\.\d{2})?/g) ?? [];
      const allowed = new Set(mustKeep.filter((t) => t.startsWith('$')));
      // Allow the aggregate savings figure we passed in.
      allowed.add(`$${(estimatedSavingsCents / 100).toFixed(2)}`);
      if (estimatedSavingsCents % 100 === 0) {
        allowed.add(`$${(estimatedSavingsCents / 100).toFixed(0)}`);
      }
      for (const d of summaryDollars) {
        if (!allowed.has(d) && !mustKeep.some((t) => t === d)) {
          this.logger.warn('Digest summary invented a dollar figure; skipping AI summary');
          return null;
        }
      }
      return summary;
    } catch (err) {
      this.logger.warn(`Digest summary failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async narrateBatch(drafts: InsightDraft[]): Promise<InsightDraft[] | null> {
    const client = this.anthropic!;
    const protectedByIndex = drafts.map((d) =>
      extractProtectedTokens(`${d.title}\n${d.body}`),
    );

    const response = await client.messages.create({
      model: this.model,
      max_tokens: Math.min(3500, 280 + drafts.length * 180),
      system: `${NARRATION_SYSTEM}
You will receive an array of insights. Return ONLY JSON:
{"items":[{"i":0,"title":"...","body":"..."}, ...]}
One item per input index. Keep each insight's protected $ and % tokens.`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            insights: drafts.map((d, i) => ({
              i,
              type: d.type,
              title: d.title,
              body: d.body,
              estimatedSavingsCents: d.estimatedSavingsCents ?? null,
              data: d.data,
            })),
          }),
        },
      ],
    });

    const text = responseText(response);
    const obj = parseJsonObject(text) as {
      items?: Array<{ i?: number; title?: string; body?: string }>;
    };
    if (!Array.isArray(obj.items) || obj.items.length === 0) return null;

    const byIndex = new Map<number, { title: string; body: string }>();
    for (const item of obj.items) {
      if (typeof item.i !== 'number' || !item.title || !item.body) continue;
      byIndex.set(item.i, { title: item.title, body: item.body });
    }

    return drafts.map((draft, i) => {
      const rewritten = byIndex.get(i);
      if (!rewritten) return draft;
      return applyNarration(draft, rewritten, protectedByIndex[i]!, this.logger);
    });
  }
}

const NARRATION_SYSTEM = `You rewrite household spending insight copy for Island Ledger (island cost-of-goods tracker).
Rules:
- Keep every dollar amount (e.g. $12.40) and every integer percent (e.g. 27%) exactly as given.
- Do not invent new numbers, store names, products, or savings.
- Make the copy specific and actionable for a household shopping on an island (limited stores, freight-driven prices).
- Return ONLY JSON: {"title":"...","body":"..."}.
- Title ≤ 80 chars. Body ≤ 280 chars. Plain text, no markdown.`;

/** Dollar amounts and bare integer percents that must survive rewriting. */
export function extractProtectedTokens(text: string): string[] {
  const dollars = text.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  const pcts = text.match(/\b\d+%/g) ?? [];
  return [...new Set([...dollars, ...pcts])];
}

function applyNarration(
  draft: InsightDraft,
  json: { title?: string; body?: string },
  mustKeep: string[],
  logger: Logger,
): InsightDraft {
  if (!json.title || !json.body) return draft;
  const combined = `${json.title}\n${json.body}`;
  if (!mustKeep.every((t) => combined.includes(t))) {
    logger.warn(`Narration dropped protected token for ${draft.type}; keeping template`);
    return draft;
  }
  return {
    ...draft,
    title: json.title.slice(0, 120),
    body: json.body.slice(0, 400),
  };
}

function responseText(response: Anthropic.Message): string {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n');
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}
