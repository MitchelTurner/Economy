import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
  householdName: z.string().min(1).max(120).optional(),
});

@ZodBody(RegisterSchema)
export class RegisterDto {
  email!: string;
  password!: string;
  displayName?: string;
  householdName?: string;
}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@ZodBody(LoginSchema)
export class LoginDto {
  email!: string;
  password!: string;
}

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

@ZodBody(RefreshSchema)
export class RefreshDto {
  refreshToken!: string;
}

export const UpdateMeSchema = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    emailDigest: z.boolean().optional(),
    emailAlerts: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.emailDigest !== undefined ||
      v.emailAlerts !== undefined,
    { message: 'Provide at least one field to update' },
  );

@ZodBody(UpdateMeSchema)
export class UpdateMeDto {
  displayName?: string;
  emailDigest?: boolean;
  emailAlerts?: boolean;
}
