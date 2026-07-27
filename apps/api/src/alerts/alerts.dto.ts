import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const CreateAlertSchema = z
  .object({
    productId: z.string().min(1),
    dropPct: z.number().positive().max(90).optional(),
    targetCents: z.number().int().positive().optional(),
  })
  .refine((v) => v.dropPct != null || v.targetCents != null, {
    message: 'Provide dropPct and/or targetCents',
  });

@ZodBody(CreateAlertSchema)
export class CreateAlertDto {
  productId!: string;
  dropPct?: number;
  targetCents?: number;
}
