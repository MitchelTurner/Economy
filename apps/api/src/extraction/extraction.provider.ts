import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ExtractionResult, ExtractionResultSchema } from './extraction.schema';

export type ExtractionCallResult = {
  result: ExtractionResult;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM_PROMPT = `You extract structured grocery receipt data from images.
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
    "rawText": string (verbatim as printed — do not clean or expand abbreviations),
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
Money fields are integer cents. Line extendedCents must sum (minus discounts) + tax ≈ totalCents.`;

@Injectable()
export class ExtractionProvider {
  private readonly anthropic: Anthropic | null;
  private readonly model: string;
  private readonly providerMode: string;
  private readonly allowMock: boolean;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = key ? new Anthropic({ apiKey: key }) : null;
    this.model = config.get('EXTRACTION_MODEL') ?? 'claude-sonnet-4-20250514';
    this.providerMode = config.get('EXTRACTION_PROVIDER') ?? (key ? 'anthropic' : 'mock');
    this.allowMock =
      (config.get('ALLOW_MOCK_EXTRACTION') ?? 'true').toLowerCase() !== 'false';
    const nodeEnv = (config.get('NODE_ENV') ?? process.env.NODE_ENV ?? 'development').toLowerCase();
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
    if (this.providerMode === 'mock' || !this.anthropic) {
      if (!this.allowMock && this.providerMode !== 'mock') {
        throw new Error('ANTHROPIC_API_KEY missing and mock extraction is disabled');
      }
      return this.mockExtract(imageBytes, retryHint);
    }

    const userText = retryHint
      ? `Your previous output failed arithmetic check: ${retryHint}. Re-extract carefully.`
      : 'Extract the receipt into the JSON schema.';

    const response = await this.anthropic.messages.create({
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

  /** Deterministic mock for local/dev and tests. Hash-influenced totals stay arithmetic-valid. */
  mockExtract(imageBytes: Buffer, retryHint?: string): ExtractionCallResult {
    const corrupt = imageBytes.toString('utf8').includes('CORRUPT_EXTRACTION');
    const lines = [
      {
        lineNumber: 1,
        rawText: 'GV MLK WHL 1GA',
        quantity: 1,
        unitPriceCents: 549,
        extendedCents: 549,
        discountCents: 0,
        isTaxable: false,
        isRefund: false,
        guessedCategory: 'dairy',
      },
      {
        lineNumber: 2,
        rawText: 'BANANAS',
        quantity: 2.14,
        unitPriceCents: 79,
        extendedCents: 169,
        discountCents: 0,
        isTaxable: false,
        isRefund: false,
        guessedCategory: 'produce',
      },
      {
        lineNumber: 3,
        rawText: 'EGGS LG 12CT',
        quantity: 1,
        unitPriceCents: 429,
        extendedCents: 429,
        discountCents: 0,
        isTaxable: false,
        isRefund: false,
        guessedCategory: 'dairy',
      },
    ];

    const subtotal = lines.reduce((s, l) => s + l.extendedCents - l.discountCents, 0);
    const taxCents = 0;
    let totalCents = subtotal + taxCents;

    if (corrupt && !retryHint) {
      totalCents = subtotal + 999; // intentional fail for acceptance criterion
    }

    const result = ExtractionResultSchema.parse({
      store: { name: 'Safeway', address: '2417 Tongass Ave' },
      purchasedAt: new Date().toISOString(),
      paymentMethod: 'VISA',
      currency: 'USD',
      subtotalCents: subtotal,
      taxCents,
      totalCents,
      lines,
      confidence: corrupt && !retryHint ? 0.4 : 0.92,
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
