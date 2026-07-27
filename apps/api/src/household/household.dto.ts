import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const InviteSchema = z.object({
  email: z.string().email(),
});

@ZodBody(InviteSchema)
export class InviteDto {
  email!: string;
}

export const AcceptInviteSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
  /** Required when the invitee already belongs to another household with data. */
  moveHousehold: z.boolean().optional().default(false),
});

@ZodBody(AcceptInviteSchema)
export class AcceptInviteDto {
  token!: string;
  password!: string;
  displayName?: string;
  moveHousehold?: boolean;
}
