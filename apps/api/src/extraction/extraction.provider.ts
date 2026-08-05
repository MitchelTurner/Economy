import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { resolveClaudeModel } from '../common/claude-model';
import { categoryTaxonomyPrompt } from '../catalog/category-taxonomy';
import { ExtractionResult, ExtractionResultSchema } from './extraction.schema';
import { MOCK_SCENARIOS } from './mock-scenarios';

export type ExtractionCallResult = {
  result: ExtractionResult;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM_PROMPT = `You are a careful grocery-receipt OCR extractor. Your job is to transcribe ONLY what is visibly printed on the receipt image.

Hard rules — violating any of these is a failure:
- Do NOT invent products, prices, stores, dates, payment methods, or quantities.
- Do NOT use typical grocery knowledge to "fill in" missing or blurry text.
- If a field is unreadable or absent, use null (or omit the line). Never guess.
- rawText must be the characters as printed (abbreviations, truncations, store codes). Do not expand "MLK" into "milk".
- Include a line ONLY when you can read an item description AND a price (or quantity×unit price) on that line.
- Skip headers, footers, loyalty messages, coupons without a clear charged amount, blank lines, and illegible rows.
- Money fields are integer US cents (e.g. $5.49 → 549).
- Prefer fewer accurate lines over a complete but fabricated basket.
- Set confidence low (≤0.5) when the image is blurry, cropped, or many lines are uncertain; high (≥0.85) only when totals clearly match readable lines.

Return ONLY valid JSON (no markdown) matching this shape:
{
  "store": {"name": string|null, "address": string|null},
  "purchasedAt": ISO-8601 string|null,
  "paymentMethod": string|null,
  "currency": "USD",
  "subtotalCents": int|null,
  "taxCents": int|null,
  "totalCents": int|null,
  "lines": [{
    "lineNumber": positive int,
    "rawText": string,
    "quantity": positive number,
    "unitPriceCents": int|null,
    "extendedCents": int,
    "discountCents": int,
    "isTaxable": boolean,
    "isRefund": boolean,
    "guessedCategory": string|null
  }],
  "confidence": number 0-1
}
${categoryTaxonomyPrompt()}
guessedCategory must be one of those slugs (or null). Prefer the most specific child.
If the image is not a receipt or nothing is readable, return lines: [] is NOT allowed by schema — instead return a single line with rawText "UNREADABLE" and extendedCents 0, totalCents null, confidence ≤0.2.
Line extendedCents (minus discounts) + tax should approximately equal totalCents when totals are readable; if they do not, lower confidence and do not invent lines to force a match.`;

/** True for JPEG/PNG/WebP/GIF payloads (real camera uploads), not eval fixture strings. */
export function looksLikeImageBytes(buf: Buffer): boolean {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true; // PNG
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return true;
  return false;
}

@Injectable()
export class ExtractionProvider {
  private readonly logger = new Logger(ExtractionProvider.name);
  private readonly anthropic: Anthropic | null;
  private readonly model: string;
  private readonly providerMode: string;
  private readonly allowMock: boolean;

  constructor(private readonly config: ConfigService) {
    // Trim — Railway/paste often leaves trailing newlines that break the SDK.
    const key = config.get<string>('ANTHROPIC_API_KEY')?.trim() || '';
    this.anthropic = key ? new Anthropic({ apiKey: key }) : null;
    const configuredModel = config.get<string>('EXTRACTION_MODEL');
    this.model = resolveClaudeModel(configuredModel);
    if (configuredModel?.trim() && configuredModel.trim() !== this.model) {
      this.logger.warn(
        `EXTRACTION_MODEL=${configuredModel.trim()} is retired on the Claude API; using ${this.model}`,
      );
    }
    const configured = (config.get<string>('EXTRACTION_PROVIDER') ?? '').trim().toLowerCase();
    this.providerMode = configured || (key ? 'anthropic' : 'mock');
    this.allowMock =
      (config.get('ALLOW_MOCK_EXTRACTION') ?? 'true').toLowerCase() !== 'false';
    const nodeEnv = (config.get('NODE_ENV') ?? process.env.NODE_ENV ?? 'development').toLowerCase();
    this.logger.log(
      `Extraction boot: EXTRACTION_PROVIDER=${this.providerMode} ANTHROPIC_API_KEY=${key ? 'yes' : 'NO'} model=${this.model}`,
    );
    if (
      nodeEnv === 'production' &&
      (this.providerMode === 'mock' || !this.anthropic) &&
      !this.allowMock
    ) {
      throw new Error(
        'Production extraction requires ANTHROPIC_API_KEY and EXTRACTION_PROVIDER=anthropic (or set ALLOW_MOCK_EXTRACTION=true)',
      );
    }
  }

  async extract(
    imageBytes: Buffer,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg',
    retryHint?: string,
  ): Promise<ExtractionCallResult> {
    // Real photos always use Claude when a key is present — leftover EXTRACTION_PROVIDER=mock
    // from demo deploys must not force the canned basket / "key missing" failure.
    const fixturePrefix = imageBytes.toString('utf8', 0, 64);
    const isFixture = /^fixture:/i.test(fixturePrefix);
    const useAnthropic =
      Boolean(this.anthropic) &&
      (this.providerMode === 'anthropic' || (looksLikeImageBytes(imageBytes) && !isFixture));

    if (!useAnthropic) {
      if (!this.anthropic && this.providerMode === 'anthropic') {
        throw new Error(
          'EXTRACTION_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing on this API service. ' +
            'Add ANTHROPIC_API_KEY (Variables → Deploy), check spelling, then redeploy.',
        );
      }
      if (!this.allowMock && this.providerMode !== 'mock') {
        throw new Error('ANTHROPIC_API_KEY missing and mock extraction is disabled');
      }
      return this.mockExtract(imageBytes, retryHint);
    }

    return this.anthropicExtract(imageBytes, mediaType, retryHint);
  }

  private async anthropicExtract(
    imageBytes: Buffer,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
    retryHint?: string,
  ): Promise<ExtractionCallResult> {
    const client = this.anthropic!;
    const userText = retryHint
      ? `Your previous output failed arithmetic check: ${retryHint}. Re-read the image only — fix math using printed totals; do not invent new items.`
      : 'Transcribe this receipt into the JSON schema. Only include what you can actually read.';

    let response;
    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBytes.toString('base64'),
                },
              },
              { type: 'text', text: userText },
            ],
          },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not_found_error|model:/i.test(msg)) {
        throw new Error(
          `Claude model "${this.model}" was not found (retired or typo). ` +
            `Set EXTRACTION_MODEL=claude-sonnet-4-6 on the API service and redeploy. (${msg})`,
        );
      }
      throw err;
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n');

    const json = this.parseJson(text);
    const result = ExtractionResultSchema.parse(json);
    return {
      result,
      model: this.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /** Deterministic mock for local/dev and tests. Scenario via `fixture:<id>` buffer. */
  mockExtract(imageBytes: Buffer, retryHint?: string): ExtractionCallResult {
    const asText = imageBytes.toString('utf8');
    const fixtureMatch = asText.match(/^fixture:([a-z0-9-]+)/i);

    // Real camera uploads must not get a canned Safeway basket — that looks like hallucination.
    if (looksLikeImageBytes(imageBytes) && !fixtureMatch) {
      throw new Error(
        'Mock extraction cannot read receipt photos (it invents a fake basket). ' +
          'Set EXTRACTION_PROVIDER=anthropic and ANTHROPIC_API_KEY on the API service, then re-extract.',
      );
    }

    const corrupt = asText.includes('CORRUPT_EXTRACTION');
    const scenarioKey = fixtureMatch?.[1];
    const base =
      (scenarioKey && MOCK_SCENARIOS[scenarioKey]) ||
      MOCK_SCENARIOS['mock-safeway-01'];

    let totalCents = base.totalCents ?? 0;
    if (corrupt && !retryHint) {
      totalCents = (base.subtotalCents ?? 0) + 999;
    }

    const result = ExtractionResultSchema.parse({
      ...base,
      purchasedAt: base.purchasedAt ?? null,
      totalCents,
      confidence: corrupt && !retryHint ? 0.4 : base.confidence,
    });

    return {
      result,
      model: 'mock-extractor-v1',
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  private parseJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Model returned no JSON object');
    return JSON.parse(raw.slice(start, end + 1));
  }
}
