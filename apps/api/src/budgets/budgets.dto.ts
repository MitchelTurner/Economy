import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const CreateBudgetSchema = z.object({
  categoryId: z.string().nullable().optional(),
  period: z.enum(['WEEKLY', 'MONTHLY']).default('MONTHLY'),
  amountCents: z.number().int().positive(),
  startsOn: z.string().datetime(),
  endsOn: z.string().datetime().nullable().optional(),
});

@ZodBody(CreateBudgetSchema)
export class CreateBudgetDto {
  categoryId?: string | null;
  period!: 'WEEKLY' | 'MONTHLY';
  amountCents!: number;
  startsOn!: string;
  endsOn?: string | null;
}

export const PatchBudgetSchema = CreateBudgetSchema.partial();

@ZodBody(PatchBudgetSchema)
export class PatchBudgetDto {
  categoryId?: string | null;
  period?: 'WEEKLY' | 'MONTHLY';
  amountCents?: number;
  startsOn?: string;
  endsOn?: string | null;
}
