import { z } from 'zod';

export const ExtractionLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  rawText: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nullable(),
  extendedCents: z.number().int(),
  discountCents: z.number().int().default(0),
  isTaxable: z.boolean().default(false),
  isRefund: z.boolean().default(false),
  guessedCategory: z.string().nullable().default(null),
});

export const ExtractionResultSchema = z.object({
  store: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
  }),
  purchasedAt: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  currency: z.literal('USD'),
  subtotalCents: z.number().int().nullable(),
  taxCents: z.number().int().nullable(),
  totalCents: z.number().int().nullable(),
  lines: z.array(ExtractionLineSchema).min(1),
  confidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ExtractionLine = z.infer<typeof ExtractionLineSchema>;
