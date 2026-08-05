import { z } from 'zod';
import { ZodBody } from '../common/pipes/zod-validation.pipe';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
  householdName: z.string().min(1).max(120).optional(),
  rememberNetwork: z.boolean().optional(),
});

@ZodBody(RegisterSchema)
export class RegisterDto {
  email!: string;
  password!: string;
  displayName?: string;
  householdName?: string;
  rememberNetwork?: boolean;
}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Persist email for this client IP so return visits can prefill (never stores password). */
  rememberNetwork: z.boolean().optional(),
});

@ZodBody(LoginSchema)
export class LoginDto {
  email!: string;
  password!: string;
  rememberNetwork?: boolean;
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

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

@ZodBody(ChangePasswordSchema)
export class ChangePasswordDto {
  currentPassword!: string;
  newPassword!: string;
}

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

@ZodBody(ForgotPasswordSchema)
export class ForgotPasswordDto {
  email!: string;
}

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(8).max(128),
});

@ZodBody(ResetPasswordSchema)
export class ResetPasswordDto {
  token!: string;
  newPassword!: string;
}
