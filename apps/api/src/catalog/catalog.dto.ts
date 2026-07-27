import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const CreateProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  gtin: z.string().optional(),
  sizeValue: z.number().positive().optional(),
  sizeUom: z.string().optional(),
  baseUom: z.string().optional(),
  baseFactor: z.number().positive().optional(),
  isStoreBrand: z.boolean().optional(),
  categoryId: z.string().min(1),
});

@ZodBody(CreateProductSchema)
export class CreateProductDto {
  name!: string;
  brand?: string;
  gtin?: string;
  sizeValue?: number;
  sizeUom?: string;
  baseUom?: string;
  baseFactor?: number;
  isStoreBrand?: boolean;
  categoryId!: string;
}

export const CreateAliasSchema = z.object({
  rawText: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().nullable().optional(),
});

@ZodBody(CreateAliasSchema)
export class CreateAliasDto {
  rawText!: string;
  productId!: string;
  storeId?: string | null;
}

export const CreateStoreSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(200).optional(),
  region: z.string().max(80).optional().default('ketchikan'),
  chain: z.string().max(80).optional(),
});

@ZodBody(CreateStoreSchema)
export class CreateStoreDto {
  name!: string;
  address?: string;
  region!: string;
  chain?: string;
}
