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
    const key = config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = key ? new Anthropic({ apiKey: key }) : null;
    const mode = (config.get('INSIGHT_NARRATION') ?? 'auto').toLowerCase();
    this.enabled =
      mode === 'on' || (mode === 'auto' && Boolean(this.anthropic));
    this.model = resolveClaudeModel(
      config.get('NARRATION_MODEL') ?? config.get('EXTRACTION_MODEL'),
    );
  }

  async narrateMany(drafts: InsightDraft[]): Promise<InsightDraft[]> {
    if (!this.enabled || !this.anthropic || drafts.length === 0) return drafts;
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
        system: `You rewrite household spending insight copy for a receipt-tracking app.
Rules:
- Keep every dollar amount (e.g. $12.40) and every integer percent (e.g. 27%) exactly as given.
- Do not invent new numbers, store names, or products.
- Return ONLY JSON: {"title":"...","body":"..."}.
- Title ≤ 80 chars. Body ≤ 280 chars. Plain text, no markdown.`,
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

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n');
      const json = parseJsonObject(text) as { title?: string; body?: string };
      if (!json.title || !json.body) return draft;

      const combined = `${json.title}\n${json.body}`;
      if (!mustKeep.every((t) => combined.includes(t))) {
        this.logger.warn(
          `Narration dropped protected token for ${draft.type}; keeping template`,
        );
        return draft;
      }

      return {
        ...draft,
        title: json.title.slice(0, 120),
        body: json.body.slice(0, 400),
      };
    } catch (err) {
      this.logger.warn(`Narration failed: ${(err as Error).message}`);
      return draft;
    }
  }
}

/** Dollar amounts and bare integer percents that must survive rewriting. */
export function extractProtectedTokens(text: string): string[] {
  const dollars = text.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  const pcts = text.match(/\b\d+%/g) ?? [];
  return [...new Set([...dollars, ...pcts])];
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}
