import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const CreateAlertSchema = z
  .object({
    productId: z.string().min(1),
    dropPct: z.number().positive().max(90).nullish(),
    targetCents: z.number().int().positive().nullish(),
  })
  .refine((v) => v.dropPct != null || v.targetCents != null, {
    message: 'Provide dropPct and/or targetCents',
  });

@ZodBody(CreateAlertSchema)
export class CreateAlertDto {
  productId!: string;
  dropPct?: number | null;
  targetCents?: number | null;
}

export const PatchAlertSchema = z.object({
  active: z.boolean(),
});

@ZodBody(PatchAlertSchema)
export class PatchAlertDto {
  active!: boolean;
}
