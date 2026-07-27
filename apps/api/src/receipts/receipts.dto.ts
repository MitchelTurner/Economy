import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';
import { ReceiptStatus } from '@prisma/client';

export const UploadUrlSchema = z.object({
  contentType: z.string().default('image/jpeg'),
  extension: z.string().default('jpg'),
});

@ZodBody(UploadUrlSchema)
export class UploadUrlDto {
  contentType!: string;
  extension!: string;
}

export const RegisterReceiptSchema = z.object({
  imageKey: z.string().min(1),
  imageHash: z.string().min(16),
  /** Optional base64 payload when using memory:// upload fallback */
  imageBase64: z.string().optional(),
});

@ZodBody(RegisterReceiptSchema)
export class RegisterReceiptDto {
  imageKey!: string;
  imageHash!: string;
  imageBase64?: string;
}

export const ManualReceiptSchema = z.object({
  storeName: z.string().optional(),
  purchasedAt: z.string().datetime().optional(),
  taxCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int(),
  paymentMethod: z.string().optional(),
  lines: z
    .array(
      z.object({
        rawText: z.string().min(1),
        quantity: z.number().positive().default(1),
        unitPriceCents: z.number().int().nullable().optional(),
        extendedCents: z.number().int(),
        discountCents: z.number().int().default(0),
        categorySlug: z.string().optional(),
      }),
    )
    .min(1),
});

@ZodBody(ManualReceiptSchema)
export class ManualReceiptDto {
  storeName?: string;
  purchasedAt?: string;
  taxCents!: number;
  totalCents!: number;
  paymentMethod?: string;
  lines!: Array<{
    rawText: string;
    quantity: number;
    unitPriceCents?: number | null;
    extendedCents: number;
    discountCents: number;
    categorySlug?: string;
  }>;
}

export const PatchReceiptSchema = z.object({
  storeId: z.string().optional(),
  purchasedAt: z.string().datetime().nullable().optional(),
  subtotalCents: z.number().int().nullable().optional(),
  taxCents: z.number().int().nullable().optional(),
  totalCents: z.number().int().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
});

@ZodBody(PatchReceiptSchema)
export class PatchReceiptDto {
  storeId?: string;
  purchasedAt?: string | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  paymentMethod?: string | null;
}

export const PatchLineSchema = z.object({
  rawText: z.string().optional(),
  quantity: z.number().positive().optional(),
  unitPriceCents: z.number().int().nullable().optional(),
  extendedCents: z.number().int().optional(),
  discountCents: z.number().int().optional(),
  categoryId: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
});

@ZodBody(PatchLineSchema)
export class PatchLineDto {
  rawText?: string;
  quantity?: number;
  unitPriceCents?: number | null;
  extendedCents?: number;
  discountCents?: number;
  categoryId?: string | null;
  productId?: string | null;
}

export const AddLineSchema = z.object({
  rawText: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPriceCents: z.number().int().nullable().optional(),
  extendedCents: z.number().int(),
  discountCents: z.number().int().default(0),
  categoryId: z.string().nullable().optional(),
});

@ZodBody(AddLineSchema)
export class AddLineDto {
  rawText!: string;
  quantity!: number;
  unitPriceCents?: number | null;
  extendedCents!: number;
  discountCents!: number;
  categoryId?: string | null;
}

export const ConfirmReceiptSchema = z.object({
  overrideArithmetic: z.boolean().optional().default(false),
});

@ZodBody(ConfirmReceiptSchema)
export class ConfirmReceiptDto {
  overrideArithmetic!: boolean;
}

export const ListReceiptsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  storeId: z.string().optional(),
  status: z.nativeEnum(ReceiptStatus).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
