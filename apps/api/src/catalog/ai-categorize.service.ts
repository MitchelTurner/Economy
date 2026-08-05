import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClaudeModel } from '../common/claude-model';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATEGORY_SLUGS,
  categoryTaxonomyPrompt,
  normalizeCategorySlug,
} from './category-taxonomy';

export type CategoryGuess = {
  slug: string;
  confidence: number;
};

/**
 * AI category assignment for receipt lines / product names.
 * Only assigns slugs from the seeded taxonomy — never invents categories.
 */
@Injectable()
export class AiCategorizeService {
  private readonly logger = new Logger(AiCategorizeService.name);
  private readonly anthropic: Anthropic | null;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = config.get<string>('ANTHROPIC_API_KEY')?.trim() || '';
    this.anthropic = key ? new Anthropic({ apiKey: key }) : null;
    this.model = resolveClaudeModel(
      config.get('CATEGORIZE_MODEL') ?? config.get('EXTRACTION_MODEL'),
    );
    const mode = (config.get('AI_CATEGORIZE') ?? 'auto').toLowerCase();
    this.enabled =
      mode === 'on' || (mode === 'auto' && Boolean(this.anthropic));
  }

  isEnabled() {
    return this.enabled && Boolean(this.anthropic);
  }

  /** Suggest a category slug for each rawText (same order; null = skip). */
  async suggestForTexts(rawTexts: string[]): Promise<Array<CategoryGuess | null>> {
    if (!this.isEnabled() || rawTexts.length === 0) {
      return rawTexts.map(() => null);
    }
    const cleaned = rawTexts.map((t) => t.trim()).filter(Boolean);
    if (!cleaned.length) return rawTexts.map(() => null);

    try {
      const response = await this.anthropic!.messages.create({
        model: this.model,
        max_tokens: 1200,
        system: `You classify grocery-receipt line items into a fixed taxonomy for an island household ledger.
${categoryTaxonomyPrompt()}
Rules:
- Return ONLY JSON: {"items":[{"i":0,"slug":"dairy","confidence":0.0-1.0}, ...]}
- One entry per input index i (0-based). Use slug null + confidence 0 when unsure.
- Prefer specific children (dairy) over groceries. Use other for non-food.
- Do not invent products or prices. Classify only from the printed text.`,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              lines: rawTexts.map((rawText, i) => ({ i, rawText })),
            }),
          },
        ],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n');
      const parsed = parseCategorizeJson(text);
      const byIndex = new Map<number, CategoryGuess>();
      for (const item of parsed) {
        const slug = normalizeCategorySlug(item.slug);
        if (!slug || (slug === 'groceries' && item.confidence < 0.4)) continue;
        byIndex.set(item.i, {
          slug,
          confidence: Math.min(1, Math.max(0, item.confidence)),
        });
      }
      return rawTexts.map((_, i) => byIndex.get(i) ?? null);
    } catch (err) {
      this.logger.warn(`AI categorize failed: ${(err as Error).message}`);
      return rawTexts.map(() => null);
    }
  }

  /**
   * Fill categoryId on receipt lines that still lack one (after product match).
   * Only applies guesses with confidence ≥ 0.55.
   */
  async fillUncategorizedLines(receiptId: string): Promise<{ updated: number }> {
    if (!this.isEnabled()) return { updated: 0 };

    const lines = await this.prisma.receiptLine.findMany({
      where: { receiptId, categoryId: null },
      select: { id: true, rawText: true },
      orderBy: { lineNumber: 'asc' },
    });
    if (!lines.length) return { updated: 0 };

    const guesses = await this.suggestForTexts(lines.map((l) => l.rawText));
    const categories = await this.prisma.category.findMany({
      select: { id: true, slug: true },
    });
    const bySlug = new Map(categories.map((c) => [c.slug, c.id]));

    let updated = 0;
    for (let i = 0; i < lines.length; i++) {
      const guess = guesses[i];
      if (!guess || guess.confidence < 0.55) continue;
      const categoryId = bySlug.get(guess.slug);
      if (!categoryId) continue;
      await this.prisma.receiptLine.update({
        where: { id: lines[i]!.id },
        data: { categoryId },
      });
      updated += 1;
    }

    if (updated) {
      this.logger.log(
        `AI categorized ${updated}/${lines.length} lines on receipt ${receiptId}`,
      );
    }
    return { updated };
  }

  /** Public suggest API — returns categoryId + slug for UI chips. */
  async suggestWithIds(rawTexts: string[]) {
    const guesses = await this.suggestForTexts(rawTexts);
    const categories = await this.prisma.category.findMany({
      select: { id: true, slug: true, name: true },
    });
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    return guesses.map((g) => {
      if (!g) return null;
      const cat = bySlug.get(g.slug);
      if (!cat) return null;
      return {
        categoryId: cat.id,
        slug: cat.slug,
        name: cat.name,
        confidence: g.confidence,
      };
    });
  }
}

function parseCategorizeJson(
  text: string,
): Array<{ i: number; slug: string | null; confidence: number }> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object');
  const obj = JSON.parse(raw.slice(start, end + 1)) as {
    items?: Array<{ i?: number; slug?: string | null; confidence?: number }>;
  };
  if (!Array.isArray(obj.items)) throw new Error('Missing items');
  return obj.items.map((it, idx) => ({
    i: typeof it.i === 'number' ? it.i : idx,
    slug: it.slug ?? null,
    confidence: typeof it.confidence === 'number' ? it.confidence : 0.5,
  }));
}

/** Exported for tests — validates taxonomy constants stay non-empty. */
export function allowedSlugsForPrompt() {
  return CATEGORY_SLUGS;
}
